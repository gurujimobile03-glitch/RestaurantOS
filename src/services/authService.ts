import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseConfig } from '../config/firebase';
import { AppUser, UserProfile } from '../types/auth';

/**
 * Transforms a FirebaseUser instance into a sanitized AppUser.
 */
function toAppUser(firebaseUser: FirebaseUser): AppUser {
  const isGoogle = firebaseUser.providerData?.some((p) => p.providerId === 'google.com');
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
    photoURL: firebaseUser.photoURL,
    isAnonymous: firebaseUser.isAnonymous,
    emailVerified: firebaseUser.emailVerified || isGoogle,
    providerData: firebaseUser.providerData?.map((p) => ({ providerId: p.providerId }))
  };
}

/**
 * Signs in a user using Firebase Authentication with Email & Password.
 * Strictly uses Firebase Auth as the source of truth — no mock bypasses.
 */
export async function loginWithEmail(email: string, password: string): Promise<AppUser> {
  const cleanEmail = email.trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  return toAppUser(credential.user);
}

/**
 * Registers a new user account with Firebase Authentication and provisions their profile document.
 */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<AppUser> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = displayName.trim();

  const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  const user = credential.user;

  if (cleanName) {
    await updateProfile(user, { displayName: cleanName });
  }

  // Provision user profile in Firestore
  const userRef = doc(db, 'users', user.uid);
  const profile: UserProfile = {
    userId: user.uid,
    displayName: cleanName || cleanEmail.split('@')[0] || 'Admin',
    email: cleanEmail,
    photoUrl: user.photoURL || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(userRef, profile, { merge: true });

  return toAppUser(user);
}

/**
 * Safe, structured diagnostic logger adhering strictly to the required format:
 * [RestaurantOS Google Auth Debug]
 * Runtime Origin:
 * Runtime Host:
 * Firebase Project:
 * Auth Domain:
 * Auth Method:
 * Error Code:
 * Error Message:
 * Redirect Result:
 * Authenticated UID:
 *
 * NEVER logs passwords, access tokens, refresh tokens, or OAuth secrets.
 */
export function logAuthDebug(info: {
  authMethod?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  redirectResult?: string | null;
  authenticatedUid?: string | null;
}) {
  const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : 'N/A';
  const runtimeHost = typeof window !== 'undefined' ? window.location.host : 'N/A';

  console.log('[RestaurantOS Google Auth Debug]');
  console.log('Runtime Origin:', runtimeOrigin);
  console.log('Runtime Host:', runtimeHost);
  console.log('Firebase Project:', firebaseConfig.projectId);
  console.log('Auth Domain:', firebaseConfig.authDomain);
  console.log('Auth Method:', info.authMethod ?? 'N/A');
  console.log('Error Code:', info.errorCode ?? 'None');
  console.log('Error Message:', info.errorMessage ?? 'None');
  console.log('Redirect Result:', info.redirectResult ?? 'None');
  console.log('Authenticated UID:', info.authenticatedUid ?? 'None');
}

/**
 * Ensures user profile document exists in Firestore for the authenticated user.
 */
async function ensureUserProfile(user: FirebaseUser): Promise<void> {
  const userRef = doc(db, 'users', user.uid);
  const existingSnap = await getDoc(userRef);

  if (!existingSnap.exists()) {
    const profile: UserProfile = {
      userId: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'Admin',
      email: user.email || '',
      photoUrl: user.photoURL || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(userRef, profile, { merge: true });
    console.log('[RestaurantOS Google Auth Debug] Provisioned user profile document for user:', user.uid);
  }
}

let redirectProcessingPromise: Promise<AppUser | null> | null = null;

/**
 * Processes any pending redirect authentication result on application startup.
 * Returns the authenticated AppUser if a redirect flow just completed, or null if normal start.
 * Memoized so it runs at most once per application load to prevent redirect loops.
 */
export async function processRedirectResult(): Promise<AppUser | null> {
  if (redirectProcessingPromise) {
    return redirectProcessingPromise;
  }

  redirectProcessingPromise = (async () => {
    try {
      const credential = await getRedirectResult(auth, browserPopupRedirectResolver);
      if (!credential) {
        logAuthDebug({
          authMethod: 'getRedirectResult',
          redirectResult: 'None (no pending redirect in flight)',
          authenticatedUid: null
        });
        return null;
      }

      const user = credential.user;
      logAuthDebug({
        authMethod: 'getRedirectResult',
        redirectResult: 'Success',
        authenticatedUid: user.uid
      });

      await ensureUserProfile(user);
      return toAppUser(user);
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-supported-in-this-environment') {
        // Headless test runners, web workers, or unsupported environments
        return null;
      }

      logAuthDebug({
        authMethod: 'getRedirectResult',
        errorCode: err?.code ?? 'unknown',
        errorMessage: err?.message ?? 'Redirect authentication failed',
        redirectResult: 'Failed'
      });
      throw err;
    }
  })();

  return redirectProcessingPromise;
}

/**
 * Authenticates via Google Sign-In with popup as primary and redirect as fallback.
 * Strictly adheres to safe debug logging requirements.
 */
export async function loginWithGoogle(forceRedirect = false): Promise<AppUser | void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const authMethod = forceRedirect ? 'signInWithRedirect' : 'signInWithPopup';

  logAuthDebug({
    authMethod,
    errorCode: null,
    errorMessage: null,
    redirectResult: null,
    authenticatedUid: null
  });

  if (forceRedirect) {
    await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
    return;
  }

  try {
    const credential = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    const user = credential.user;

    logAuthDebug({
      authMethod: 'signInWithPopup',
      authenticatedUid: user.uid
    });

    await ensureUserProfile(user);
    return toAppUser(user);
  } catch (err: any) {
    const code = err?.code ?? 'unknown';
    const message = err?.message ?? 'Unknown authentication error';

    logAuthDebug({
      authMethod: 'signInWithPopup',
      errorCode: code,
      errorMessage: message
    });

    // If popup was blocked or unavailable
    const isPopupBlocked =
      code === 'auth/popup-blocked' ||
      code === 'auth/cancelled-popup-request' ||
      (typeof message === 'string' && message.toLowerCase().includes('popup'));

    if (isPopupBlocked) {
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
      if (isInIframe) {
        const iframeErr: any = new Error(
          'Google Sign-In popup was blocked. Inside an iframe preview, popups or redirects may be restricted by the browser. Opening in a top-level tab is recommended.'
        );
        iframeErr.code = 'auth/popup-blocked';
        throw iframeErr;
      }

      logAuthDebug({
        authMethod: 'signInWithRedirect (fallback from blocked popup)'
      });
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
      return;
    }

    throw err;
  }
}

/**
 * Terminates the authenticated Firebase session.
 */
export async function logout(): Promise<void> {
  await signOut(auth);
}

/**
 * Retrieves the stored user profile from Firestore.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch user profile:', err);
    return null;
  }
}

/**
 * Persists the linked restaurantId to the user's profile in Firestore.
 */
export async function updateUserProfileRestaurantId(
  userId: string,
  restaurantId: string
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      {
        restaurantId,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
    console.log('[RestaurantOS Debug] Successfully linked restaurantId to user profile:', {
      userId,
      restaurantId
    });
  } catch (err) {
    console.warn('[RestaurantOS Debug] Failed to persist restaurantId link to profile:', err);
  }
}

/**
 * Subscribes to real Firebase Authentication state changes.
 * Firebase Auth is the SOLE authority for user identity.
 */
export function subscribeToAuth(callback: (user: AppUser | null) => void) {
  return onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      callback(toAppUser(firebaseUser));
    } else {
      callback(null);
    }
  });
}

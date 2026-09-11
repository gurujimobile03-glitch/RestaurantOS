import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { Restaurant, RestaurantFormData } from '../types/restaurant';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { enforcePermission } from '../utils/permissions';

export async function getRestaurantById(restaurantId: string): Promise<Restaurant | null> {
  console.log('[RestaurantOS Debug] getRestaurantById lookup:', {
    restaurantId,
    docPath: `restaurants/${restaurantId}`
  });
  try {
    const ref = doc(db, 'restaurants', restaurantId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.log('[RestaurantOS Debug] getRestaurantById document not found:', `restaurants/${restaurantId}`);
      return null;
    }
    const data = { restaurantId: snap.id, ...snap.data() } as Restaurant;
    console.log('[RestaurantOS Debug] getRestaurantById found restaurant:', {
      restaurantId: data.restaurantId,
      name: data.name,
      ownerId: data.ownerId
    });
    return data;
  } catch (error: any) {
    // In Firestore security rules (allow read: if resource.data.ownerId == request.auth.uid),
    // looking up a non-existent document or a document owned by another user returns 'permission-denied'
    // because resource is null on non-existent documents. Treat permission-denied as not found.
    if (error?.code === 'permission-denied') {
      console.log('[RestaurantOS Debug] getRestaurantById: document non-existent or inaccessible for current user:', `restaurants/${restaurantId}`);
      return null;
    }
    console.error('[RestaurantOS Debug] getRestaurantById error on path:', `restaurants/${restaurantId}`, error);
    throw handleFirestoreError(error, OperationType.GET, `restaurants/${restaurantId}`);
  }
}

export async function getRestaurantsForUser(userId: string): Promise<Restaurant[]> {
  if (!auth.currentUser) {
    console.warn('[RestaurantOS Debug] getRestaurantsForUser called without active auth user');
    return [];
  }

  console.log('[RestaurantOS Debug] getRestaurantsForUser query:', {
    collection: 'restaurants',
    queryFilter: `ownerId == ${userId}`,
    authUid: auth.currentUser.uid
  });

  try {
    const q = query(
      collection(db, 'restaurants'),
      where('ownerId', '==', userId)
    );
    const snap = await getDocs(q);
    const list: Restaurant[] = [];
    snap.forEach((d) => {
      list.push({ restaurantId: d.id, ...d.data() } as Restaurant);
    });
    console.log('[RestaurantOS Debug] getRestaurantsForUser result count:', list.length, 'restaurants:', list.map(r => ({ id: r.restaurantId, name: r.name })));
    return list;
  } catch (error: any) {
    // If collection listing is restricted by Firestore security rules, log as non-blocking warning and return empty list
    if (error?.code === 'permission-denied') {
      console.warn('[RestaurantOS Debug] getRestaurantsForUser query not permitted by current Firestore rules. Falling back to direct user profile pointer.');
      return [];
    }
    console.error('[RestaurantOS Debug] getRestaurantsForUser error on query:', error);
    throw handleFirestoreError(error, OperationType.LIST, 'restaurants');
  }
}

export async function getOrCreateInitialRestaurant(
  userId: string,
  userEmail: string,
  ownerName: string
): Promise<Restaurant> {
  if (!userId) {
    throw new Error('User ID is required for initial restaurant provisioning');
  }

  const cleanOwnerFirstName = ownerName ? ownerName.split(' ')[0] : 'Owner';
  const sanitizeId = userId.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const initDocId = `rest_init_${sanitizeId}`;
  const initRestRef = doc(db, 'restaurants', initDocId);
  const userRef = doc(db, 'users', userId);

  // 1. Pre-check: Check if user already owns any restaurant via collection query
  try {
    const existingList = await getRestaurantsForUser(userId);
    if (existingList && existingList.length > 0) {
      const existing = existingList[0];
      console.log('[RestaurantOS Idempotency] Existing owned restaurant found during pre-check:', {
        restaurantId: existing.restaurantId,
        ownerId: userId
      });
      try {
        await setDoc(userRef, { restaurantId: existing.restaurantId, initialRestaurantId: existing.restaurantId }, { merge: true });
      } catch (linkErr) {
        console.warn('[RestaurantOS Idempotency] Failed to reconcile user profile pointer:', linkErr);
      }
      return existing;
    }
  } catch (queryErr) {
    console.warn('[RestaurantOS Idempotency] Pre-check list query warning:', queryErr);
  }

  // 2. Perform atomic, transaction-backed provisioning guard
  try {
    const result = await runTransaction(db, async (transaction) => {
      // Re-verify user profile
      const userSnap = await transaction.get(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const profileRestId = userData.restaurantId || userData.initialRestaurantId;
        if (profileRestId) {
          const profileRestRef = doc(db, 'restaurants', profileRestId);
          const profileRestSnap = await transaction.get(profileRestRef);
          if (profileRestSnap.exists()) {
            console.log('[RestaurantOS Idempotency] Transaction resolved existing restaurant via user profile:', profileRestId);
            return { restaurantId: profileRestSnap.id, ...profileRestSnap.data() } as Restaurant;
          }
        }
      }

      // Re-verify deterministic initial restaurant document
      const initRestSnap = await transaction.get(initRestRef);
      if (initRestSnap.exists()) {
        console.log('[RestaurantOS Idempotency] Transaction resolved existing deterministic restaurant document:', initDocId);
        const initData = { restaurantId: initRestSnap.id, ...initRestSnap.data() } as Restaurant;
        transaction.set(userRef, { restaurantId: initDocId, initialRestaurantId: initDocId }, { merge: true });
        return initData;
      }

      // Neither exists: atomically create initial owner restaurant
      console.log('[RestaurantOS Idempotency] Transaction creating initial owner restaurant document:', initDocId);
      const newRestaurant: Restaurant = {
        restaurantId: initDocId,
        name: `${cleanOwnerFirstName}'s Restaurant`,
        legalName: `${ownerName || 'Owner'} Hospitality LLP`,
        logoUrl: null,
        phone: '+91 98765 43210',
        email: userEmail || 'admin@restaurantos.io',
        address: '124 Prime Market Square, MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
        gstNumber: '29ABCDE1234F1Z5',
        currency: 'INR',
        currencySymbol: '₹',
        timezone: 'Asia/Kolkata',
        taxMode: 'exclusive',
        defaultTaxRate: 5.0,
        ownerId: userId,
        provisioningType: 'initial_owner',
        createdBy: userId,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      transaction.set(initRestRef, newRestaurant);
      transaction.set(userRef, { restaurantId: initDocId, initialRestaurantId: initDocId, role: 'owner' }, { merge: true });

      return newRestaurant;
    });

    return result;
  } catch (txErr: any) {
    console.warn('[RestaurantOS Idempotency] Transaction failed or fell back. Re-checking existing documents:', txErr);
    const retrySnap = await getDoc(initRestRef);
    if (retrySnap.exists()) {
      return { restaurantId: retrySnap.id, ...retrySnap.data() } as Restaurant;
    }
    throw handleFirestoreError(txErr, OperationType.CREATE, `restaurants/${initDocId}`);
  }
}

export async function createDefaultRestaurant(userId: string, userEmail: string, ownerName: string): Promise<Restaurant> {
  return getOrCreateInitialRestaurant(userId, userEmail, ownerName);
}

export async function updateRestaurantProfile(
  restaurantId: string,
  data: Partial<RestaurantFormData>
): Promise<void> {
  await enforcePermission(restaurantId, 'access_restaurant_setup');
  try {
    const ref = doc(db, 'restaurants', restaurantId);
    await updateDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}`);
  }
}

export function subscribeToRestaurant(
  restaurantId: string,
  callback: (restaurant: Restaurant | null) => void,
  onError?: (err: unknown) => void
) {
  const ref = doc(db, 'restaurants', restaurantId);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        callback({ restaurantId: snap.id, ...snap.data() } as Restaurant);
      } else {
        callback(null);
      }
    },
    (err) => {
      // In onSnapshot callbacks, throwing an exception crashes the JS runtime as an Uncaught Error.
      // If auth.currentUser is null, the user has logged out or is unauthenticated; absorb cleanly.
      if (!auth.currentUser) {
        console.log('[RestaurantOS Debug] Restaurant snapshot listener ended after auth logout');
        return;
      }
      console.error('[RestaurantOS Debug] Restaurant snapshot error:', err);
      if (onError) onError(err);
    }
  );
}

export async function createRestaurantBranch(
  userId: string,
  userEmail: string,
  branchName: string,
  city: string,
  country: string = 'India'
): Promise<Restaurant> {
  try {
    const restaurantRef = doc(collection(db, 'restaurants'));
    const newRestaurant: Restaurant = {
      restaurantId: restaurantRef.id,
      name: branchName,
      legalName: `${branchName} Group`,
      logoUrl: null,
      phone: '+91 98765 43210',
      email: userEmail || 'admin@restaurantos.io',
      address: 'Shop 101, Main Street',
      city: city,
      state: '',
      postalCode: '',
      country: country,
      gstNumber: '29ABCDE1234F1Z5',
      currency: 'INR',
      currencySymbol: '₹',
      timezone: 'Asia/Kolkata',
      taxMode: 'exclusive',
      defaultTaxRate: 5.0,
      ownerId: userId,
      provisioningType: 'explicit_outlet',
      createdBy: userId,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    console.log('[RestaurantOS Debug] createRestaurantBranch writing to path:', `restaurants/${restaurantRef.id}`, {
      restaurantId: restaurantRef.id,
      ownerId: userId,
      provisioningType: 'explicit_outlet'
    });

    await setDoc(restaurantRef, newRestaurant);
    return newRestaurant;
  } catch (error) {
    console.error('[RestaurantOS Debug] createRestaurantBranch error:', error);
    throw handleFirestoreError(error, OperationType.CREATE, 'restaurants');
  }
}

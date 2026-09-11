import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  collectionGroup,
  serverTimestamp
} from 'firebase/firestore';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import QRCode from 'qrcode';
import { db, auth, firebaseConfig } from '../config/firebase';
import { RestaurantMember, StaffRole, UserProfile } from '../types/auth';
import { getPublicAppOrigin } from '../utils/urlUtils';
import { enforcePermission } from '../utils/permissions';
import { auditService } from './auditService';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';

export interface AddStaffResult {
  member: RestaurantMember;
  invitationStatus: 'inviting' | 'invitation_sent' | 'invitation_failed' | 'pending_setup' | 'active' | 'expired' | 'revoked';
  message: string;
  initialPassword?: string;
  qrCodeDataUrl?: string;
  firebaseEmailSent?: boolean;
}

export interface InvitationDetails {
  invitation: RestaurantMember;
  restaurantName: string;
  isExpired: boolean;
  isRevoked: boolean;
  isAccepted: boolean;
}

/**
 * Generates a high-entropy single-use cryptographically secure token for staff invitations.
 */
export function generateInvitationToken(): string {
  const time = Date.now().toString(36);
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      return `inv_tok_${hex}_${time}`;
    }
    if (typeof crypto.randomUUID === 'function') {
      return 'inv_tok_' + crypto.randomUUID().replace(/-/g, '') + '_' + time;
    }
  }
  const rand1 = Math.random().toString(36).substring(2, 15);
  const rand2 = Math.random().toString(36).substring(2, 15);
  return 'inv_tok_' + time + '_' + rand1 + '_' + rand2;
}

/**
 * Generates a non-reversible cryptographic fingerprint of a token for safe audit logging
 * without leaking raw token credentials into logs or databases.
 */
export function createTokenFingerprint(token: string): string {
  if (!token || typeof token !== 'string') return '';
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash) + token.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const tail = token.length > 6 ? token.slice(-4) : '****';
  return `tok_fp_${hex}_${tail}`;
}

export class StaffService {
  /**
   * Generates a high-entropy single-use token for staff invitations.
   */
  generateInvitationToken(): string {
    return generateInvitationToken();
  }

  /**
   * Retrieves all staff members assigned to a restaurant.
   * Scoped strictly to `restaurants/{restaurantId}/members`.
   */
  async getStaffMembers(restaurantId: string): Promise<RestaurantMember[]> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required to retrieve staff members.');
    }

    await enforcePermission(cleanRestaurantId, 'access_staff');

    try {
      const membersCol = collection(db, 'restaurants', cleanRestaurantId, 'members');
      const snap = await getDocs(membersCol);
      const members: RestaurantMember[] = snap.docs.map((d) => {
        const data = d.data();
        const memberUserId = data.userId || (d.id.startsWith('staff_') || d.id.startsWith('invitation_') ? '' : d.id);
        const isAuthLinked = Boolean(data.authLinked || (memberUserId && !memberUserId.startsWith('staff_') && !memberUserId.startsWith('invitation_')));
        
        let calculatedStatus: 'active' | 'inactive' | 'pending_setup' | 'expired' | 'revoked' = 'active';
        if (data.status === 'revoked' || data.invitationStatus === 'revoked') {
          calculatedStatus = 'revoked';
        } else if (data.status === 'expired' || data.invitationStatus === 'expired') {
          calculatedStatus = 'expired';
        } else if (data.isActive === false || data.status === 'inactive') {
          calculatedStatus = 'inactive';
        } else if (!isAuthLinked || data.status === 'pending_setup') {
          calculatedStatus = 'pending_setup';
        }

        return {
          memberId: d.id,
          restaurantId: cleanRestaurantId,
          userId: memberUserId || '',
          role: data.role as StaffRole,
          isActive: data.isActive !== false && data.status !== 'inactive' && data.status !== 'revoked',
          status: calculatedStatus,
          authLinked: isAuthLinked,
          displayName: data.displayName || 'Staff Member',
          email: data.email || '',
          invitedBy: data.invitedBy,
          invitationToken: data.invitationToken,
          invitationUrl: data.invitationUrl,
          expiresAt: data.expiresAt,
          invitationStatus: data.invitationStatus || (isAuthLinked ? 'active' : 'pending_setup'),
          invitationError: data.invitationError || null,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
      });

      // Also ensure the restaurant owner is represented if not already in subcollection
      const restDoc = await getDoc(doc(db, 'restaurants', cleanRestaurantId));
      if (restDoc.exists()) {
        const restData = restDoc.data();
        const ownerId = restData.ownerId;
        const hasOwnerInList = members.some((m) => m.userId === ownerId || m.role === 'owner');
        if (ownerId && !hasOwnerInList) {
          members.unshift({
            memberId: ownerId,
            restaurantId: cleanRestaurantId,
            userId: ownerId,
            role: 'owner',
            isActive: true,
            status: 'active',
            authLinked: true,
            isOwner: true,
            displayName: restData.legalName || 'Restaurant Owner',
            email: restData.email || '',
            invitationStatus: 'active',
            createdAt: restData.createdAt,
            updatedAt: restData.updatedAt
          });
        }
      }

      return members;
    } catch (err) {
      const errCode = (err as any)?.code;
      if (errCode === 'permission-denied' || errCode === 'unavailable') {
        console.warn('[RestaurantOS] Staff list restricted by Firestore rules. Operating with empty staff list.');
        return [];
      }
      throw handleFirestoreError(err, OperationType.LIST, `restaurants/${cleanRestaurantId}/members`);
    }
  }

  /**
   * Generates a QR Code Data URL for instant staff login scanning.
   */
  async generateStaffQRCode(email: string): Promise<string> {
    const origin = getPublicAppOrigin();
    const loginUrl = `${origin}/login?email=${encodeURIComponent(email)}`;
    try {
      return await QRCode.toDataURL(loginUrl, {
        width: 320,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
    } catch (err) {
      console.warn('[RestaurantOS] Failed to generate staff QR code:', err);
      return '';
    }
  }

  /**
   * Creates a pending staff invitation.
   * STRICT SECURITY ARCHITECTURE MANDATE:
   * - Does NOT create Firebase Auth user accounts.
   * - Does NOT search or mutate `/users/{uid}` profiles.
   * - Does NOT set status to 'active' or isActive to true.
   * - Creates a pending invitation document locked to role and restaurantId.
   */
  async addStaffMember(
    restaurantId: string,
    input: {
      email: string;
      displayName: string;
      role: StaffRole;
      initialPassword?: string;
      userId?: string;
    }
  ): Promise<AddStaffResult> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required to add a staff member.');
    }

    await enforcePermission(cleanRestaurantId, 'manage_staff');

    const cleanEmail = input.email?.trim().toLowerCase();
    const cleanName = input.displayName?.trim();

    if (!cleanName || cleanName.length < 2) {
      throw new Error('Staff member display name must be at least 2 characters.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      throw new Error('Please provide a valid email address.');
    }

    const validRoles: StaffRole[] = ['manager', 'cashier', 'kitchen', 'captain', 'accountant'];
    if (!validRoles.includes(input.role)) {
      throw new Error(
        `Invalid staff role "${input.role}". Permitted roles: ${validRoles.join(', ')}`
      );
    }

    // Generate high-entropy single-use invitation token and 7-day expiration
    const cleanToken = generateInvitationToken();
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const invitationId = `inv_${cleanToken.substring(8, 24)}`;
    const origin = getPublicAppOrigin();
    const invitationUrl = `${origin}/accept-invitation?token=${cleanToken}`;

    let qrCodeDataUrl = '';
    try {
      qrCodeDataUrl = await QRCode.toDataURL(invitationUrl, {
        width: 320,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
    } catch (qrErr) {
      console.warn('[RestaurantOS] Failed to generate QR code data URL:', qrErr);
    }

    try {
      const memberRef = doc(db, 'restaurants', cleanRestaurantId, 'members', invitationId);

      // Step 1: Write pending invitation document into Firestore first with pending_setup status
      const pendingMember: RestaurantMember = {
        memberId: invitationId,
        userId: '',
        restaurantId: cleanRestaurantId,
        displayName: cleanName,
        email: cleanEmail,
        role: input.role,
        isActive: false, // Inactive until claimed by authenticated user
        status: 'pending_setup',
        authLinked: false,
        invitationStatus: 'pending_setup',
        invitationError: null,
        invitationToken: cleanToken,
        invitationUrl,
        expiresAt,
        invitedBy: auth.currentUser?.uid || 'owner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(memberRef, pendingMember, { merge: true });

      // Step 2: Attempt email dispatch via authenticated server API endpoint
      let emailSent = false;
      let emailErrorMessage: string | null = null;
      let invitationStatus: 'invitation_sent' | 'invitation_failed' | 'pending_setup' = 'pending_setup';

      try {
        const idToken = typeof auth.currentUser?.getIdToken === 'function' ? await auth.currentUser.getIdToken() : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (idToken) {
          headers['Authorization'] = `Bearer ${idToken}`;
        }

        const apiRes = await fetch('/api/send-invitation-email', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            restaurantId: cleanRestaurantId,
            invitationId,
            toEmail: cleanEmail,
            invitationUrl
          })
        });

        const apiData = await apiRes.json().catch(() => ({}));
        if (apiRes.ok && apiData.success) {
          emailSent = true;
          invitationStatus = 'invitation_sent';
        } else {
          emailSent = false;
          invitationStatus = 'invitation_failed';
          emailErrorMessage = apiData.message || apiData.error || 'Failed to dispatch invitation email';
        }
      } catch (dispatchErr: any) {
        emailSent = false;
        invitationStatus = 'invitation_failed';
        emailErrorMessage = dispatchErr?.message || 'Email dispatch endpoint unreachable';
      }

      // Step 3: Update invitation document with email delivery status
      pendingMember.invitationStatus = invitationStatus;
      pendingMember.invitationError = emailErrorMessage;

      await updateDoc(memberRef, {
        invitationStatus,
        invitationError: emailErrorMessage,
        updatedAt: serverTimestamp()
      });

      // Log audit events (Tokens NEVER exposed in audit metadata — fingerprint only)
      await auditService.logEvent(cleanRestaurantId, {
        entityType: 'staff',
        entityId: invitationId,
        action: 'staff_invitation_created',
        actorUid: auth.currentUser?.uid || 'system',
        metadata: {
          invitationId,
          email: cleanEmail,
          displayName: cleanName,
          role: input.role,
          tokenFingerprint: createTokenFingerprint(cleanToken),
          expiresAt,
          invitationStatus,
          emailSent
        }
      });

      await auditService.logEvent(cleanRestaurantId, {
        entityType: 'staff',
        entityId: invitationId,
        action: 'staff_invitation_sent',
        actorUid: auth.currentUser?.uid || 'system',
        metadata: {
          invitationId,
          email: cleanEmail,
          role: input.role,
          tokenFingerprint: createTokenFingerprint(cleanToken),
          invitationStatus,
          emailSent
        }
      });

      const userMessage = emailSent
        ? `Staff invitation sent via email to ${cleanEmail}.`
        : `Staff invitation link generated for ${cleanEmail}. Share the link or QR code below (${emailErrorMessage || 'Email server dispatch pending configuration'}).`;

      return {
        member: pendingMember,
        invitationStatus,
        message: userMessage,
        qrCodeDataUrl,
        firebaseEmailSent: emailSent
      };
    } catch (err) {
      throw handleFirestoreError(err, OperationType.CREATE, `restaurants/${cleanRestaurantId}/members/${invitationId}`);
    }
  }

  /**
   * Resends an invitation to a staff member.
   * Generates a fresh token and resets expiration timestamp.
   */
  async resendInvitation(
    restaurantId: string,
    memberId: string
  ): Promise<{ success: boolean; message: string; invitationUrl: string }> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanMemberId = memberId?.trim();

    if (!cleanRestaurantId || !cleanMemberId) {
      throw new Error('restaurantId and memberId are required to resend an invitation.');
    }

    await enforcePermission(cleanRestaurantId, 'manage_staff');

    const memberRef = doc(db, 'restaurants', cleanRestaurantId, 'members', cleanMemberId);
    const snap = await getDoc(memberRef);

    if (!snap.exists()) {
      throw new Error('Staff invitation document not found.');
    }

    const data = snap.data();
    const cleanEmail = data.email?.trim().toLowerCase();

    if (!cleanEmail) {
      throw new Error('Staff invitation has no valid email address.');
    }

    const newInvitationToken = generateInvitationToken();
    const origin = getPublicAppOrigin();
    const newInvitationUrl = `${origin}/accept-invitation?token=${newInvitationToken}`;
    const newExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now

    // Step 1: Update member document with refreshed single-use token and expiration
    await updateDoc(memberRef, {
      invitationToken: newInvitationToken,
      invitationUrl: newInvitationUrl,
      expiresAt: newExpiresAt,
      invitationStatus: 'pending_setup',
      status: 'pending_setup',
      updatedAt: serverTimestamp()
    });

    let newInvitationStatus: 'invitation_sent' | 'invitation_failed' | 'pending_setup' = 'pending_setup';
    let newErrorMessage: string | null = null;
    let message = '';

    // Step 2: Attempt email dispatch via authenticated server API endpoint
    try {
      const idToken = typeof auth.currentUser?.getIdToken === 'function' ? await auth.currentUser.getIdToken() : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const apiRes = await fetch('/api/send-invitation-email', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          restaurantId: cleanRestaurantId,
          invitationId: cleanMemberId,
          toEmail: cleanEmail,
          invitationUrl: newInvitationUrl
        })
      });

      const apiData = await apiRes.json().catch(() => ({}));
      if (apiRes.ok && apiData.success) {
        newInvitationStatus = 'invitation_sent';
        message = `Invitation email resent to ${cleanEmail}.`;
      } else {
        newInvitationStatus = 'invitation_failed';
        newErrorMessage = apiData.message || apiData.error || 'Failed to dispatch email';
        message = `Invitation link refreshed for ${cleanEmail}. Share the link or QR code directly (${newErrorMessage}).`;
      }
    } catch (err: any) {
      newInvitationStatus = 'invitation_failed';
      newErrorMessage = err?.message || 'Email dispatch endpoint error';
      message = `Invitation link refreshed for ${cleanEmail}. Share the link or QR code directly.`;
    }

    // Step 3: Record dispatch status
    await updateDoc(memberRef, {
      invitationStatus: newInvitationStatus,
      invitationError: newErrorMessage,
      updatedAt: serverTimestamp()
    });

    // Log audit event (Raw token NEVER logged in audit logs — fingerprint only)
    await auditService.logEvent(cleanRestaurantId, {
      entityType: 'staff',
      entityId: cleanMemberId,
      action: 'staff_invitation_resent',
      actorUid: auth.currentUser?.uid || 'system',
      metadata: {
        memberId: cleanMemberId,
        email: cleanEmail,
        tokenFingerprint: createTokenFingerprint(newInvitationToken),
        expiresAt: newExpiresAt,
        invitationStatus: newInvitationStatus
      }
    });

    return {
      success: newInvitationStatus !== 'invitation_failed',
      message,
      invitationUrl: newInvitationUrl
    };
  }

  /**
   * Revokes an existing pending staff invitation.
   */
  async revokeInvitation(restaurantId: string, memberId: string): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanMemberId = memberId?.trim();

    if (!cleanRestaurantId || !cleanMemberId) {
      throw new Error('restaurantId and memberId are required.');
    }

    await enforcePermission(cleanRestaurantId, 'manage_staff');

    const memberRef = doc(db, 'restaurants', cleanRestaurantId, 'members', cleanMemberId);
    const snap = await getDoc(memberRef);

    if (!snap.exists()) {
      throw new Error('Staff invitation record not found.');
    }

    await updateDoc(memberRef, {
      status: 'revoked',
      invitationStatus: 'revoked',
      isActive: false,
      updatedAt: serverTimestamp()
    });

    // Log audit event
    await auditService.logEvent(cleanRestaurantId, {
      entityType: 'staff',
      entityId: cleanMemberId,
      action: 'staff_invitation_revoked',
      actorUid: auth.currentUser?.uid || 'system',
      metadata: {
        memberId: cleanMemberId
      }
    });
  }

  /**
   * Retrieves invitation details by invitation token across all restaurants.
   */
  async getInvitationByToken(token: string): Promise<InvitationDetails | null> {
    const cleanToken = token?.trim();
    if (!cleanToken) return null;

    try {
      const q = query(
        collectionGroup(db, 'members'),
        where('invitationToken', '==', cleanToken)
      );
      const snap = await getDocs(q);

      if (snap.empty || !snap.docs.length) {
        return null;
      }

      const docSnap = snap.docs[0];
      const data = docSnap.data();
      const restaurantId = data.restaurantId || docSnap.ref.parent.parent?.id;

      let restaurantName = 'RestaurantOS Outlet';
      if (restaurantId) {
        try {
          const restDoc = await getDoc(doc(db, 'restaurants', restaurantId));
          if (restDoc.exists()) {
            restaurantName = restDoc.data()?.name || restDoc.data()?.legalName || restaurantName;
          }
        } catch (restErr) {
          console.warn('[RestaurantOS] Failed to load restaurant name for invitation:', restErr);
        }
      }

      const now = Date.now();
      const expTime = typeof data.expiresAt === 'number' ? data.expiresAt : (data.expiresAt ? new Date(data.expiresAt).getTime() : Infinity);
      const isExpired = !isNaN(expTime) && now > expTime;
      const isRevoked = data.status === 'revoked' || data.invitationStatus === 'revoked' || data.isActive === false;
      const isAccepted = data.status === 'active' || data.invitationStatus === 'active' || Boolean(data.authLinked && data.userId);

      // If expired, update status in Firestore if not already marked
      if (isExpired && data.status !== 'expired' && !isAccepted && !isRevoked) {
        try {
          await updateDoc(docSnap.ref, {
            status: 'expired',
            invitationStatus: 'expired',
            updatedAt: serverTimestamp()
          });

          if (restaurantId) {
            await auditService.logEvent(restaurantId, {
              entityType: 'staff',
              entityId: docSnap.id,
              action: 'staff_invitation_expired',
              actorUid: auth.currentUser?.uid || 'system',
              metadata: {
                tokenFingerprint: createTokenFingerprint(cleanToken),
                email: data.email
              }
            });
          }
        } catch {}
      }

      const invitation: RestaurantMember = {
        memberId: docSnap.id,
        restaurantId: restaurantId || '',
        userId: data.userId || '',
        role: data.role as StaffRole,
        isActive: data.isActive !== false && data.status !== 'revoked' && !isRevoked,
        status: isExpired ? 'expired' : isRevoked ? 'revoked' : isAccepted ? 'active' : 'pending_setup',
        authLinked: Boolean(data.authLinked),
        displayName: data.displayName || 'Staff Member',
        email: data.email || '',
        invitedBy: data.invitedBy,
        invitationToken: cleanToken,
        invitationUrl: data.invitationUrl,
        expiresAt: expTime,
        invitationStatus: isExpired ? 'expired' : isRevoked ? 'revoked' : isAccepted ? 'active' : (data.invitationStatus || 'pending_setup'),
        invitationError: data.invitationError || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };

      return {
        invitation,
        restaurantName,
        isExpired,
        isRevoked,
        isAccepted
      };
    } catch (err) {
      console.warn('[RestaurantOS] Failed to retrieve invitation by token:', err);
      return null;
    }
  }

  /**
   * Claims an invitation using its secure token.
   * Requires authenticated user with verified matching email.
   */
  async claimInvitationWithToken(
    token: string,
    user: {
      uid: string;
      email: string | null;
      displayName: string | null;
      emailVerified?: boolean;
      providerData?: Array<{ providerId: string }>;
    }
  ): Promise<{ restaurantId: string; role: StaffRole }> {
    const details = await this.getInvitationByToken(token);
    if (!details) {
      throw new Error('Invalid or non-existent invitation token.');
    }

    const { invitation, isExpired, isRevoked, isAccepted } = details;

    if (isRevoked) {
      throw new Error('This invitation has been revoked by the restaurant manager.');
    }

    if (isExpired) {
      throw new Error('This invitation link has expired. Please ask your manager for a new invitation.');
    }

    if (!user.uid || !user.email) {
      throw new Error('You must be signed in to accept an invitation.');
    }

    const cleanUserEmail = user.email.trim().toLowerCase();
    const cleanInvitedEmail = invitation.email?.trim().toLowerCase();

    if (cleanUserEmail !== cleanInvitedEmail) {
      throw new Error(
        `Logged in as ${cleanUserEmail}, but this invitation was issued to ${cleanInvitedEmail}. Please sign in with ${cleanInvitedEmail}.`
      );
    }

    // Email verification requirement
    const isGoogleAuth = Boolean(
      user.providerData?.some((p) => p.providerId === 'google.com') ||
      auth.currentUser?.providerData?.some((p) => p.providerId === 'google.com')
    );
    const isEmailVerified = Boolean(
      user.emailVerified ||
      auth.currentUser?.emailVerified ||
      isGoogleAuth
    );

    if (!isEmailVerified) {
      throw new Error('Your email address must be verified before you can claim this staff invitation.');
    }

    const authoritativeRestaurantId = invitation.restaurantId;
    const authoritativeRole = invitation.role;

    // Write membership document at `restaurants/{restaurantId}/members/{user.uid}`
    const memberRef = doc(db, 'restaurants', authoritativeRestaurantId, 'members', user.uid);
    await setDoc(
      memberRef,
      {
        memberId: user.uid,
        userId: user.uid,
        restaurantId: authoritativeRestaurantId,
        displayName: user.displayName || invitation.displayName || 'Staff Member',
        email: cleanUserEmail,
        role: authoritativeRole, // Locked to authoritative invitation role
        isActive: true,
        status: 'active',
        authLinked: true,
        invitationStatus: 'active',
        invitedBy: invitation.invitedBy || 'system',
        createdAt: invitation.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    // If legacy invitation placeholder document existed under a different ID, clean it up or mark accepted
    if (invitation.memberId !== user.uid) {
      try {
        const oldRef = doc(db, 'restaurants', authoritativeRestaurantId, 'members', invitation.memberId);
        await deleteDoc(oldRef);
      } catch (delErr) {
        console.warn('[RestaurantOS] Legacy invitation doc cleanup note:', delErr);
      }
    }

    // Update user profile in `/users/{user.uid}`
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(
        userRef,
        {
          restaurantId: authoritativeRestaurantId,
          role: authoritativeRole,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (profErr) {
      console.warn('[RestaurantOS] Failed to update user profile upon invitation claim:', profErr);
    }

    // Log audit event
    await auditService.logEvent(authoritativeRestaurantId, {
      entityType: 'staff',
      entityId: user.uid,
      action: 'staff_invitation_accepted',
      actorUid: user.uid,
      metadata: {
        memberId: user.uid,
        email: cleanUserEmail,
        role: authoritativeRole,
        tokenFingerprint: createTokenFingerprint(token)
      }
    });

    return {
      restaurantId: authoritativeRestaurantId,
      role: authoritativeRole
    };
  }

  /**
   * Safely claims any pending invitations or unlinked staff records for an authenticated user.
   * Invoked upon authenticated login or session initialization.
   * Enforces strict email verification before identity linking.
   */
  async claimPendingInvitationsForUser(user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified?: boolean;
    providerData?: Array<{ providerId: string }>;
  }): Promise<Array<{ restaurantId: string; role: StaffRole }>> {
    if (!user.uid || !user.email) return [];
    const cleanEmail = user.email.trim().toLowerCase();
    const claimed: Array<{ restaurantId: string; role: StaffRole }> = [];

    // Enforce Email Verification: Must be user.emailVerified === true OR Google OAuth provider
    const isGoogleAuth = Boolean(
      user.providerData?.some((p) => p.providerId === 'google.com') ||
      auth.currentUser?.providerData?.some((p) => p.providerId === 'google.com')
    );
    const isEmailVerified = Boolean(
      user.emailVerified ||
      auth.currentUser?.emailVerified ||
      isGoogleAuth
    );

    if (!isEmailVerified) {
      console.warn(
        `[RestaurantOS Security] Unverified email address "${cleanEmail}" cannot claim staff invitations until email address is verified.`
      );
      return [];
    }

    try {
      // Query collectionGroup 'members' where email matches user's email
      const q = query(
        collectionGroup(db, 'members'),
        where('email', '==', cleanEmail)
      );
      const snap = await getDocs(q);

      for (const memberDoc of snap.docs) {
        const data = memberDoc.data();
        const restaurantId = data.restaurantId || memberDoc.ref.parent.parent?.id;
        if (!restaurantId) continue;

        // Deactivated or revoked invitations cannot be claimed
        const isRevoked = data.status === 'revoked' || data.invitationStatus === 'revoked';
        const isInactive = data.status === 'inactive';
        if (isRevoked || isInactive) continue;

        // Expired invitations cannot be claimed
        if (data.expiresAt) {
          const expTime = typeof data.expiresAt === 'number' ? data.expiresAt : new Date(data.expiresAt).getTime();
          if (!isNaN(expTime) && Date.now() > expTime) {
            console.warn(`[RestaurantOS Security] Invitation for "${cleanEmail}" in restaurant "${restaurantId}" has expired.`);
            continue;
          }
        }

        // Role and restaurantId are strictly locked to the stored invitation
        const authoritativeRole = (data.role as StaffRole) || 'captain';
        const authoritativeRestaurantId = restaurantId;

        // Idempotent claim execution; prevent duplicate active memberships
        if (data.userId === user.uid && memberDoc.id === user.uid) {
          claimed.push({ restaurantId: authoritativeRestaurantId, role: authoritativeRole });
          continue;
        }

        // Write the authoritative linked member document at `restaurants/{restaurantId}/members/{user.uid}`
        const linkedRef = doc(db, 'restaurants', authoritativeRestaurantId, 'members', user.uid);
        await setDoc(
          linkedRef,
          {
            memberId: user.uid,
            userId: user.uid,
            restaurantId: authoritativeRestaurantId,
            displayName: user.displayName || data.displayName || 'Staff Member',
            email: cleanEmail,
            role: authoritativeRole, // Locked to invitation document role
            isActive: true,
            status: 'active',
            authLinked: true,
            invitationStatus: 'active',
            invitedBy: data.invitedBy || 'owner',
            createdAt: data.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp()
          },
          { merge: true }
        );

        // Remove legacy invitation placeholder record if different from user.uid
        if (memberDoc.id !== user.uid) {
          try {
            await deleteDoc(memberDoc.ref);
          } catch (delErr) {
            console.warn('[RestaurantOS] Cleaned up legacy invitation record note:', delErr);
          }
        }

        // Log audit event
        await auditService.logEvent(authoritativeRestaurantId, {
          entityType: 'staff',
          entityId: user.uid,
          action: 'staff_invitation_accepted',
          actorUid: user.uid,
          metadata: {
            memberId: user.uid,
            email: cleanEmail,
            role: authoritativeRole
          }
        });

        claimed.push({ restaurantId: authoritativeRestaurantId, role: authoritativeRole });
      }
    } catch (err) {
      console.warn('[RestaurantOS] CollectionGroup invitation claim note (indexes may be compiling):', err);
    }

    return claimed;
  }

  /**
   * Finds the active staff membership for an authenticated user.
   */
  async findStaffMembershipForUser(
    userId: string,
    userEmail?: string | null
  ): Promise<{ restaurantId: string; role: StaffRole; member: RestaurantMember } | null> {
    if (!userId) return null;

    try {
      // 1. Direct query by userId
      const q = query(
        collectionGroup(db, 'members'),
        where('userId', '==', userId),
        where('isActive', '==', true)
      );
      const snap = await getDocs(q);

      for (const d of snap.docs) {
        const data = d.data();
        if (data.restaurantId && data.isActive !== false && data.status !== 'inactive' && data.status !== 'revoked') {
          return {
            restaurantId: data.restaurantId,
            role: (data.role as StaffRole) || 'captain',
            member: {
              memberId: d.id,
              restaurantId: data.restaurantId,
              userId,
              role: (data.role as StaffRole) || 'captain',
              isActive: true,
              status: 'active',
              authLinked: true,
              displayName: data.displayName,
              email: data.email
            }
          };
        }
      }

      // 2. Fallback query by email if userId query returned no active membership yet
      if (userEmail) {
        const cleanEmail = userEmail.trim().toLowerCase();
        const qEmail = query(
          collectionGroup(db, 'members'),
          where('email', '==', cleanEmail),
          where('isActive', '==', true)
        );
        const snapEmail = await getDocs(qEmail);

        for (const d of snapEmail.docs) {
          const data = d.data();
          if (data.restaurantId && data.isActive !== false && data.status !== 'inactive' && data.status !== 'revoked') {
            return {
              restaurantId: data.restaurantId,
              role: (data.role as StaffRole) || 'captain',
              member: {
                memberId: d.id,
                restaurantId: data.restaurantId,
                userId,
                role: (data.role as StaffRole) || 'captain',
                isActive: true,
                status: 'active',
                authLinked: true,
                displayName: data.displayName,
                email: cleanEmail
              }
            };
          }
        }
      }
    } catch (err) {
      console.warn('[RestaurantOS] findStaffMembershipForUser note:', err);
    }

    return null;
  }

  /**
   * Checks whether the user has an inactive / deactivated membership in any restaurant.
   */
  async checkIfUserHasInactiveMembership(userId: string, userEmail?: string | null): Promise<boolean> {
    if (!userId) return false;
    try {
      const q = query(
        collectionGroup(db, 'members'),
        where('userId', '==', userId)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const data = d.data();
        if (data.isActive === false || data.status === 'inactive' || data.status === 'revoked') {
          return true;
        }
      }
    } catch {}

    if (userEmail) {
      try {
        const cleanEmail = userEmail.trim().toLowerCase();
        const qEmail = query(
          collectionGroup(db, 'members'),
          where('email', '==', cleanEmail)
        );
        const snapEmail = await getDocs(qEmail);
        for (const d of snapEmail.docs) {
          const data = d.data();
          if (data.isActive === false || data.status === 'inactive' || data.status === 'revoked') {
            return true;
          }
        }
      } catch {}
    }

    return false;
  }

  /**
   * Checks whether an email address is registered as staff anywhere in the database.
   */
  async checkIfEmailIsStaff(email: string | null | undefined): Promise<boolean> {
    if (!email) return false;
    try {
      const cleanEmail = email.trim().toLowerCase();
      const q = query(
        collectionGroup(db, 'members'),
        where('email', '==', cleanEmail)
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch {
      return false;
    }
  }

  /**
   * Modifies an existing staff member's role.
   * Strictly owner-only via `manage_staff`.
   */
  async updateStaffRole(
    restaurantId: string,
    memberId: string,
    newRole: StaffRole
  ): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanMemberId = memberId?.trim();
    if (!cleanRestaurantId || !cleanMemberId) {
      throw new Error('restaurantId and memberId are required to update staff role.');
    }

    // Safety: Cannot change role of owner
    const restDoc = await getDoc(doc(db, 'restaurants', cleanRestaurantId));
    if (restDoc.exists() && restDoc.data()?.ownerId === cleanMemberId) {
      throw new Error('Cannot change the role of the restaurant owner.');
    }

    // Safety: Cannot change own role to prevent self-lockout or privilege escalation
    if (auth.currentUser?.uid === cleanMemberId) {
      throw new Error('You cannot modify your own staff role.');
    }

    await enforcePermission(cleanRestaurantId, 'manage_staff');

    const validRoles: StaffRole[] = ['manager', 'cashier', 'kitchen', 'captain', 'accountant'];
    if (!validRoles.includes(newRole)) {
      throw new Error(
        `Invalid staff role "${newRole}". Permitted roles: ${validRoles.join(', ')}`
      );
    }

    const memberRef = doc(db, 'restaurants', cleanRestaurantId, 'members', cleanMemberId);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) {
      throw new Error('Staff member not found.');
    }

    const memberData = memberSnap.data();
    const oldRole = memberData?.role;
    const targetUserId = memberData?.userId || cleanMemberId;

    try {
      await updateDoc(memberRef, {
        role: newRole,
        updatedAt: serverTimestamp()
      });

      // Also update user profile role if user document exists
      if (targetUserId && !targetUserId.startsWith('staff_') && !targetUserId.startsWith('invitation_')) {
        try {
          const userRef = doc(db, 'users', targetUserId);
          await updateDoc(userRef, {
            role: newRole,
            updatedAt: serverTimestamp()
          });
        } catch {}
      }

      // Log audit event
      await auditService.logEvent(cleanRestaurantId, {
        entityType: 'staff',
        entityId: cleanMemberId,
        action: 'staff_role_changed',
        actorUid: auth.currentUser?.uid || 'system',
        metadata: {
          memberId: cleanMemberId,
          oldRole,
          newRole
        }
      });
    } catch (err) {
      throw handleFirestoreError(err, OperationType.UPDATE, `restaurants/${cleanRestaurantId}/members/${cleanMemberId}`);
    }
  }

  /**
   * Activates or deactivates a staff member.
   * Deactivated staff are immediately denied access to restaurant data.
   */
  async setStaffActiveStatus(
    restaurantId: string,
    memberId: string,
    isActive: boolean
  ): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanMemberId = memberId?.trim();
    if (!cleanRestaurantId || !cleanMemberId) {
      throw new Error('restaurantId and memberId are required.');
    }

    // Safety: Cannot deactivate owner
    const restDoc = await getDoc(doc(db, 'restaurants', cleanRestaurantId));
    if (restDoc.exists() && restDoc.data()?.ownerId === cleanMemberId) {
      throw new Error('Cannot deactivate the restaurant owner.');
    }

    // Safety: Cannot deactivate oneself
    if (auth.currentUser?.uid === cleanMemberId) {
      throw new Error('You cannot deactivate your own staff account.');
    }

    await enforcePermission(cleanRestaurantId, 'manage_staff');

    const memberRef = doc(db, 'restaurants', cleanRestaurantId, 'members', cleanMemberId);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) {
      throw new Error('Staff member not found.');
    }

    try {
      await updateDoc(memberRef, {
        isActive,
        status: isActive ? 'active' : 'inactive',
        updatedAt: serverTimestamp()
      });

      // Log audit event
      await auditService.logEvent(cleanRestaurantId, {
        entityType: 'staff',
        entityId: cleanMemberId,
        action: isActive ? 'staff_activated' : 'staff_deactivated',
        actorUid: auth.currentUser?.uid || 'system',
        metadata: {
          memberId: cleanMemberId,
          isActive
        }
      });
    } catch (err) {
      throw handleFirestoreError(err, OperationType.UPDATE, `restaurants/${cleanRestaurantId}/members/${cleanMemberId}`);
    }
  }

  /**
   * Permanently removes/revokes a staff member from the restaurant.
   */
  async removeStaffMember(restaurantId: string, memberId: string): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanMemberId = memberId?.trim();
    if (!cleanRestaurantId || !cleanMemberId) {
      throw new Error('restaurantId and memberId are required.');
    }

    // Safety: Cannot remove owner
    const restDoc = await getDoc(doc(db, 'restaurants', cleanRestaurantId));
    if (restDoc.exists() && restDoc.data()?.ownerId === cleanMemberId) {
      throw new Error('Cannot remove the restaurant owner.');
    }

    // Safety: Cannot remove oneself
    if (auth.currentUser?.uid === cleanMemberId) {
      throw new Error('You cannot remove yourself from the restaurant.');
    }

    await enforcePermission(cleanRestaurantId, 'manage_staff');

    const memberRef = doc(db, 'restaurants', cleanRestaurantId, 'members', cleanMemberId);

    try {
      await deleteDoc(memberRef);

      // Log audit event
      await auditService.logEvent(cleanRestaurantId, {
        entityType: 'staff',
        entityId: cleanMemberId,
        action: 'staff_removed',
        actorUid: auth.currentUser?.uid || 'system',
        metadata: {
          memberId: cleanMemberId
        }
      });
    } catch (err) {
      throw handleFirestoreError(err, OperationType.DELETE, `restaurants/${cleanRestaurantId}/members/${cleanMemberId}`);
    }
  }

  /**
   * Dispatches a secure Firebase Authentication password reset/setup link to staff email.
   */
  async sendStaffPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email?.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return { success: false, message: 'Please provide a valid email address.' };
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return {
        success: true,
        message: `Password setup instructions sent to ${cleanEmail}.`
      };
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/user-not-found') {
        return {
          success: true,
          message: `The staff member will receive their credentials when they create an account with ${cleanEmail} on the login page.`
        };
      }
      return {
        success: false,
        message: err?.message || 'Failed to dispatch password setup email.'
      };
    }
  }
}

export const staffService = new StaffService();

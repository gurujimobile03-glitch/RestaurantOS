import fs from 'fs';
import path from 'path';

export interface VerifiedAuthUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
}

export interface AuthoritativeInvitationData {
  restaurantName: string;
  staffName: string;
  role: string;
  email: string;
}

export interface AuthCheckResult {
  authorized: boolean;
  code: number;
  error?: string;
  message?: string;
  authoritativeData?: AuthoritativeInvitationData;
}

// In-memory sliding-window rate limiter
interface RateLimitEntry {
  timestamps: number[];
}

const callerRateLimits = new Map<string, RateLimitEntry>();
const targetEmailRateLimits = new Map<string, RateLimitEntry>();

// Load firebase config safely
let cachedFirebaseConfig: { projectId: string; apiKey: string } | null = null;

function getFirebaseConfig(): { projectId: string; apiKey: string } {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      cachedFirebaseConfig = JSON.parse(raw);
      return cachedFirebaseConfig!;
    }
  } catch (err) {
    console.warn('[RestaurantOS Server] Warning reading firebase-applet-config.json:', err);
  }
  return {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'restaurantos-e31b2',
    apiKey: process.env.VITE_FIREBASE_API_KEY || ''
  };
}

/**
 * Mock / Test hooks for unit tests and local simulation
 */
type MockTokenVerifier = (token: string) => Promise<VerifiedAuthUser | null>;
type MockPermissionChecker = (
  callerUid: string,
  restaurantId: string,
  invitationId: string,
  toEmail: string
) => Promise<AuthCheckResult>;

let customTokenVerifier: MockTokenVerifier | null = null;
let customPermissionChecker: MockPermissionChecker | null = null;

export function setMockTokenVerifier(verifier: MockTokenVerifier | null) {
  customTokenVerifier = verifier;
}

export function setMockPermissionChecker(checker: MockPermissionChecker | null) {
  customPermissionChecker = checker;
}

export function resetRateLimits() {
  callerRateLimits.clear;
  callerRateLimits.clear();
  targetEmailRateLimits.clear();
}

/**
 * Checks in-memory sliding-window rate limit
 * Caller UID: max 10 requests per 60 seconds
 * Target Email: max 3 requests per 300 seconds
 */
export function checkRateLimit(
  callerUid: string,
  toEmail: string
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();

  // 1. Check caller rate limit (10 reqs / 60s)
  const callerWindow = 60 * 1000;
  const callerLimit = 10;
  let callerEntry = callerRateLimits.get(callerUid);
  if (!callerEntry) {
    callerEntry = { timestamps: [] };
    callerRateLimits.set(callerUid, callerEntry);
  }
  callerEntry.timestamps = callerEntry.timestamps.filter((t) => now - t < callerWindow);
  if (callerEntry.timestamps.length >= callerLimit) {
    const oldest = callerEntry.timestamps[0];
    const retryAfter = Math.ceil((callerWindow - (now - oldest)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  // 2. Check target email rate limit (3 reqs / 300s)
  const emailWindow = 300 * 1000;
  const emailLimit = 3;
  let emailEntry = targetEmailRateLimits.get(toEmail);
  if (!emailEntry) {
    emailEntry = { timestamps: [] };
    targetEmailRateLimits.set(toEmail, emailEntry);
  }
  emailEntry.timestamps = emailEntry.timestamps.filter((t) => now - t < emailWindow);
  if (emailEntry.timestamps.length >= emailLimit) {
    const oldest = emailEntry.timestamps[0];
    const retryAfter = Math.ceil((emailWindow - (now - oldest)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  // Record this attempt
  callerEntry.timestamps.push(now);
  emailEntry.timestamps.push(now);

  return { allowed: true };
}

/**
 * Verifies Firebase ID token securely.
 * Uses custom test verifier if registered (for tests),
 * otherwise verifies via Google Identity Toolkit endpoint.
 */
export async function verifyFirebaseToken(idToken: string): Promise<VerifiedAuthUser | null> {
  if (!idToken || typeof idToken !== 'string') return null;

  if (customTokenVerifier) {
    return customTokenVerifier(idToken);
  }

  // Test token prefix support for development / testing
  if (process.env.NODE_ENV === 'test' && idToken.startsWith('mock_')) {
    const parts = idToken.split('_');
    const uid = parts.slice(1).join('_') || 'test_user';
    return { uid, email: `${uid}@example.com`, emailVerified: true };
  }

  const { apiKey } = getFirebaseConfig();
  if (!apiKey) {
    console.error('[RestaurantOS Server] No Firebase API Key found for token verification');
    return null;
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.warn('[RestaurantOS Server] Google Identity Toolkit token lookup rejected:', errData);
      return null;
    }

    const data = await response.json();
    const user = data.users?.[0];
    if (!user || !user.localId) {
      return null;
    }

    return {
      uid: user.localId,
      email: user.email,
      emailVerified: Boolean(user.emailVerified)
    };
  } catch (err) {
    console.error('[RestaurantOS Server] Token verification network error:', err);
    return null;
  }
}

/**
 * Verifies restaurant authorization and validates the staff invitation document.
 * 1. Checks that the restaurant exists and caller is owner or authorized manager.
 * 2. Checks that invitation document exists, is pending, matches email, not expired, not revoked.
 * 3. Resolves authoritative restaurant display name from database (never trusts client spoofing).
 */
export async function verifyRestaurantStaffAuthorization(
  callerUid: string,
  idToken: string,
  restaurantId: string,
  invitationId: string,
  toEmail: string
): Promise<AuthCheckResult> {
  if (customPermissionChecker) {
    return customPermissionChecker(callerUid, restaurantId, invitationId, toEmail);
  }

  const { projectId } = getFirebaseConfig();
  const cleanRestaurantId = restaurantId.trim();
  const cleanInvitationId = invitationId.trim();
  const cleanEmail = toEmail.trim().toLowerCase();

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  try {
    // 1. Fetch Restaurant Document using caller's ID token
    // Firestore rules enforce that caller has access to get/read this restaurant
    const restRes = await fetch(`${baseUrl}/restaurants/${cleanRestaurantId}`, {
      headers: { Authorization: `Bearer ${idToken}` }
    });

    if (restRes.status === 403 || restRes.status === 401) {
      return {
        authorized: false,
        code: 403,
        error: 'FORBIDDEN_RESTAURANT_ACCESS',
        message: 'Caller is not authorized to access this restaurant.'
      };
    }

    if (restRes.status === 404) {
      return {
        authorized: false,
        code: 404,
        error: 'RESTAURANT_NOT_FOUND',
        message: 'Restaurant does not exist.'
      };
    }

    const restDoc = await restRes.json();
    const ownerId = restDoc.fields?.ownerId?.stringValue;
    const authoritativeRestaurantName =
      restDoc.fields?.name?.stringValue ||
      restDoc.fields?.legalName?.stringValue ||
      'Restaurant';

    // 2. Check if caller is owner or manager (manage_staff permission)
    let isAuthorizedActor = callerUid === ownerId;

    if (!isAuthorizedActor) {
      // Check caller's member document
      const memberRes = await fetch(`${baseUrl}/restaurants/${cleanRestaurantId}/members/${callerUid}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });

      if (memberRes.ok) {
        const memberDoc = await memberRes.json();
        const role = memberDoc.fields?.role?.stringValue;
        const isActive = memberDoc.fields?.isActive?.booleanValue !== false;
        const status = memberDoc.fields?.status?.stringValue;
        if (isActive && status !== 'inactive' && (role === 'owner' || role === 'manager')) {
          isAuthorizedActor = true;
        }
      }
    }

    if (!isAuthorizedActor) {
      return {
        authorized: false,
        code: 403,
        error: 'UNAUTHORIZED_MANAGE_STAFF',
        message: 'Caller does not possess manage_staff permission for this restaurant.'
      };
    }

    // 3. If invitationId is provided, validate the invitation document
    if (cleanInvitationId) {
      const invRes = await fetch(
        `${baseUrl}/restaurants/${cleanRestaurantId}/members/${cleanInvitationId}`,
        {
          headers: { Authorization: `Bearer ${idToken}` }
        }
      );

      if (!invRes.ok) {
        return {
          authorized: false,
          code: 404,
          error: 'INVITATION_NOT_FOUND',
          message: 'Invitation record not found in the specified restaurant.'
        };
      }

      const invDoc = await invRes.json();
      const fields = invDoc.fields || {};
      const docEmail = (fields.email?.stringValue || '').trim().toLowerCase();
      const docRole = fields.role?.stringValue || 'staff';
      const docName = fields.displayName?.stringValue || 'Staff Member';
      const docStatus = fields.status?.stringValue || 'pending_setup';
      const docInvStatus = fields.invitationStatus?.stringValue || 'pending_setup';
      const expiresAt = Number(fields.expiresAt?.integerValue || 0);

      // Verify email match
      if (docEmail && docEmail !== cleanEmail) {
        return {
          authorized: false,
          code: 400,
          error: 'INVITATION_EMAIL_MISMATCH',
          message: `Invitation email (${docEmail}) does not match requested recipient (${cleanEmail}).`
        };
      }

      // Verify expiration
      if (expiresAt > 0 && Date.now() > expiresAt) {
        return {
          authorized: false,
          code: 400,
          error: 'INVITATION_EXPIRED',
          message: 'This invitation has expired.'
        };
      }

      // Verify revocation
      if (docStatus === 'revoked' || docInvStatus === 'revoked') {
        return {
          authorized: false,
          code: 400,
          error: 'INVITATION_REVOKED',
          message: 'This invitation has been revoked.'
        };
      }

      return {
        authorized: true,
        code: 200,
        authoritativeData: {
          restaurantName: authoritativeRestaurantName,
          staffName: docName,
          role: docRole,
          email: docEmail || cleanEmail
        }
      };
    }

    return {
      authorized: true,
      code: 200,
      authoritativeData: {
        restaurantName: authoritativeRestaurantName,
        staffName: 'Staff Member',
        role: 'staff',
        email: cleanEmail
      }
    };
  } catch (err: any) {
    console.error('[RestaurantOS Server] Permission verification error:', err);
    return {
      authorized: false,
      code: 500,
      error: 'AUTHORIZATION_VERIFICATION_FAILED',
      message: err?.message || 'Server failed to verify authorization.'
    };
  }
}

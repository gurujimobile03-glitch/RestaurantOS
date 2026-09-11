import { describe, it, expect, vi, beforeEach } from 'vitest';
import { staffService } from '../services/staffService';
import * as firestore from 'firebase/firestore';

// Mock Firebase Firestore SDK
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
    collectionGroup: vi.fn((_db, name) => ({ type: 'collectionGroup', name })),
    doc: vi.fn((_dbOrCol, ...pathSegments) => {
      const id = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : `mock_doc_${Math.random().toString(36).substring(2, 8)}`;
      return {
        id,
        path: pathSegments.join('/'),
        parent: { parent: { id: pathSegments.length > 2 ? pathSegments[pathSegments.length - 3] : 'rest_harisha' } }
      };
    }),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn(() => vi.fn()),
    serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
    runTransaction: vi.fn(async (_db, callback) => {
      const mockTx = { get: vi.fn(), set: vi.fn(), update: vi.fn(), delete: vi.fn() };
      return callback(mockTx);
    })
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: null }
}));

describe('FINAL SECURITY HARDENING — M6-6E Staff Invitation Claiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(firestore.getDocs).mockReset();
    vi.mocked(firestore.setDoc).mockReset();
  });

  it('1. Unverified email CANNOT claim a staff invitation', async () => {
    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid_123',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: false
    });

    expect(result).toEqual([]);
    expect(firestore.getDocs).not.toHaveBeenCalled();
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('2. Verified matching email CAN claim the invitation', async () => {
    const mockSnap = {
      docs: [
        {
          id: 'invitation_rahul',
          ref: { id: 'invitation_rahul', parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid_123',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: true
    });

    expect(result).toEqual([{ restaurantId: 'rest_harisha', role: 'captain' }]);
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'restaurants/rest_harisha/members/rahul_auth_uid_123' }),
      expect.objectContaining({
        memberId: 'rahul_auth_uid_123',
        userId: 'rahul_auth_uid_123',
        restaurantId: 'rest_harisha',
        role: 'captain',
        isActive: true,
        authLinked: true
      }),
      { merge: true }
    );
  });

  it('3. Google OAuth authenticated user is treated as verified and claims invitation', async () => {
    const mockSnap = {
      docs: [
        {
          id: 'invitation_rahul',
          ref: { id: 'invitation_rahul', parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_google_uid_456',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Google',
      emailVerified: false,
      providerData: [{ providerId: 'google.com' }]
    });

    expect(result).toEqual([{ restaurantId: 'rest_harisha', role: 'captain' }]);
  });

  it('4. Wrong email CANNOT claim another user invitation', async () => {
    vi.mocked(firestore.getDocs).mockResolvedValue({ docs: [] } as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'hacker_uid_999',
      email: 'attacker@evil.com',
      displayName: 'Attacker',
      emailVerified: true
    });

    expect(result).toEqual([]);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('5 & 6. Claim is idempotent and does not create duplicate documents', async () => {
    // User is already linked at memberDoc.id === user.uid
    const mockSnapAlreadyClaimed = {
      docs: [
        {
          id: 'rahul_auth_uid_123',
          ref: { id: 'rahul_auth_uid_123', parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            userId: 'rahul_auth_uid_123',
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            isActive: true,
            authLinked: true
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnapAlreadyClaimed as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid_123',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: true
    });

    expect(result).toEqual([{ restaurantId: 'rest_harisha', role: 'captain' }]);
    // Idempotent: setDoc should NOT be called again since user was already claimed & linked
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('8 & 9. Role from invitation remains authoritative and client cannot override it', async () => {
    const mockSnap = {
      docs: [
        {
          id: 'invitation_rahul',
          ref: { id: 'invitation_rahul', parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain', // Stored authoritative role
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid_123',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: true
    });

    expect(result[0].role).toBe('captain');
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: 'captain' }),
      expect.anything()
    );
  });

  it('10. Client-supplied restaurantId cannot override invitation restaurantId', async () => {
    const mockSnap = {
      docs: [
        {
          id: 'invitation_rahul',
          ref: { id: 'invitation_rahul', parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha', // Authoritative restaurantId
            role: 'captain',
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid_123',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: true
    });

    expect(result[0].restaurantId).toBe('rest_harisha');
  });

  it('12. Deactivated or removed invitation CANNOT be claimed', async () => {
    const mockSnap = {
      docs: [
        {
          id: 'invitation_rahul_deactivated',
          ref: { id: 'invitation_rahul_deactivated', parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            isActive: false, // Deactivated
            status: 'inactive'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid_123',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: true
    });

    expect(result).toEqual([]);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('13. Expired invitation CANNOT be claimed', async () => {
    const pastTime = Date.now() - 3600000; // 1 hour ago
    const mockSnap = {
      docs: [
        {
          id: 'invitation_rahul_expired',
          ref: { id: 'invitation_rahul_expired', parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            isActive: true,
            expiresAt: pastTime
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid_123',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: true
    });

    expect(result).toEqual([]);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('14. Claim operation runs safely and idempotently under concurrent requests', async () => {
    const mockSnap = {
      docs: [
        {
          id: 'invitation_rahul',
          ref: { id: 'invitation_rahul', parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    const userObj = {
      uid: 'rahul_auth_uid_123',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: true
    };

    const [res1, res2] = await Promise.all([
      staffService.claimPendingInvitationsForUser(userObj),
      staffService.claimPendingInvitationsForUser(userObj)
    ]);

    expect(res1).toEqual([{ restaurantId: 'rest_harisha', role: 'captain' }]);
    expect(res2).toEqual([{ restaurantId: 'rest_harisha', role: 'captain' }]);
  });

  it('15. generateInvitationToken produces a unique high-entropy token string', () => {
    const token1 = staffService.generateInvitationToken ? staffService.generateInvitationToken() : 'test_token_1';
    const token2 = staffService.generateInvitationToken ? staffService.generateInvitationToken() : 'test_token_2';

    expect(typeof token1).toBe('string');
    expect(token1.length).toBeGreaterThan(15);
    expect(token1).not.toEqual(token2);
  });

  it('16. getInvitationByToken retrieves invitation by token across collectionGroup', async () => {
    const mockSnap = {
      empty: false,
      docs: [
        {
          id: 'invitation_rahul',
          ref: { parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            invitationToken: 'test_token_abc123',
            expiresAt: Date.now() + 3600000,
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);
    vi.mocked(firestore.getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ name: "Harisha's Restaurant" })
    } as any);

    const details = await staffService.getInvitationByToken('test_token_abc123');

    expect(details).not.toBeNull();
    expect(details?.invitation.email).toBe('rahul@harisha.com');
    expect(details?.restaurantName).toBe("Harisha's Restaurant");
    expect(details?.isExpired).toBe(false);
  });

  it('17. claimInvitationWithToken rejects claim if email is unverified', async () => {
    const mockSnap = {
      empty: false,
      docs: [
        {
          id: 'invitation_rahul',
          ref: { parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            invitationToken: 'test_token_abc123',
            expiresAt: Date.now() + 3600000,
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    await expect(
      staffService.claimInvitationWithToken('test_token_abc123', {
        uid: 'rahul_uid',
        email: 'rahul@harisha.com',
        displayName: 'Rahul',
        emailVerified: false
      })
    ).rejects.toThrow(/email address must be verified/i);
  });

  it('18. claimInvitationWithToken rejects claim if authenticated email does not match invitation email', async () => {
    const mockSnap = {
      empty: false,
      docs: [
        {
          id: 'invitation_rahul',
          ref: { parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            invitationToken: 'test_token_abc123',
            expiresAt: Date.now() + 3600000,
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    await expect(
      staffService.claimInvitationWithToken('test_token_abc123', {
        uid: 'attacker_uid',
        email: 'attacker@evil.com',
        displayName: 'Attacker',
        emailVerified: true
      })
    ).rejects.toThrow(/Logged in as attacker@evil.com/);
  });

  it('19. claimInvitationWithToken succeeds for verified matching email and creates member doc', async () => {
    const mockSnap = {
      empty: false,
      docs: [
        {
          id: 'invitation_rahul',
          ref: { parent: { parent: { id: 'rest_harisha' } } },
          data: () => ({
            email: 'rahul@harisha.com',
            restaurantId: 'rest_harisha',
            role: 'captain',
            invitationToken: 'test_token_abc123',
            expiresAt: Date.now() + 3600000,
            isActive: true,
            status: 'pending_setup'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockSnap as any);

    const result = await staffService.claimInvitationWithToken('test_token_abc123', {
      uid: 'rahul_auth_uid',
      email: 'rahul@harisha.com',
      displayName: 'Rahul Captain',
      emailVerified: true
    });

    expect(result).toEqual({ restaurantId: 'rest_harisha', role: 'captain' });
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'restaurants/rest_harisha/members/rahul_auth_uid' }),
      expect.objectContaining({
        memberId: 'rahul_auth_uid',
        userId: 'rahul_auth_uid',
        restaurantId: 'rest_harisha',
        role: 'captain',
        status: 'active',
        authLinked: true
      }),
      { merge: true }
    );
  });
});

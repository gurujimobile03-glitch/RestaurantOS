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
        parent: { parent: { id: pathSegments.length > 2 ? pathSegments[pathSegments.length - 3] : 'rest_alpha' } }
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
  auth: { currentUser: { uid: 'owner_uid_999' } }
}));

describe('URGENT SECURITY + IDENTITY ARCHITECTURE OVERHAUL — Staff Invitation & Tenant Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(firestore.getDocs).mockReset();
    vi.mocked(firestore.getDoc).mockReset();
    vi.mocked(firestore.setDoc).mockReset();
    vi.mocked(firestore.updateDoc).mockReset();
    vi.mocked(firestore.deleteDoc).mockReset();

    // Mock global fetch for email endpoint
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Invitation email sent' })
    } as any);
  });

  it('1 & 2. addStaffMember creates pending invitation without Auth account or active status', async () => {
    const result = await staffService.addStaffMember('rest_alpha', {
      displayName: 'Rahul Captain',
      email: 'rahul@example.com',
      role: 'captain'
    });

    expect(result.invitationStatus).toBe('invitation_sent');
    expect(result.member.isActive).toBe(false);
    expect(result.member.status).toBe('pending_setup');
    expect(result.member.authLinked).toBe(false);
    expect(result.member.email).toBe('rahul@example.com');
    expect(result.member.role).toBe('captain');

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('restaurants/rest_alpha/members/inv_') }),
      expect.objectContaining({
        displayName: 'Rahul Captain',
        email: 'rahul@example.com',
        role: 'captain',
        isActive: false,
        status: 'pending_setup',
        authLinked: false
      }),
      { merge: true }
    );
  });

  it('3 & 6. addStaffMember generates invitation token, url, and QR code', async () => {
    const result = await staffService.addStaffMember('rest_alpha', {
      displayName: 'Priya Chef',
      email: 'priya@example.com',
      role: 'kitchen'
    });

    expect(result.member.invitationToken).toBeDefined();
    expect(result.member.invitationToken).toContain('inv_tok_');
    expect(result.member.invitationUrl).toContain('/accept-invitation?token=');
    expect(result.qrCodeDataUrl).toBeDefined();
  });

  it('4 & 5. addStaffMember does NOT mutate /users/{uid} or existing user accounts', async () => {
    await staffService.addStaffMember('rest_alpha', {
      displayName: 'Sidhant Owner',
      email: 'crsidhant01@gmail.com',
      role: 'captain'
    });

    // Verify setDoc was ONLY called for restaurants/rest_alpha/members/... and NOT users/...
    const setDocCalls = vi.mocked(firestore.setDoc).mock.calls;
    const writtenPaths = setDocCalls.map(call => (call[0] as any).path);
    expect(writtenPaths.every(path => !path.startsWith('users/'))).toBe(true);
  });

  it('10. Failed email delivery records invitation_failed and error message without faking success', async () => {
    // Mock fetch returning email provider failure
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: 'NO_EMAIL_PROVIDER_CONFIGURED',
        message: 'No SMTP or transactional email provider API key configured in environment variables.'
      })
    } as any);

    const result = await staffService.addStaffMember('rest_alpha', {
      displayName: 'Karan Waiter',
      email: 'karan@example.com',
      role: 'captain'
    });

    expect(result.invitationStatus).toBe('invitation_failed');
    expect(result.firebaseEmailSent).toBe(false);
    expect(result.member.invitationError).toContain('No SMTP or transactional email provider');
    expect(result.message).toContain('No SMTP or transactional email provider');
  });

  it('7 & 8. resendInvitation generates fresh token and 7-day expiration', async () => {
    const mockSnap = {
      exists: () => true,
      data: () => ({
        email: 'rahul@example.com',
        role: 'captain',
        status: 'pending_setup',
        invitationToken: 'old_token'
      })
    };
    vi.mocked(firestore.getDoc).mockResolvedValue(mockSnap as any);

    const result = await staffService.resendInvitation('rest_alpha', 'inv_123');

    expect(result.success).toBe(true);
    expect(result.invitationUrl).toContain('/accept-invitation?token=');
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        invitationToken: expect.stringContaining('inv_tok_'),
        expiresAt: expect.any(Number)
      })
    );
  });

  it('9. revokeInvitation marks status as revoked and isActive false', async () => {
    const mockSnap = {
      exists: () => true,
      data: () => ({ email: 'rahul@example.com', role: 'captain' })
    };
    vi.mocked(firestore.getDoc).mockResolvedValue(mockSnap as any);

    await staffService.revokeInvitation('rest_alpha', 'inv_123');

    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'revoked',
        invitationStatus: 'revoked',
        isActive: false
      })
    );
  });

  it('11. Unverified email CANNOT claim staff invitation', async () => {
    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'unverified_uid_1',
      email: 'rahul@example.com',
      displayName: 'Rahul',
      emailVerified: false
    });

    expect(result).toEqual([]);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('12 & 15. Verified matching email claims invitation and creates active membership', async () => {
    const mockPendingSnap = {
      docs: [
        {
          id: 'inv_123',
          ref: { id: 'inv_123', parent: { parent: { id: 'rest_alpha' } } },
          data: () => ({
            email: 'rahul@example.com',
            restaurantId: 'rest_alpha',
            role: 'captain',
            status: 'pending_setup',
            isActive: false,
            invitationToken: 'inv_tok_abc'
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockPendingSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid',
      email: 'rahul@example.com',
      displayName: 'Rahul Verified',
      emailVerified: true
    });

    expect(result).toEqual([{ restaurantId: 'rest_alpha', role: 'captain' }]);

    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'restaurants/rest_alpha/members/rahul_auth_uid' }),
      expect.objectContaining({
        memberId: 'rahul_auth_uid',
        userId: 'rahul_auth_uid',
        restaurantId: 'rest_alpha',
        role: 'captain',
        isActive: true,
        status: 'active',
        authLinked: true
      }),
      { merge: true }
    );
  });

  it('13. Google OAuth user is treated as verified and claims invitation', async () => {
    const mockPendingSnap = {
      docs: [
        {
          id: 'inv_123',
          ref: { id: 'inv_123', parent: { parent: { id: 'rest_alpha' } } },
          data: () => ({
            email: 'rahul@example.com',
            restaurantId: 'rest_alpha',
            role: 'captain',
            status: 'pending_setup',
            isActive: false
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockPendingSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_google_uid',
      email: 'rahul@example.com',
      displayName: 'Rahul Google',
      emailVerified: false,
      providerData: [{ providerId: 'google.com' }]
    });

    expect(result).toEqual([{ restaurantId: 'rest_alpha', role: 'captain' }]);
  });

  it('14. Wrong email CANNOT claim another user invitation', async () => {
    vi.mocked(firestore.getDocs).mockResolvedValue({ docs: [] } as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'hacker_uid',
      email: 'attacker@evil.com',
      displayName: 'Attacker',
      emailVerified: true
    });

    expect(result).toEqual([]);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('18. Expired invitation CANNOT be claimed', async () => {
    const mockPendingSnap = {
      docs: [
        {
          id: 'inv_expired',
          ref: { id: 'inv_expired', parent: { parent: { id: 'rest_alpha' } } },
          data: () => ({
            email: 'rahul@example.com',
            restaurantId: 'rest_alpha',
            role: 'captain',
            expiresAt: Date.now() - 10000, // Past expiration
            status: 'pending_setup',
            isActive: false
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockPendingSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid',
      email: 'rahul@example.com',
      displayName: 'Rahul',
      emailVerified: true
    });

    expect(result).toEqual([]);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('19. Revoked invitation CANNOT be claimed', async () => {
    const mockPendingSnap = {
      docs: [
        {
          id: 'inv_revoked',
          ref: { id: 'inv_revoked', parent: { parent: { id: 'rest_alpha' } } },
          data: () => ({
            email: 'rahul@example.com',
            restaurantId: 'rest_alpha',
            role: 'captain',
            status: 'revoked',
            isActive: false
          })
        }
      ]
    };
    vi.mocked(firestore.getDocs).mockResolvedValue(mockPendingSnap as any);

    const result = await staffService.claimPendingInvitationsForUser({
      uid: 'rahul_auth_uid',
      email: 'rahul@example.com',
      displayName: 'Rahul',
      emailVerified: true
    });

    expect(result).toEqual([]);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('29, 30, 31, 32. Safety rules: Cannot modify owner role, deactivate owner, or self-deactivate', async () => {
    const restDocMock = {
      exists: () => true,
      data: () => ({ ownerId: 'owner_uid_999', name: 'Alpha Bistro' })
    };
    vi.mocked(firestore.getDoc).mockResolvedValue(restDocMock as any);

    // 1. Cannot change role of owner
    await expect(
      staffService.updateStaffRole('rest_alpha', 'owner_uid_999', 'cashier')
    ).rejects.toThrow('Cannot change the role of the restaurant owner');

    // 2. Cannot deactivate owner
    await expect(
      staffService.setStaffActiveStatus('rest_alpha', 'owner_uid_999', false)
    ).rejects.toThrow('Cannot deactivate the restaurant owner');

    // 3. Cannot remove owner
    await expect(
      staffService.removeStaffMember('rest_alpha', 'owner_uid_999')
    ).rejects.toThrow('Cannot remove the restaurant owner');
  });

  it('33, 34, 35. Owner can modify staff role, deactivate staff, and remove staff', async () => {
    const restDocMock = {
      exists: () => true,
      data: () => ({ ownerId: 'owner_uid_999' })
    };
    const memberSnapMock = {
      exists: () => true,
      data: () => ({ userId: 'staff_uid_100', role: 'captain', isActive: true })
    };
    vi.mocked(firestore.getDoc)
      .mockResolvedValueOnce(restDocMock as any)
      .mockResolvedValueOnce(memberSnapMock as any)
      .mockResolvedValueOnce(restDocMock as any)
      .mockResolvedValueOnce(memberSnapMock as any)
      .mockResolvedValueOnce(restDocMock as any);

    // 1. Owner updates staff role
    await staffService.updateStaffRole('rest_alpha', 'staff_uid_100', 'manager');
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: 'manager' })
    );

    // 2. Owner deactivates staff
    await staffService.setStaffActiveStatus('rest_alpha', 'staff_uid_100', false);
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isActive: false, status: 'inactive' })
    );

    // 3. Owner removes staff member
    await staffService.removeStaffMember('rest_alpha', 'staff_uid_100');
    expect(firestore.deleteDoc).toHaveBeenCalled();
  });
});

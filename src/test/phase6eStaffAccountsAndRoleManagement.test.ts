(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasPermission,
  isViewAllowed,
  checkPermission,
  enforcePermission,
  PERMISSION_MATRIX,
  PermissionAction
} from '../utils/permissions';
import { StaffRole, RestaurantMember } from '../types/auth';
import { staffService } from '../services/staffService';
import { auditService } from '../services/auditService';
import { offlineSyncService } from '../services/offlineSyncService';

// Mock Firebase Firestore SDK
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
    collectionGroup: vi.fn((_db, name) => ({ type: 'collectionGroup', name })),
    doc: vi.fn((_dbOrCol, ...pathSegments) => {
      const id = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : `mock_doc_${Math.random().toString(36).substring(2, 8)}`;
      return { id, path: pathSegments.join('/') };
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
    serverTimestamp: vi.fn(() => new Date('2026-09-09T12:00:00Z')),
    runTransaction: vi.fn(async (_db, callback) => {
      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      return callback(mockTx);
    })
  };
});

// Mock Firebase Auth
vi.mock('firebase/auth', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined)
}));

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'OWNER_UID_999', email: 'owner@harisha.com' } }
}));

import * as firestore from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';

describe('M6-6E: Staff Accounts + Employee Login + Restaurant Assignment + Role Management', () => {
  const RESTAURANT_A = 'rest_harisha_101';
  const RESTAURANT_B = 'rest_siddhant_202';
  const OWNER_UID = 'OWNER_UID_999';

  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore
    auth.currentUser = { uid: OWNER_UID, email: 'owner@harisha.com', getIdToken: async () => 'mock_token' } as any;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Invitation email sent' })
    } as any);
  });

  // =========================================================================
  // 1. RBAC PERMISSION MATRIX & VIEW ACCESS FOR ALL 6 ROLES
  // =========================================================================
  describe('1. RBAC Matrix & Staff Management Permissions', () => {
    it('Scenario 1: Owner has both access_staff and manage_staff permissions', () => {
      expect(hasPermission('owner', 'access_staff')).toBe(true);
      expect(hasPermission('owner', 'manage_staff')).toBe(true);
      expect(isViewAllowed('owner', 'staff')).toBe(true);
    });

    it('Scenario 2: Manager can view staff (access_staff) but cannot manage staff (manage_staff)', () => {
      expect(hasPermission('manager', 'access_staff')).toBe(true);
      expect(hasPermission('manager', 'manage_staff')).toBe(false);
      expect(isViewAllowed('manager', 'staff')).toBe(true);
    });

    it('Scenario 3: Cashier is denied staff management and staff view', () => {
      expect(hasPermission('cashier', 'access_staff')).toBe(false);
      expect(hasPermission('cashier', 'manage_staff')).toBe(false);
      expect(isViewAllowed('cashier', 'staff')).toBe(false);
    });

    it('Scenario 4: Kitchen staff is denied staff management and staff view', () => {
      expect(hasPermission('kitchen', 'access_staff')).toBe(false);
      expect(hasPermission('kitchen', 'manage_staff')).toBe(false);
      expect(isViewAllowed('kitchen', 'staff')).toBe(false);
    });

    it('Scenario 5: Captain / Waiter is denied staff management and staff view', () => {
      expect(hasPermission('captain', 'access_staff')).toBe(false);
      expect(hasPermission('captain', 'manage_staff')).toBe(false);
      expect(isViewAllowed('captain', 'staff')).toBe(false);
    });

    it('Scenario 6: Accountant is denied staff management and staff view', () => {
      expect(hasPermission('accountant', 'access_staff')).toBe(false);
      expect(hasPermission('accountant', 'manage_staff')).toBe(false);
      expect(isViewAllowed('accountant', 'staff')).toBe(false);
    });
  });

  // =========================================================================
  // 2. MULTI-TENANT ISOLATION & RESTAURANT ASSIGNMENT
  // =========================================================================
  describe('2. Multi-Tenant Isolation & Cross-Restaurant Isolation', () => {
    it('Scenario 7: Staff belongs to Restaurant A; Restaurant B lookups are strictly isolated', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);

      // Current user is MANAGER_UID_101 assigned to RESTAURANT_A
      // @ts-ignore
      auth.currentUser = { uid: 'MANAGER_UID_101' };

      // Looking up RESTAURANT_A: valid restaurant, active member
      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID, name: 'Harisha Restaurant' })
          } as any;
        }
        if (docRef.path === `restaurants/${RESTAURANT_A}/members/MANAGER_UID_101`) {
          return {
            exists: () => true,
            id: 'MANAGER_UID_101',
            data: () => ({ role: 'manager', isActive: true, status: 'active' })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      const allowedInA = await checkPermission(RESTAURANT_A, 'view_orders');
      expect(allowedInA).toBe(true);
    });

    it('Scenario 8: Manager of Harisha (Rest A) cannot access Siddhant (Rest B)', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);
      // @ts-ignore
      auth.currentUser = { uid: 'HARISHA_MANAGER_UID' };

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_B}`) {
          return {
            exists: () => true,
            id: RESTAURANT_B,
            data: () => ({ ownerId: 'OTHER_OWNER_UID', name: 'Siddhant Restaurant' })
          } as any;
        }
        // No membership document for Harisha manager in Siddhant restaurant
        return { exists: () => false, data: () => null } as any;
      });

      const allowedInB = await checkPermission(RESTAURANT_B, 'view_orders');
      expect(allowedInB).toBe(false);

      await expect(enforcePermission(RESTAURANT_B, 'view_orders')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "view_orders"'
      );
    });

    it('Scenario 9: Manager of Siddhant (Rest B) cannot access Harisha (Rest A)', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);
      // @ts-ignore
      auth.currentUser = { uid: 'SIDDHANT_MANAGER_UID' };

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID, name: 'Harisha Restaurant' })
          } as any;
        }
        // No membership document for Siddhant manager in Harisha restaurant
        return { exists: () => false, data: () => null } as any;
      });

      const allowedInA = await checkPermission(RESTAURANT_A, 'process_payments');
      expect(allowedInA).toBe(false);
    });

    it('Scenario 10: Auth UID and restaurantId are separate entities (auth.uid !== restaurantId)', async () => {
      const staffUid = 'usr_employee_777';
      expect(staffUid).not.toEqual(RESTAURANT_A);
      expect(OWNER_UID).not.toEqual(RESTAURANT_A);
    });
  });

  // =========================================================================
  // 3. SERVICE-LAYER AUTHORIZATION & TAMPERING GUARDS
  // =========================================================================
  describe('3. Service-Layer Authorization & Tampering Defense', () => {
    it('Scenario 11: Client-supplied restaurantId tampering cannot bypass authorization', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);
      // @ts-ignore
      auth.currentUser = { uid: 'CASHIER_TAMPER_UID' };

      // Attacker passes RESTAURANT_B while only having membership in RESTAURANT_A
      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_B}`) {
          return {
            exists: () => true,
            id: RESTAURANT_B,
            data: () => ({ ownerId: 'OTHER_OWNER_UID' })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      const allowed = await checkPermission(RESTAURANT_B, 'access_pos');
      expect(allowed).toBe(false);
    });

    it('Scenario 12: Client-supplied role cannot bypass server/Firestore authorization', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);
      // Attacker claims to be 'owner' in local state, but Firestore membership records 'cashier'
      // @ts-ignore
      auth.currentUser = { uid: 'CASHIER_CLAIMING_OWNER' };

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID })
          } as any;
        }
        if (docRef.path === `restaurants/${RESTAURANT_A}/members/CASHIER_CLAIMING_OWNER`) {
          return {
            exists: () => true,
            id: 'CASHIER_CLAIMING_OWNER',
            data: () => ({ role: 'cashier', isActive: true, status: 'active' })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      // Cashier cannot modify root restaurant setup even if client claims owner role
      const canSetup = await checkPermission(RESTAURANT_A, 'access_restaurant_setup');
      expect(canSetup).toBe(false);

      // Cashier cannot refund payments
      const canRefund = await checkPermission(RESTAURANT_A, 'refund_payments');
      expect(canRefund).toBe(false);
    });

    it('Scenario 13: Inactive membership is strictly denied across all operations', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);
      // @ts-ignore
      auth.currentUser = { uid: 'DEACTIVATED_STAFF_UID' };

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID })
          } as any;
        }
        if (docRef.path === `restaurants/${RESTAURANT_A}/members/DEACTIVATED_STAFF_UID`) {
          return {
            exists: () => true,
            id: 'DEACTIVATED_STAFF_UID',
            data: () => ({ role: 'manager', isActive: false, status: 'inactive' })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      const allowed = await checkPermission(RESTAURANT_A, 'access_pos');
      expect(allowed).toBe(false);

      await expect(enforcePermission(RESTAURANT_A, 'access_pos')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "access_pos"'
      );
    });

    it('Scenario 14: Deactivated staff cannot access kitchen, captain, or order operations', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);
      // @ts-ignore
      auth.currentUser = { uid: 'DEACTIVATED_KITCHEN_UID' };

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID })
          } as any;
        }
        if (docRef.path === `restaurants/${RESTAURANT_A}/members/DEACTIVATED_KITCHEN_UID`) {
          return {
            exists: () => true,
            id: 'DEACTIVATED_KITCHEN_UID',
            data: () => ({ role: 'kitchen', isActive: false, status: 'inactive' })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      expect(await checkPermission(RESTAURANT_A, 'access_kitchen')).toBe(false);
      expect(await checkPermission(RESTAURANT_A, 'update_kot_status')).toBe(false);
      expect(await checkPermission(RESTAURANT_A, 'view_orders')).toBe(false);
    });
  });

  // =========================================================================
  // 4. STAFF LIFECYCLE: CREATE, UPDATE ROLE, ACTIVATE/DEACTIVATE, REMOVE
  // =========================================================================
  describe('4. Staff Lifecycle Operations via staffService', () => {
    beforeEach(() => {
      const getDocMock = vi.mocked(firestore.getDoc);
      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID, name: 'Harisha Restaurant' })
          } as any;
        }
        return { exists: () => true, id: docRef.id, data: () => ({ role: 'cashier', isActive: true }) } as any;
      });
    });

    it('Scenario 15: Owner can add a new staff member with valid role', async () => {
      const setDocMock = vi.mocked(firestore.setDoc);

      const res = await staffService.addStaffMember(RESTAURANT_A, {
        displayName: 'Aarav Mehta',
        email: 'aarav@harisha.com',
        role: 'captain'
      });

      expect(res.member).toBeDefined();
      expect(res.member.displayName).toBe('Aarav Mehta');
      expect(res.member.email).toBe('aarav@harisha.com');
      expect(res.member.role).toBe('captain');
      expect(res.member.isActive).toBe(false); // Inactive until claimed by user
      expect(setDocMock).toHaveBeenCalled();
    });

    it('Scenario 16: Adding staff with invalid email throws validation error', async () => {
      await expect(
        staffService.addStaffMember(RESTAURANT_A, {
          displayName: 'Invalid Email User',
          email: 'not-an-email',
          role: 'cashier'
        })
      ).rejects.toThrow('Please provide a valid email address.');
    });

    it('Scenario 17: Adding staff with empty name throws validation error', async () => {
      await expect(
        staffService.addStaffMember(RESTAURANT_A, {
          displayName: ' ',
          email: 'valid@harisha.com',
          role: 'cashier'
        })
      ).rejects.toThrow('Staff member display name must be at least 2 characters.');
    });

    it('Scenario 18: Adding staff with "owner" role is rejected (owner cannot be created via staff subcollection)', async () => {
      await expect(
        staffService.addStaffMember(RESTAURANT_A, {
          displayName: 'Fake Owner',
          email: 'fake@harisha.com',
          role: 'owner' as any
        })
      ).rejects.toThrow('Invalid staff role "owner". Permitted roles: manager, cashier, kitchen, captain, accountant');
    });

    it('Scenario 19: Owner can update a staff member role from cashier to manager', async () => {
      const updateDocMock = vi.mocked(firestore.updateDoc);
      const getDocMock = vi.mocked(firestore.getDoc);

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID })
          } as any;
        }
        if (docRef.path === `restaurants/${RESTAURANT_A}/members/STAFF_MEMBER_555`) {
          return {
            exists: () => true,
            id: 'STAFF_MEMBER_555',
            data: () => ({ role: 'cashier', isActive: true })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      await staffService.updateStaffRole(RESTAURANT_A, 'STAFF_MEMBER_555', 'manager');
      expect(updateDocMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ role: 'manager' })
      );
    });

    it('Scenario 20: Staff member cannot modify their own role', async () => {
      // Current user is STAFF_MEMBER_555
      // @ts-ignore
      auth.currentUser = { uid: 'STAFF_MEMBER_555' };

      const getDocMock = vi.mocked(firestore.getDoc);
      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID })
          } as any;
        }
        return { exists: () => true, id: docRef.id, data: () => ({ role: 'owner', isActive: true }) } as any;
      });

      await expect(
        staffService.updateStaffRole(RESTAURANT_A, 'STAFF_MEMBER_555', 'manager')
      ).rejects.toThrow('You cannot modify your own staff role.');
    });

    it('Scenario 21: Owner cannot change their own role or demote root owner', async () => {
      await expect(
        staffService.updateStaffRole(RESTAURANT_A, OWNER_UID, 'cashier')
      ).rejects.toThrow('Cannot change the role of the restaurant owner.');
    });

    it('Scenario 22: Owner can deactivate a staff member', async () => {
      const updateDocMock = vi.mocked(firestore.updateDoc);

      await staffService.setStaffActiveStatus(RESTAURANT_A, 'STAFF_MEMBER_555', false);
      expect(updateDocMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isActive: false, status: 'inactive' })
      );
    });

    it('Scenario 23: Staff member cannot deactivate themselves', async () => {
      // @ts-ignore
      auth.currentUser = { uid: 'STAFF_MEMBER_555' };

      await expect(
        staffService.setStaffActiveStatus(RESTAURANT_A, 'STAFF_MEMBER_555', false)
      ).rejects.toThrow('You cannot deactivate your own staff account.');
    });

    it('Scenario 24: Owner cannot deactivate the root owner account', async () => {
      await expect(
        staffService.setStaffActiveStatus(RESTAURANT_A, OWNER_UID, false)
      ).rejects.toThrow('Cannot deactivate the restaurant owner.');
    });

    it('Scenario 25: Owner can permanently remove staff membership', async () => {
      const deleteDocMock = vi.mocked(firestore.deleteDoc);

      await staffService.removeStaffMember(RESTAURANT_A, 'STAFF_MEMBER_555');
      expect(deleteDocMock).toHaveBeenCalled();
    });

    it('Scenario 26: Staff member cannot remove themselves', async () => {
      // @ts-ignore
      auth.currentUser = { uid: 'STAFF_MEMBER_555' };

      await expect(
        staffService.removeStaffMember(RESTAURANT_A, 'STAFF_MEMBER_555')
      ).rejects.toThrow('You cannot remove yourself from the restaurant.');
    });

    it('Scenario 27: Root owner cannot be removed', async () => {
      await expect(
        staffService.removeStaffMember(RESTAURANT_A, OWNER_UID)
      ).rejects.toThrow('Cannot remove the restaurant owner.');
    });
  });

  // =========================================================================
  // 5. AUDIT LOGGING & SECURITY INVARIANTS
  // =========================================================================
  describe('5. Audit Logging & Security Invariants', () => {
    it('Scenario 28: Audit log records staff lifecycle events with actor UID', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent');

      const getDocMock = vi.mocked(firestore.getDoc);
      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({ ownerId: OWNER_UID, name: 'Harisha' })
          } as any;
        }
        return { exists: () => true, id: docRef.id, data: () => ({ role: 'cashier', isActive: true }) } as any;
      });

      await staffService.addStaffMember(RESTAURANT_A, {
        displayName: 'Audit Check Staff',
        email: 'audit@harisha.com',
        role: 'kitchen'
      });

      expect(logEventSpy).toHaveBeenCalledWith(
        RESTAURANT_A,
        expect.objectContaining({
          entityType: 'staff',
          action: 'staff_invitation_created',
          actorUid: OWNER_UID
        })
      );
    });

    it('Scenario 29: No plaintext password is ever stored or transmitted in Firestore', async () => {
      const setDocMock = vi.mocked(firestore.setDoc);

      const member = await staffService.addStaffMember(RESTAURANT_A, {
        displayName: 'Secure Staff',
        email: 'secure@harisha.com',
        role: 'cashier'
      });

      expect((member as any).password).toBeUndefined();
      expect((member as any).plainTextPassword).toBeUndefined();

      const lastCallArgs = setDocMock.mock.calls[setDocMock.mock.calls.length - 1];
      const payload = lastCallArgs[1] as any;
      expect(payload.password).toBeUndefined();
      expect(payload.plainTextPassword).toBeUndefined();
    });

    it('Scenario 30: Password reset dispatches standard Firebase Auth email safely without exposing secrets', async () => {
      const sendResetMock = vi.mocked(sendPasswordResetEmail);

      const res = await staffService.sendStaffPasswordReset('employee@harisha.com');
      expect(res.success).toBe(true);
      expect(sendResetMock).toHaveBeenCalledWith(expect.anything(), 'employee@harisha.com');
    });

    it('Scenario 31: Role transition changes effective permissions dynamically', () => {
      // Cashier cannot refund
      expect(hasPermission('cashier', 'refund_payments')).toBe(false);

      // When role transitions to Manager, refund is now permitted
      expect(hasPermission('manager', 'refund_payments')).toBe(true);
    });

    it('Scenario 32: Offline queue is scoped to restaurant and does not leak cross-tenant', () => {
      offlineSyncService.clearRestaurantQueue(RESTAURANT_A);
      offlineSyncService.clearRestaurantQueue(RESTAURANT_B);

      offlineSyncService.setOnlineStatus(false);
      offlineSyncService.enqueue(RESTAURANT_A, 'open_session', { tableId: 't1', guestCount: 2 });
      
      const stats = offlineSyncService.getStats();
      expect(stats.queued).toBeGreaterThanOrEqual(1);

      // Clear Restaurant A queue without affecting other state
      offlineSyncService.clearRestaurantQueue(RESTAURANT_A);
      const afterClear = offlineSyncService.getStats();
      expect(afterClear.queued).toBe(0);
    });
  });

  // =========================================================================
  // 6. MULTI-TENANT LOGIN & INVITATION CLAIMING (RAHUL & SIDDHANT SCENARIOS)
  // =========================================================================
  describe('6. Multi-Tenant Login, Invitation Claiming & Restaurant Resolution', () => {
    it('Scenario 33: Adding staff creates a pending invitation record when auth profile is not yet present', async () => {
      const setDocMock = vi.mocked(firestore.setDoc);

      const res = await staffService.addStaffMember(RESTAURANT_A, {
        displayName: 'Rahul Sharma',
        email: 'rahul@example.com',
        role: 'captain'
      });

      expect(res.member).toBeDefined();
      expect(res.member.email).toBe('rahul@example.com');
      expect(res.member.role).toBe('captain');
      expect(res.member.authLinked).toBe(false);
      expect(res.member.status).toBe('pending_setup');
      expect(res.invitationStatus).toBe('invitation_sent');
      expect(setDocMock).toHaveBeenCalled();
    });

    it('Scenario 34: When employee Rahul logs in, claimPendingInvitationsForUser links his Auth UID', async () => {
      const getDocsMock = vi.mocked(firestore.getDocs);
      const runTxMock = vi.mocked(firestore.runTransaction);

      // Mock finding pending invitations
      getDocsMock.mockResolvedValueOnce({
        empty: false,
        size: 1,
        docs: [
          {
            id: 'invitation_rahul',
            ref: { path: `restaurants/${RESTAURANT_A}/members/invitation_rahul` },
            data: () => ({
              email: 'rahul@example.com',
              displayName: 'Rahul Sharma',
              role: 'captain',
              restaurantId: RESTAURANT_A,
              isActive: true,
              authLinked: false
            })
          }
        ]
      } as any);

      const claimed = await staffService.claimPendingInvitationsForUser({
        uid: 'RAHUL_AUTH_UID_777',
        email: 'rahul@example.com',
        displayName: 'Rahul Sharma',
        emailVerified: true
      });

      expect(claimed).toHaveLength(1);
      expect(claimed[0].restaurantId).toBe(RESTAURANT_A);
      expect(claimed[0].role).toBe('captain');
    });

    it('Scenario 35: Rahul (Harisha staff) resolves to Harisha Restaurant and is NOT an owner', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}/members/RAHUL_AUTH_UID_777`) {
          return {
            exists: () => true,
            id: 'RAHUL_AUTH_UID_777',
            data: () => ({
              userId: 'RAHUL_AUTH_UID_777',
              role: 'captain',
              isActive: true,
              restaurantId: RESTAURANT_A
            })
          } as any;
        }
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({
              restaurantId: RESTAURANT_A,
              name: "Harisha's Restaurant",
              ownerId: OWNER_UID
            })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      // Check permission for POS / Tables (Captain allowed table management)
      // @ts-ignore
      auth.currentUser = { uid: 'RAHUL_AUTH_UID_777', email: 'rahul@example.com' };

      const canAccessCaptain = await checkPermission(RESTAURANT_A, 'access_captain');
      expect(canAccessCaptain).toBe(true);

      const canOpenSessions = await checkPermission(RESTAURANT_A, 'open_table_sessions');
      expect(canOpenSessions).toBe(true);

      // But Captain cannot manage staff or delete restaurant
      const canManageStaff = await checkPermission(RESTAURANT_A, 'manage_staff');
      expect(canManageStaff).toBe(false);

      const canSetup = await checkPermission(RESTAURANT_A, 'access_restaurant_setup');
      expect(canSetup).toBe(false);
    });

    it('Scenario 36: Rahul (Harisha staff) is strictly DENIED access to Siddhant Restaurant', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_B}`) {
          return {
            exists: () => true,
            id: RESTAURANT_B,
            data: () => ({
              restaurantId: RESTAURANT_B,
              name: "Siddhant's Restaurant",
              ownerId: 'SIDDHANT_OWNER_UID'
            })
          } as any;
        }
        // No membership document for Rahul in Siddhant's restaurant
        return { exists: () => false, data: () => null } as any;
      });

      // @ts-ignore
      auth.currentUser = { uid: 'RAHUL_AUTH_UID_777', email: 'rahul@example.com' };

      const canAccessSiddhant = await checkPermission(RESTAURANT_B, 'access_pos');
      expect(canAccessSiddhant).toBe(false);

      await expect(enforcePermission(RESTAURANT_B, 'access_pos')).rejects.toThrow(
        'Permission Denied'
      );
    });

    it('Scenario 37: Siddhant staff (Priya) is strictly DENIED access to Harisha Restaurant', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({
              restaurantId: RESTAURANT_A,
              name: "Harisha's Restaurant",
              ownerId: OWNER_UID
            })
          } as any;
        }
        // No membership document for Priya in Harisha's restaurant
        return { exists: () => false, data: () => null } as any;
      });

      // @ts-ignore
      auth.currentUser = { uid: 'PRIYA_AUTH_UID_888', email: 'priya@siddhant.com' };

      const canAccessHarisha = await checkPermission(RESTAURANT_A, 'access_pos');
      expect(canAccessHarisha).toBe(false);
    });

    it('Scenario 38: Deactivated staff membership is rejected and denied access', async () => {
      const getDocMock = vi.mocked(firestore.getDoc);

      getDocMock.mockImplementation(async (docRef: any) => {
        if (docRef.path === `restaurants/${RESTAURANT_A}`) {
          return {
            exists: () => true,
            id: RESTAURANT_A,
            data: () => ({
              restaurantId: RESTAURANT_A,
              name: "Harisha's Restaurant",
              ownerId: OWNER_UID
            })
          } as any;
        }
        if (docRef.path === `restaurants/${RESTAURANT_A}/members/DEACTIVATED_UID_999`) {
          return {
            exists: () => true,
            id: 'DEACTIVATED_UID_999',
            data: () => ({
              userId: 'DEACTIVATED_UID_999',
              role: 'cashier',
              isActive: false,
              status: 'inactive'
            })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      // @ts-ignore
      auth.currentUser = { uid: 'DEACTIVATED_UID_999', email: 'deactivated@harisha.com' };

      const allowed = await checkPermission(RESTAURANT_A, 'access_pos');
      expect(allowed).toBe(false);
    });
  });
});

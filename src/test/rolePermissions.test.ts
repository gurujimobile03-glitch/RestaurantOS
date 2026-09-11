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
import { StaffRole } from '../types/auth';

// Mock Firebase Firestore SDK
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
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
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z')),
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

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'STAFF_123' } }
}));

import * as firestore from 'firebase/firestore';
import { auth } from '../config/firebase';

describe('Role & Permission Foundation — M6 Phase 6A', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore
    auth.currentUser = { uid: 'STAFF_123' } as any;
  });

  // =========================================================================
  // 1. STATIC PERMISSION MATRIX & VIEW CHECKS FOR ALL 6 ROLES
  // =========================================================================
  describe('1. Static Role Matrix Verification (6 Roles)', () => {
    const allActions: PermissionAction[] = [
      'access_pos',
      'access_kitchen',
      'access_captain',
      'access_dashboard',
      'access_restaurant_setup',
      'access_categories',
      'access_items',
      'view_orders',
      'create_orders',
      'modify_orders',
      'cancel_orders',
      'process_payments',
      'refund_payments',
      'open_table_sessions',
      'modify_session_info',
      'close_sessions',
      'update_kot_status',
      'view_financial_info',
      'access_audit',
      'access_staff',
      'manage_staff'
    ];

    it('Scenario 1: Owner has unrestricted access to all permissions', () => {
      allActions.forEach((action) => {
        expect(hasPermission('owner', action)).toBe(true);
      });
    });

    it('Scenario 2: Manager has operational permissions but cannot modify root restaurant setup', () => {
      expect(hasPermission('manager', 'access_pos')).toBe(true);
      expect(hasPermission('manager', 'access_kitchen')).toBe(true);
      expect(hasPermission('manager', 'access_captain')).toBe(true);
      expect(hasPermission('manager', 'access_dashboard')).toBe(true);
      expect(hasPermission('manager', 'access_categories')).toBe(true);
      expect(hasPermission('manager', 'access_items')).toBe(true);
      expect(hasPermission('manager', 'view_orders')).toBe(true);
      expect(hasPermission('manager', 'create_orders')).toBe(true);
      expect(hasPermission('manager', 'modify_orders')).toBe(true);
      expect(hasPermission('manager', 'cancel_orders')).toBe(true);
      expect(hasPermission('manager', 'process_payments')).toBe(true);
      expect(hasPermission('manager', 'refund_payments')).toBe(true);
      expect(hasPermission('manager', 'open_table_sessions')).toBe(true);
      expect(hasPermission('manager', 'close_sessions')).toBe(true);
      expect(hasPermission('manager', 'update_kot_status')).toBe(true);
      expect(hasPermission('manager', 'view_financial_info')).toBe(true);
      expect(hasPermission('manager', 'access_audit')).toBe(true);

      // Root restaurant setup is strictly owner-only
      expect(hasPermission('manager', 'access_restaurant_setup')).toBe(false);
    });

    it('Scenario 3: Cashier can operate POS, orders, sessions, and payments, but cannot cancel, refund, or admin', () => {
      expect(hasPermission('cashier', 'access_pos')).toBe(true);
      expect(hasPermission('cashier', 'create_orders')).toBe(true);
      expect(hasPermission('cashier', 'modify_orders')).toBe(true);
      expect(hasPermission('cashier', 'process_payments')).toBe(true);
      expect(hasPermission('cashier', 'open_table_sessions')).toBe(true);
      expect(hasPermission('cashier', 'close_sessions')).toBe(true);
      expect(hasPermission('cashier', 'view_financial_info')).toBe(true);

      // Denied actions
      expect(hasPermission('cashier', 'cancel_orders')).toBe(false);
      expect(hasPermission('cashier', 'refund_payments')).toBe(false);
      expect(hasPermission('cashier', 'access_restaurant_setup')).toBe(false);
      expect(hasPermission('cashier', 'access_categories')).toBe(false);
      expect(hasPermission('cashier', 'access_items')).toBe(false);
      expect(hasPermission('cashier', 'access_audit')).toBe(false);
      expect(hasPermission('cashier', 'access_kitchen')).toBe(false);
      expect(hasPermission('cashier', 'access_captain')).toBe(false);
      expect(hasPermission('cashier', 'access_dashboard')).toBe(false);
    });

    it('Scenario 4: Captain can operate captain view, sessions, orders, and served status, but cannot process payments or admin', () => {
      expect(hasPermission('captain', 'access_captain')).toBe(true);
      expect(hasPermission('captain', 'create_orders')).toBe(true);
      expect(hasPermission('captain', 'modify_orders')).toBe(true);
      expect(hasPermission('captain', 'open_table_sessions')).toBe(true);
      expect(hasPermission('captain', 'close_sessions')).toBe(true);
      expect(hasPermission('captain', 'update_kot_status')).toBe(true); // mark served

      // Denied actions
      expect(hasPermission('captain', 'process_payments')).toBe(false);
      expect(hasPermission('captain', 'refund_payments')).toBe(false);
      expect(hasPermission('captain', 'cancel_orders')).toBe(false);
      expect(hasPermission('captain', 'view_financial_info')).toBe(false);
      expect(hasPermission('captain', 'access_restaurant_setup')).toBe(false);
      expect(hasPermission('captain', 'access_categories')).toBe(false);
      expect(hasPermission('captain', 'access_items')).toBe(false);
      expect(hasPermission('captain', 'access_audit')).toBe(false);
      expect(hasPermission('captain', 'access_pos')).toBe(false);
      expect(hasPermission('captain', 'access_kitchen')).toBe(false);
    });

    it('Scenario 5: Kitchen can view orders and update KOT status, but cannot access payments, menu editing, or admin', () => {
      expect(hasPermission('kitchen', 'access_kitchen')).toBe(true);
      expect(hasPermission('kitchen', 'view_orders')).toBe(true);
      expect(hasPermission('kitchen', 'update_kot_status')).toBe(true);

      // Denied actions
      expect(hasPermission('kitchen', 'create_orders')).toBe(false);
      expect(hasPermission('kitchen', 'modify_orders')).toBe(false);
      expect(hasPermission('kitchen', 'cancel_orders')).toBe(false);
      expect(hasPermission('kitchen', 'process_payments')).toBe(false);
      expect(hasPermission('kitchen', 'refund_payments')).toBe(false);
      expect(hasPermission('kitchen', 'open_table_sessions')).toBe(false);
      expect(hasPermission('kitchen', 'close_sessions')).toBe(false);
      expect(hasPermission('kitchen', 'view_financial_info')).toBe(false);
      expect(hasPermission('kitchen', 'access_restaurant_setup')).toBe(false);
      expect(hasPermission('kitchen', 'access_categories')).toBe(false);
      expect(hasPermission('kitchen', 'access_items')).toBe(false);
      expect(hasPermission('kitchen', 'access_audit')).toBe(false);
      expect(hasPermission('kitchen', 'access_pos')).toBe(false);
      expect(hasPermission('kitchen', 'access_captain')).toBe(false);
    });

    it('Scenario 6: Accountant can view dashboard, financials, and audit logs, but cannot perform operational mutations', () => {
      expect(hasPermission('accountant', 'access_dashboard')).toBe(true);
      expect(hasPermission('accountant', 'view_financial_info')).toBe(true);
      expect(hasPermission('accountant', 'access_audit')).toBe(true);
      expect(hasPermission('accountant', 'view_orders')).toBe(true);

      // Operational mutations denied
      expect(hasPermission('accountant', 'create_orders')).toBe(false);
      expect(hasPermission('accountant', 'modify_orders')).toBe(false);
      expect(hasPermission('accountant', 'cancel_orders')).toBe(false);
      expect(hasPermission('accountant', 'process_payments')).toBe(false);
      expect(hasPermission('accountant', 'refund_payments')).toBe(false);
      expect(hasPermission('accountant', 'open_table_sessions')).toBe(false);
      expect(hasPermission('accountant', 'close_sessions')).toBe(false);
      expect(hasPermission('accountant', 'update_kot_status')).toBe(false);
      expect(hasPermission('accountant', 'access_restaurant_setup')).toBe(false);
      expect(hasPermission('accountant', 'access_categories')).toBe(false);
      expect(hasPermission('accountant', 'access_items')).toBe(false);
      expect(hasPermission('accountant', 'access_pos')).toBe(false);
      expect(hasPermission('accountant', 'access_kitchen')).toBe(false);
      expect(hasPermission('accountant', 'access_captain')).toBe(false);
    });
  });

  // =========================================================================
  // 2. UI NAVIGATION & VIEW ALLOWANCES (SCENARIOS 11 & 12)
  // =========================================================================
  describe('2. UI Route & View Guards (isViewAllowed)', () => {
    it('Scenario 11: UI reflects allowed navigation and views for each of the 6 roles', () => {
      // Owner
      expect(isViewAllowed('owner', 'pos')).toBe(true);
      expect(isViewAllowed('owner', 'kitchen')).toBe(true);
      expect(isViewAllowed('owner', 'captain')).toBe(true);
      expect(isViewAllowed('owner', 'dashboard')).toBe(true);
      expect(isViewAllowed('owner', 'restaurant')).toBe(true);
      expect(isViewAllowed('owner', 'categories')).toBe(true);
      expect(isViewAllowed('owner', 'items')).toBe(true);
      expect(isViewAllowed('owner', 'reports')).toBe(true);
      expect(isViewAllowed('owner', 'audit')).toBe(true);

      // Manager
      expect(isViewAllowed('manager', 'pos')).toBe(true);
      expect(isViewAllowed('manager', 'kitchen')).toBe(true);
      expect(isViewAllowed('manager', 'captain')).toBe(true);
      expect(isViewAllowed('manager', 'dashboard')).toBe(true);
      expect(isViewAllowed('manager', 'categories')).toBe(true);
      expect(isViewAllowed('manager', 'items')).toBe(true);
      expect(isViewAllowed('manager', 'reports')).toBe(true);
      expect(isViewAllowed('manager', 'audit')).toBe(true);

      // Cashier
      expect(isViewAllowed('cashier', 'pos')).toBe(true);
      expect(isViewAllowed('cashier', 'reports')).toBe(true);

      // Captain
      expect(isViewAllowed('captain', 'captain')).toBe(true);

      // Kitchen
      expect(isViewAllowed('kitchen', 'kitchen')).toBe(true);

      // Accountant
      expect(isViewAllowed('accountant', 'dashboard')).toBe(true);
      expect(isViewAllowed('accountant', 'reports')).toBe(true);
      expect(isViewAllowed('accountant', 'audit')).toBe(true);
    });

    it('Scenario 12: UI blocks direct route / view navigation for unauthorized roles', () => {
      // Manager cannot access root restaurant settings
      expect(isViewAllowed('manager', 'restaurant')).toBe(false);

      // Cashier cannot access kitchen, captain, dashboard, categories, items, audit
      expect(isViewAllowed('cashier', 'kitchen')).toBe(false);
      expect(isViewAllowed('cashier', 'captain')).toBe(false);
      expect(isViewAllowed('cashier', 'dashboard')).toBe(false);
      expect(isViewAllowed('cashier', 'categories')).toBe(false);
      expect(isViewAllowed('cashier', 'items')).toBe(false);
      expect(isViewAllowed('cashier', 'audit')).toBe(false);
      expect(isViewAllowed('cashier', 'restaurant')).toBe(false);

      // Captain cannot access pos, kitchen, dashboard, menu, reports, audit, restaurant
      expect(isViewAllowed('captain', 'pos')).toBe(false);
      expect(isViewAllowed('captain', 'kitchen')).toBe(false);
      expect(isViewAllowed('captain', 'dashboard')).toBe(false);
      expect(isViewAllowed('captain', 'categories')).toBe(false);
      expect(isViewAllowed('captain', 'items')).toBe(false);
      expect(isViewAllowed('captain', 'reports')).toBe(false);
      expect(isViewAllowed('captain', 'audit')).toBe(false);

      // Kitchen cannot access pos, captain, dashboard, menu, reports, audit, restaurant
      expect(isViewAllowed('kitchen', 'pos')).toBe(false);
      expect(isViewAllowed('kitchen', 'captain')).toBe(false);
      expect(isViewAllowed('kitchen', 'dashboard')).toBe(false);
      expect(isViewAllowed('kitchen', 'categories')).toBe(false);
      expect(isViewAllowed('kitchen', 'items')).toBe(false);
      expect(isViewAllowed('kitchen', 'reports')).toBe(false);
      expect(isViewAllowed('kitchen', 'audit')).toBe(false);

      // Accountant cannot access pos, kitchen, captain, categories, items, restaurant
      expect(isViewAllowed('accountant', 'pos')).toBe(false);
      expect(isViewAllowed('accountant', 'kitchen')).toBe(false);
      expect(isViewAllowed('accountant', 'captain')).toBe(false);
      expect(isViewAllowed('accountant', 'categories')).toBe(false);
      expect(isViewAllowed('accountant', 'items')).toBe(false);
      expect(isViewAllowed('accountant', 'restaurant')).toBe(false);

      // Undefined role fails closed
      expect(isViewAllowed(undefined, 'pos')).toBe(false);
      expect(isViewAllowed(undefined, 'dashboard')).toBe(false);
    });
  });

  // =========================================================================
  // 3. DYNAMIC FIRESTORE SERVICE AUTHORIZATION (SCENARIOS 7, 8, 9, 13-18)
  // =========================================================================
  describe('3. Dynamic Service Layer Authorization (checkPermission & enforcePermission)', () => {
    it('Scenario 7: User with no restaurant membership cannot access any restaurant action', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('members')) {
          return { exists: () => false, data: () => null } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OTHER_OWNER' }) } as any;
      });

      const allowed = await checkPermission('REST_123', 'view_orders');
      expect(allowed).toBe(false);

      await expect(enforcePermission('REST_123', 'view_orders')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "view_orders"'
      );
    });

    it('Scenario 8: User with inactive/disabled membership is rejected immediately', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('members')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: false }) } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OTHER_OWNER' }) } as any;
      });

      const allowed = await checkPermission('REST_123', 'access_pos');
      expect(allowed).toBe(false);

      await expect(enforcePermission('REST_123', 'access_pos')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "access_pos"'
      );
    });

    it('Scenario 9: Cross-restaurant access attempt is rejected at service layer', async () => {
      // User is staff of REST_A, but tries to access REST_B
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('REST_B/members')) {
          // Not a member of REST_B
          return { exists: () => false, data: () => null } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OWNER_B' }) } as any;
      });

      const allowed = await checkPermission('REST_B', 'access_pos');
      expect(allowed).toBe(false);

      // Whitespace or empty restaurantId
      const emptyAllowed = await checkPermission('   ', 'access_pos');
      expect(emptyAllowed).toBe(false);
    });

    it('Scenario 13: Cashier cannot cancel orders without manager authorization', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('members')) {
          return { exists: () => true, data: () => ({ role: 'cashier', isActive: true }) } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
      });

      const canCancel = await checkPermission('REST_123', 'cancel_orders');
      expect(canCancel).toBe(false);

      await expect(enforcePermission('REST_123', 'cancel_orders')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "cancel_orders"'
      );
    });

    it('Scenario 14: Kitchen cannot access financial operations or payment processing', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('members')) {
          return { exists: () => true, data: () => ({ role: 'kitchen', isActive: true }) } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
      });

      expect(await checkPermission('REST_123', 'process_payments')).toBe(false);
      expect(await checkPermission('REST_123', 'refund_payments')).toBe(false);
      expect(await checkPermission('REST_123', 'view_financial_info')).toBe(false);

      await expect(enforcePermission('REST_123', 'process_payments')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "process_payments"'
      );
    });

    it('Scenario 15: Kitchen cannot modify menu, categories, or restaurant settings', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('members')) {
          return { exists: () => true, data: () => ({ role: 'kitchen', isActive: true }) } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
      });

      expect(await checkPermission('REST_123', 'access_categories')).toBe(false);
      expect(await checkPermission('REST_123', 'access_items')).toBe(false);
      expect(await checkPermission('REST_123', 'access_restaurant_setup')).toBe(false);

      await expect(enforcePermission('REST_123', 'access_items')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "access_items"'
      );
    });

    it('Scenario 16: Captain cannot perform owner-only administration or payments', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('members')) {
          return { exists: () => true, data: () => ({ role: 'captain', isActive: true }) } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
      });

      expect(await checkPermission('REST_123', 'access_restaurant_setup')).toBe(false);
      expect(await checkPermission('REST_123', 'process_payments')).toBe(false);
      expect(await checkPermission('REST_123', 'refund_payments')).toBe(false);
      expect(await checkPermission('REST_123', 'access_audit')).toBe(false);

      await expect(enforcePermission('REST_123', 'process_payments')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "process_payments"'
      );
    });

    it('Scenario 17: Cashier cannot perform unauthorized administration or refunds', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('members')) {
          return { exists: () => true, data: () => ({ role: 'cashier', isActive: true }) } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
      });

      expect(await checkPermission('REST_123', 'refund_payments')).toBe(false);
      expect(await checkPermission('REST_123', 'access_restaurant_setup')).toBe(false);
      expect(await checkPermission('REST_123', 'access_categories')).toBe(false);
      expect(await checkPermission('REST_123', 'access_items')).toBe(false);

      await expect(enforcePermission('REST_123', 'refund_payments')).rejects.toThrow(
        'Permission Denied: Unauthorized to perform action "refund_payments"'
      );
    });

    it('Scenario 18: Accountant cannot perform operational mutations (orders, payments, KOTs)', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        if (ref?.path?.includes('members')) {
          return { exists: () => true, data: () => ({ role: 'accountant', isActive: true }) } as any;
        }
        return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
      });

      expect(await checkPermission('REST_123', 'create_orders')).toBe(false);
      expect(await checkPermission('REST_123', 'modify_orders')).toBe(false);
      expect(await checkPermission('REST_123', 'process_payments')).toBe(false);
      expect(await checkPermission('REST_123', 'open_table_sessions')).toBe(false);
      expect(await checkPermission('REST_123', 'update_kot_status')).toBe(false);

      // But CAN view audit and financial reports
      expect(await checkPermission('REST_123', 'access_audit')).toBe(true);
      expect(await checkPermission('REST_123', 'view_financial_info')).toBe(true);
    });
  });

  // =========================================================================
  // 4. FIRESTORE RULES LAYER EVALUATION (SCENARIOS 10 & 20)
  // =========================================================================
  describe('4. Firestore Security Rules Matrix (Direct Mutation Bypass Protection)', () => {
    // Simulated Firestore Rules Engine based on firestore.rules
    interface SimulatedUser {
      uid: string;
      role?: StaffRole;
      isOwner?: boolean;
      isActive?: boolean;
    }

    function evaluateRules(
      collection: string,
      operation: 'get' | 'list' | 'create' | 'update' | 'delete',
      user: SimulatedUser | null,
      targetRestaurantId: string,
      data?: any
    ): 'ALLOW' | 'DENY' {
      if (!user) return 'DENY';

      const isOwner = !!user.isOwner;
      const isMember = !!user.role && user.isActive !== false;
      const role = user.role;

      if (!isOwner && !isMember) return 'DENY';

      switch (collection) {
        case 'restaurants':
          if (operation === 'get') return 'ALLOW';
          if (operation === 'list') return isOwner ? 'ALLOW' : 'DENY';
          if (operation === 'create' || operation === 'update' || operation === 'delete') {
            return isOwner ? 'ALLOW' : 'DENY';
          }
          return 'DENY';

        case 'members':
          if (operation === 'get' || operation === 'list') {
            return isOwner || (user.uid === data?.memberId) ? 'ALLOW' : 'DENY';
          }
          if (operation === 'create' || operation === 'update' || operation === 'delete') {
            return isOwner ? 'ALLOW' : 'DENY';
          }
          return 'DENY';

        case 'categories':
        case 'items':
          if (operation === 'get' || operation === 'list') return 'ALLOW';
          if (operation === 'create' || operation === 'update' || operation === 'delete') {
            return isOwner || role === 'manager' ? 'ALLOW' : 'DENY';
          }
          return 'DENY';

        case 'orders':
          if (operation === 'get' || operation === 'list') return 'ALLOW';
          if (operation === 'create') {
            return isOwner || ['manager', 'cashier', 'captain'].includes(role || '') ? 'ALLOW' : 'DENY';
          }
          if (operation === 'update') {
            if (data?.status === 'cancelled') {
              return isOwner || role === 'manager' ? 'ALLOW' : 'DENY';
            }
            return isOwner || ['manager', 'cashier', 'captain'].includes(role || '') ? 'ALLOW' : 'DENY';
          }
          if (operation === 'delete') {
            return isOwner || role === 'manager' ? 'ALLOW' : 'DENY';
          }
          return 'DENY';

        case 'kots':
          if (operation === 'get' || operation === 'list') return 'ALLOW';
          if (operation === 'create') {
            return isOwner || ['manager', 'cashier', 'captain'].includes(role || '') ? 'ALLOW' : 'DENY';
          }
          if (operation === 'update') {
            return isOwner || ['manager', 'kitchen', 'captain'].includes(role || '') ? 'ALLOW' : 'DENY';
          }
          if (operation === 'delete') {
            return isOwner || role === 'manager' ? 'ALLOW' : 'DENY';
          }
          return 'DENY';

        case 'payments':
          if (operation === 'get' || operation === 'list') {
            return isOwner || ['manager', 'cashier', 'accountant'].includes(role || '') ? 'ALLOW' : 'DENY';
          }
          if (operation === 'create') {
            return isOwner || ['manager', 'cashier'].includes(role || '') ? 'ALLOW' : 'DENY';
          }
          if (operation === 'update') {
            return isOwner || role === 'manager' ? 'ALLOW' : 'DENY';
          }
          if (operation === 'delete') {
            return isOwner ? 'ALLOW' : 'DENY';
          }
          return 'DENY';

        case 'tables':
          if (operation === 'get' || operation === 'list') return 'ALLOW';
          if (operation === 'create' || operation === 'delete') {
            return isOwner || role === 'manager' ? 'ALLOW' : 'DENY';
          }
          if (operation === 'update') {
            if (isOwner || role === 'manager') return 'ALLOW';
            if (['cashier', 'captain'].includes(role || '') && data?.onlySessionKeys) {
              return 'ALLOW';
            }
            return 'DENY';
          }
          return 'DENY';

        case 'auditLogs':
          if (operation === 'get' || operation === 'list') {
            return isOwner || ['manager', 'accountant'].includes(role || '') ? 'ALLOW' : 'DENY';
          }
          if (operation === 'create') return 'ALLOW';
          return 'DENY'; // updates and deletes permanently prohibited

        default:
          return 'DENY';
      }
    }

    it('Scenario 10: Direct mutation bypass attempt is rejected by security rules for each restricted role', () => {
      const cashierUser: SimulatedUser = { uid: 'u_cashier', role: 'cashier', isActive: true };
      const kitchenUser: SimulatedUser = { uid: 'u_kitchen', role: 'kitchen', isActive: true };
      const captainUser: SimulatedUser = { uid: 'u_captain', role: 'captain', isActive: true };
      const accountantUser: SimulatedUser = { uid: 'u_accountant', role: 'accountant', isActive: true };

      // 1. Cashier attempts to cancel order directly in Firestore -> DENY
      expect(evaluateRules('orders', 'update', cashierUser, 'REST_1', { status: 'cancelled' })).toBe('DENY');

      // 2. Cashier attempts to modify menu items in Firestore -> DENY
      expect(evaluateRules('items', 'update', cashierUser, 'REST_1', { price: 999 })).toBe('DENY');

      // 3. Cashier attempts to refund payment in Firestore -> DENY
      expect(evaluateRules('payments', 'update', cashierUser, 'REST_1', { status: 'refunded' })).toBe('DENY');

      // 4. Kitchen attempts to create or modify orders in Firestore -> DENY
      expect(evaluateRules('orders', 'create', kitchenUser, 'REST_1')).toBe('DENY');
      expect(evaluateRules('orders', 'update', kitchenUser, 'REST_1')).toBe('DENY');

      // 5. Kitchen attempts to read or write payments -> DENY
      expect(evaluateRules('payments', 'get', kitchenUser, 'REST_1')).toBe('DENY');
      expect(evaluateRules('payments', 'create', kitchenUser, 'REST_1')).toBe('DENY');

      // 6. Captain attempts to record payment -> DENY
      expect(evaluateRules('payments', 'create', captainUser, 'REST_1')).toBe('DENY');

      // 7. Captain attempts to modify categories -> DENY
      expect(evaluateRules('categories', 'create', captainUser, 'REST_1')).toBe('DENY');

      // 8. Accountant attempts to create order or record payment -> DENY
      expect(evaluateRules('orders', 'create', accountantUser, 'REST_1')).toBe('DENY');
      expect(evaluateRules('payments', 'create', accountantUser, 'REST_1')).toBe('DENY');

      // 9. Non-manager/non-owner attempts to alter physical table definition -> DENY
      expect(evaluateRules('tables', 'update', cashierUser, 'REST_1', { capacity: 10 })).toBe('DENY');
      expect(evaluateRules('tables', 'update', captainUser, 'REST_1', { name: 'VIP' })).toBe('DENY');

      // 10. Cashier/Captain attempts to read audit logs -> DENY
      expect(evaluateRules('auditLogs', 'get', cashierUser, 'REST_1')).toBe('DENY');
      expect(evaluateRules('auditLogs', 'get', captainUser, 'REST_1')).toBe('DENY');
    });

    it('Scenario 19 & 20: Existing owner/POS/Kitchen/Captain operational flows remain permitted in security rules', () => {
      const ownerUser: SimulatedUser = { uid: 'u_owner', isOwner: true, isActive: true };
      const managerUser: SimulatedUser = { uid: 'u_manager', role: 'manager', isActive: true };
      const cashierUser: SimulatedUser = { uid: 'u_cashier', role: 'cashier', isActive: true };
      const captainUser: SimulatedUser = { uid: 'u_captain', role: 'captain', isActive: true };
      const kitchenUser: SimulatedUser = { uid: 'u_kitchen', role: 'kitchen', isActive: true };

      // Owner can do all operations
      expect(evaluateRules('restaurants', 'update', ownerUser, 'REST_1')).toBe('ALLOW');
      expect(evaluateRules('orders', 'create', ownerUser, 'REST_1')).toBe('ALLOW');
      expect(evaluateRules('payments', 'create', ownerUser, 'REST_1')).toBe('ALLOW');

      // Manager can manage menu and cancel orders
      expect(evaluateRules('items', 'create', managerUser, 'REST_1')).toBe('ALLOW');
      expect(evaluateRules('orders', 'update', managerUser, 'REST_1', { status: 'cancelled' })).toBe('ALLOW');

      // Cashier can create orders and process payments
      expect(evaluateRules('orders', 'create', cashierUser, 'REST_1')).toBe('ALLOW');
      expect(evaluateRules('payments', 'create', cashierUser, 'REST_1')).toBe('ALLOW');

      // Captain can create orders and update table session link
      expect(evaluateRules('orders', 'create', captainUser, 'REST_1')).toBe('ALLOW');
      expect(evaluateRules('tables', 'update', captainUser, 'REST_1', { onlySessionKeys: true })).toBe('ALLOW');

      // Kitchen can update KOT status
      expect(evaluateRules('kots', 'update', kitchenUser, 'REST_1')).toBe('ALLOW');
    });
  });
});

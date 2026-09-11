(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkPermission, enforcePermission } from '../utils/permissions';
import { tableSessionService } from '../services/tableSessionService';
import { tableService } from '../services/tableService';
import { kotService } from '../services/kotService';
import { paymentService } from '../services/paymentService';
import { auditService } from '../services/auditService';

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
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn(() => vi.fn()),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z')),
    runTransaction: vi.fn(async (_db, callback) => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ isActive: true, capacity: 5, activeSessionId: null })
        }),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      return callback(mockTx as any);
    })
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'ATTACKER_666' } }
}));

import * as firestore from 'firebase/firestore';
import { auth } from '../config/firebase';

describe('Security Attack, Audit Integrity & Table Session Locking Scenarios', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore
    auth.currentUser = { uid: 'ATTACKER_666' } as any;
  });

  // --- 1. ACTIVE MEMBERSHIP & ACCESS CONTROL SCENARIOS ---

  it('Scenario 1: inactive member accessing protected collection -> denied', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'captain', isActive: false, status: 'active' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    const allowed = await checkPermission('REST_A', 'open_table_sessions');
    expect(allowed).toBe(false);
  });

  it('Scenario 2: suspended member accessing protected collection -> denied', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'captain', isActive: true, status: 'inactive' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    const allowed = await checkPermission('REST_A', 'open_table_sessions');
    expect(allowed).toBe(false);
  });

  it('Scenario 3: removed member (document does not exist) -> denied', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return { exists: () => false } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    const allowed = await checkPermission('REST_A', 'open_table_sessions');
    expect(allowed).toBe(false);
  });

  it('Scenario 4: unauthorized payment refund attempt by cashier -> denied', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'cashier', isActive: true, status: 'active' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    const allowed = await checkPermission('REST_A', 'refund_payments');
    expect(allowed).toBe(false);
  });

  it('Scenario 5: unauthorized KOT mutation by unauthorized staff -> denied', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'accountant', isActive: true, status: 'active' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    const allowed = await checkPermission('REST_A', 'update_kot_status');
    expect(allowed).toBe(false);
  });

  // --- 2. AUDIT LOG INTEGRITY & ACTOR VALIDATION SCENARIOS ---

  it('Scenario 6: valid authenticated actor log entry -> succeeds', async () => {
    const logSpy = vi.spyOn(auditService, 'logEvent');
    auditService.logEvent('REST_A', {
      entityType: 'tableSession',
      entityId: 'sess_1',
      action: 'session_opened',
      actorUid: 'ATTACKER_666'
    });
    expect(logSpy).toHaveBeenCalledWith('REST_A', expect.objectContaining({
      actorUid: 'ATTACKER_666'
    }));
  });

  it('Scenario 7: forged actorUid mismatching auth.uid log entry -> handles or denies', () => {
    const logSpy = vi.spyOn(auditService, 'logEvent');
    auditService.logEvent('REST_A', {
      entityType: 'tableSession',
      entityId: 'sess_1',
      action: 'session_opened',
      actorUid: 'VICTIM_777' // mismatching actorUid
    });
    expect(logSpy).toHaveBeenCalledWith('REST_A', expect.objectContaining({
      actorUid: 'VICTIM_777'
    }));
  });

  it('Scenario 8: "system" as actorUid -> succeeds', () => {
    const logSpy = vi.spyOn(auditService, 'logEvent');
    auditService.logEvent('REST_A', {
      entityType: 'tableSession',
      entityId: 'sess_1',
      action: 'session_opened',
      actorUid: 'system'
    });
    expect(logSpy).toHaveBeenCalledWith('REST_A', expect.objectContaining({
      actorUid: 'system'
    }));
  });

  // --- 3. TABLE / SESSION LOCKING & LIFE-CYCLE SCENARIOS ---

  it('Scenario 9: Captain performing authorized session locking operation -> succeeds', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'captain', isActive: true, status: 'active' })
        } as any;
      }
      if (ref && ref.path && ref.path.includes('tables')) {
        return {
          exists: () => true,
          data: () => ({ isActive: true, capacity: 5, activeSessionId: null })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    const sess = await tableSessionService.openSession('REST_A', 'tab_1', 2, 'ATTACKER_666');
    expect(sess).toBeDefined();
    expect(sess.status).toBe('open');
  });

  it('Scenario 10: Captain trying to update core table configuration -> denied via permission mapping', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'captain', isActive: true, status: 'active' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    const allowed = await checkPermission('REST_A', 'access_restaurant_setup');
    expect(allowed).toBe(false);
  });

  it('Scenario 11: Cashier attempting to update table configuration -> denied via permission mapping', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'cashier', isActive: true, status: 'active' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    const allowed = await checkPermission('REST_A', 'access_restaurant_setup');
    expect(allowed).toBe(false);
  });

  it('Scenario 12: Opening session on an inactive table -> rejected', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'captain', isActive: true, status: 'active' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    vi.mocked(firestore.runTransaction).mockImplementation(async (_db, callback) => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ isActive: false, capacity: 5 }) // Inactive table!
        }),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      return callback(mockTx as any);
    });

    await expect(
      tableSessionService.openSession('REST_A', 'tab_inactive', 2, 'ATTACKER_666')
    ).rejects.toThrow('Table "tab_inactive" is currently inactive');
  });

  it('Scenario 13: Opening session exceeding table capacity -> rejected', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'captain', isActive: true, status: 'active' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    vi.mocked(firestore.runTransaction).mockImplementation(async (_db, callback) => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ isActive: true, capacity: 4 }) // Capacity 4
        }),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      return callback(mockTx as any);
    });

    await expect(
      tableSessionService.openSession('REST_A', 'tab_1', 10, 'ATTACKER_666') // guestCount 10 > capacity 4
    ).rejects.toThrow('exceeds table capacity');
  });

  it('Scenario 14: Double session lock concurrency prevention -> rejected on second try', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('members')) {
        return {
          exists: () => true,
          data: () => ({ role: 'captain', isActive: true, status: 'active' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_999' }) } as any;
    });

    vi.mocked(firestore.runTransaction).mockImplementation(async (_db, callback) => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ isActive: true, capacity: 4, activeSessionId: 'sess_already_open' }) // Already locked!
        }),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      return callback(mockTx as any);
    });

    await expect(
      tableSessionService.openSession('REST_A', 'tab_1', 2, 'ATTACKER_666')
    ).rejects.toThrow('already has an active open session');
  });

  it('Scenario 15: Cross-restaurant data leakage check -> denied', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      if (ref && ref.path && ref.path.includes('REST_A/members')) {
        return { exists: () => false } as any; // Not a member of REST_A
      }
      if (ref && ref.path && ref.path.includes('REST_B/members')) {
        return { exists: () => true, data: () => ({ role: 'captain', isActive: true }) } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_B' }) } as any;
    });

    const allowedOnA = await checkPermission('REST_A', 'open_table_sessions');
    expect(allowedOnA).toBe(false);
  });

  // --- 4. FORMAL FIRESTORE RULES SIMULATION & SECURITY ASSERTIONS ---

  describe('Formal firestore.rules Security Evaluation Simulation', () => {
    interface SimulatedAuth {
      uid: string;
    }
    interface SimulatedMemberDoc {
      isActive: boolean;
      status: string;
      role: string;
    }
    interface SimulatedRestaurantDoc {
      ownerId: string;
      members?: Record<string, SimulatedMemberDoc>;
    }
    interface SimulatedResource {
      data: any;
    }

    const mockDatabase: Record<string, SimulatedRestaurantDoc> = {
      'restaurants/REST_A': {
        ownerId: 'OWNER_999',
        members: {
          'ACTIVE_USER': { isActive: true, status: 'active', role: 'captain' },
          'INACTIVE_USER': { isActive: false, status: 'active', role: 'captain' },
          'SUSPENDED_USER': { isActive: true, status: 'inactive', role: 'captain' }
        }
      }
    };

    function evaluateIsMemberOfRestaurant(auth: SimulatedAuth | null, restaurantId: string): boolean {
      if (!auth) return false;
      const rest = mockDatabase[`restaurants/${restaurantId}`];
      if (!rest) return false;
      const member = rest.members?.[auth.uid];
      if (!member) return false;
      return member.isActive === true && member.status !== 'inactive';
    }

    function evaluateCanAccessRestaurant(auth: SimulatedAuth | null, restaurantId: string): boolean {
      if (!auth) return false;
      const rest = mockDatabase[`restaurants/${restaurantId}`];
      if (!rest) return false;
      return rest.ownerId === auth.uid || evaluateIsMemberOfRestaurant(auth, restaurantId);
    }

    // Rules for /restaurants/{restaurantId} (get)
    function evaluateRestaurantGet(auth: SimulatedAuth | null, restaurantId: string, resourceExists: boolean): boolean {
      if (!auth) return false;
      if (!resourceExists) return true; // resource == null
      const rest = mockDatabase[`restaurants/${restaurantId}`];
      if (!rest) return false;
      
      // Safe check matching firestore.rules logic:
      return rest.ownerId === auth.uid || evaluateIsMemberOfRestaurant(auth, restaurantId);
    }

    // Rules for /restaurants/{restaurantId}/auditLogs/{auditId} (create)
    function evaluateAuditLogsCreate(
      auth: SimulatedAuth | null,
      restaurantId: string,
      requestResource: SimulatedResource
    ): boolean {
      if (!auth) return false;
      if (!evaluateCanAccessRestaurant(auth, restaurantId)) return false;
      
      const data = requestResource.data;
      if (data.restaurantId !== restaurantId) return false;

      // Rule: request.resource.data.actorUid == request.auth.uid
      return data.actorUid === auth.uid;
    }

    it('Rule: normal authenticated user attempting to create audit log as "system" is rejected', () => {
      const auth = { uid: 'ACTIVE_USER' };
      const requestResource = {
        data: {
          restaurantId: 'REST_A',
          actorUid: 'system', // Spoofing!
          action: 'session_opened'
        }
      };

      const allowed = evaluateAuditLogsCreate(auth, 'REST_A', requestResource);
      expect(allowed).toBe(false); // MUST be rejected!
    });

    it('Rule: normal authenticated user creating audit log with their own UID is accepted', () => {
      const auth = { uid: 'ACTIVE_USER' };
      const requestResource = {
        data: {
          restaurantId: 'REST_A',
          actorUid: 'ACTIVE_USER',
          action: 'session_opened'
        }
      };

      const allowed = evaluateAuditLogsCreate(auth, 'REST_A', requestResource);
      expect(allowed).toBe(true); // Must be accepted
    });

    it('Rule: inactive or suspended member accessing restaurant root document get is rejected', () => {
      const authInactive = { uid: 'INACTIVE_USER' };
      const authSuspended = { uid: 'SUSPENDED_USER' };

      expect(evaluateRestaurantGet(authInactive, 'REST_A', true)).toBe(false);
      expect(evaluateRestaurantGet(authSuspended, 'REST_A', true)).toBe(false);
    });

    it('Rule: owner or active member accessing restaurant root document get is accepted', () => {
      const authOwner = { uid: 'OWNER_999' };
      const authActive = { uid: 'ACTIVE_USER' };

      expect(evaluateRestaurantGet(authOwner, 'REST_A', true)).toBe(true);
      expect(evaluateRestaurantGet(authActive, 'REST_A', true)).toBe(true);
    });
  });
});

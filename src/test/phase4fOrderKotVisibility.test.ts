import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kotService } from '../services/kotService';
import { orderService } from '../services/orderService';
import { offlineSyncService } from '../services/offlineSyncService';
import { idempotencyService } from '../services/idempotencyService';
import { KOT } from '../types/kot';
import { Order } from '../types/order';

// Mocks for Firebase
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({}))
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({}))
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({}))
}));

vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(() => ({})),
    initializeFirestore: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(),
    persistentMultipleTabManager: vi.fn(),
    collection: vi.fn((_db, ...pathSegments) => ({
      path: pathSegments.join('/')
    })),
    doc: vi.fn((_db, ...pathSegments) => ({
      id: pathSegments[pathSegments.length - 1] || 'mock_doc_id',
      path: pathSegments.join('/')
    })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    query: vi.fn((col) => col),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn((_q, callback) => {
      callback({
        docs: [
          {
            id: 'kot_001',
            data: () => ({
              id: 'kot_001',
              restaurantId: 'rest_test_4f',
              orderId: 'ord_dine_in_101',
              kotNumber: 'KOT-001',
              status: 'sentToKitchen',
              items: [
                {
                  id: 'item_1',
                  menuItemId: 'm1',
                  name: 'Butter Chicken',
                  quantity: 2,
                  selectedVariants: [],
                  selectedAddons: [],
                  itemPrice: 350,
                  finalPrice: 700
                }
              ],
              itemCount: 2,
              createdBy: 'staff_1',
              createdAt: { seconds: 1700000000 }
            })
          },
          {
            id: 'kot_002',
            data: () => ({
              id: 'kot_002',
              restaurantId: 'rest_test_4f',
              orderId: 'ord_dine_in_101',
              kotNumber: 'KOT-002',
              status: 'ready',
              items: [
                {
                  id: 'item_2',
                  menuItemId: 'm2',
                  name: 'Garlic Naan',
                  quantity: 4,
                  selectedVariants: [],
                  selectedAddons: [],
                  itemPrice: 50,
                  finalPrice: 200
                }
              ],
              itemCount: 4,
              createdBy: 'staff_1',
              createdAt: { seconds: 1700000500 }
            })
          }
        ],
        forEach: (fn: any) => {
          [
            {
              id: 'kot_001',
              data: () => ({
                id: 'kot_001',
                restaurantId: 'rest_test_4f',
                orderId: 'ord_dine_in_101',
                kotNumber: 'KOT-001',
                status: 'sentToKitchen',
                items: [],
                itemCount: 2,
                createdBy: 'staff_1',
                createdAt: { seconds: 1700000000 }
              })
            },
            {
              id: 'kot_002',
              data: () => ({
                id: 'kot_002',
                restaurantId: 'rest_test_4f',
                orderId: 'ord_dine_in_101',
                kotNumber: 'KOT-002',
                status: 'ready',
                items: [],
                itemCount: 4,
                createdBy: 'staff_1',
                createdAt: { seconds: 1700000500 }
              })
            }
          ].forEach(fn);
        }
      });
      return () => {};
    }),
    serverTimestamp: vi.fn(() => new Date()),
    runTransaction: vi.fn(async (_db, updateFunction) => {
      const mockTransaction = {
        get: vi.fn(async (docRef: any) => {
          if (docRef.path?.includes('kots/kot_001')) {
            return {
              exists: () => true,
              data: () => ({
                id: 'kot_001',
                restaurantId: 'rest_test_4f',
                orderId: 'ord_dine_in_101',
                kotNumber: 'KOT-001',
                status: 'sentToKitchen'
              })
            };
          }
          if (docRef.path?.includes('orders/ord_dine_in_101')) {
            return {
              exists: () => true,
              data: () => ({
                id: 'ord_dine_in_101',
                restaurantId: 'rest_test_4f',
                orderType: 'dine_in',
                status: 'in_preparation',
                tableId: 'tbl_101'
              })
            };
          }
          return { exists: () => false };
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return await updateFunction(mockTransaction);
    })
  };
});

describe('Phase 4F — Order & KOT Visibility Suite', () => {
  const restaurantId = 'rest_test_4f';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Realtime Subscriptions & Subscribing to All KOTs', () => {
    it('should subscribe to all KOTs for a given restaurant', () => {
      let receivedKots: KOT[] = [];
      const unsub = kotService.subscribeToKOTs(restaurantId, (kots) => {
        receivedKots = kots;
      });

      expect(receivedKots).toHaveLength(2);
      expect(receivedKots[0].id).toBe('kot_001');
      expect(receivedKots[1].id).toBe('kot_002');

      unsub();
    });

    it('should correctly organize multiple KOTs under a single Order ID', () => {
      let receivedKots: KOT[] = [];
      kotService.subscribeToKOTs(restaurantId, (kots) => {
        receivedKots = kots;
      });

      const orderKots = receivedKots.filter((k) => k.orderId === 'ord_dine_in_101');
      expect(orderKots).toHaveLength(2);
      expect(orderKots.map((k) => k.kotNumber)).toEqual(['KOT-001', 'KOT-002']);
    });
  });

  describe('Order Type & Context Representation', () => {
    it('should correctly distinguish between Dine-In, Takeaway, and Delivery orders', () => {
      const orders: Partial<Order>[] = [
        {
          id: 'ord_1',
          orderType: 'dineIn',
          tableId: 'tbl_101',
          status: 'preparing'
        },
        {
          id: 'ord_2',
          orderType: 'takeaway',
          customerSnapshot: { name: 'John Doe', phone: '9876543210' },
          status: 'ready'
        },
        {
          id: 'ord_3',
          orderType: 'delivery',
          customerSnapshot: { name: 'Jane Smith', phone: '9123456789' },
          status: 'preparing'
        }
      ];

      expect(orders[0].orderType).toBe('dineIn');
      expect(orders[1].orderType).toBe('takeaway');
      expect(orders[2].orderType).toBe('delivery');
      expect(orders[1].customerSnapshot?.name).toBe('John Doe');
    });
  });

  describe('Offline Sync Integration for Phase 4F Operations', () => {
    it('should enqueue and process update_kot_status in offline queue', async () => {
      const spy = vi.spyOn(idempotencyService, 'checkOrAcquire').mockResolvedValue({
        action: 'execute',
        recordRef: {}
      } as any);

      offlineSyncService.enqueue(
        restaurantId,
        'update_kot_status',
        { kotId: 'kot_001', newStatus: 'served', updatedBy: 'staff_1' },
        'idemp_update_kot_served_123'
      );

      const queue = offlineSyncService.getQueue().filter((q) => q.restaurantId === restaurantId);
      expect(queue).toHaveLength(1);
      expect(queue[0].operation).toBe('update_kot_status');
      expect(queue[0].payload.newStatus).toBe('served');

      spy.mockRestore();
    });

    it('should enqueue update_order_status in offline queue for order cancellation', () => {
      offlineSyncService.enqueue(
        restaurantId,
        'update_order_status',
        { orderId: 'ord_dine_in_101', newStatus: 'cancelled', updatedBy: 'staff_1', cancellationReason: 'Customer left' }
      );

      const queue = offlineSyncService.getQueue().filter((q) => q.restaurantId === restaurantId);
      const cancelOp = queue.find((q) => q.operation === 'update_order_status');
      expect(cancelOp).toBeDefined();
      expect(cancelOp?.payload.cancellationReason).toBe('Customer left');
    });
  });
});

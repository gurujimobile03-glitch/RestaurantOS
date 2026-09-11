import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderService } from '../services/orderService';
import { Cart, createMenuItemSnapshot } from '../domain/cart';
import { MenuItem } from '../types/menu';
import { Order, OrderStatus } from '../types/order';
import { sanitizeFirestoreData } from '../utils/sanitize';

// Mock Firebase Firestore SDK
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
    doc: vi.fn((_dbOrCol, ...pathSegments) => {
      const id = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : `mock_id_${Math.random().toString(36).substring(2, 8)}`;
      return { id, path: pathSegments.join('/') };
    }),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z'))
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'TEST_AUTH_USER_123' } }
}));

import * as firestore from 'firebase/firestore';

describe('Order Creation & POS Engine (Phase 2D)', () => {
  let orderService: OrderService;
  let sampleItem1: MenuItem;
  let sampleItem2: MenuItem;

  beforeEach(() => {
    vi.clearAllMocks();
    orderService = new OrderService();

    sampleItem1 = {
      itemId: 'item_paneer_tikka',
      restaurantId: 'REST_ABC_999',
      categoryId: 'cat_starters',
      name: 'Paneer Tikka',
      shortName: 'Paneer Tk',
      description: 'Charcoal grilled cottage cheese',
      imageUrl: null,
      price: 200.0, // ₹200 = 20000 paise
      taxRate: 5,
      taxInclusive: false,
      foodType: 'veg',
      isAvailable: true,
      sku: 'PT-01',
      sortOrder: 1
    };

    sampleItem2 = {
      itemId: 'item_garlic_naan',
      restaurantId: 'REST_ABC_999',
      categoryId: 'cat_breads',
      name: 'Garlic Naan',
      shortName: 'G Naan',
      description: 'Crispy butter garlic flatbread',
      imageUrl: null,
      price: 50.0, // ₹50 = 5000 paise
      taxRate: 5,
      taxInclusive: false,
      foodType: 'veg',
      isAvailable: true,
      sku: 'GN-01',
      sortOrder: 2
    };
  });

  describe('Takeaway Order Creation', () => {
    it('creates a takeaway order with valid financial calculations using Phase 2B engine', async () => {
      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 2); // 2 * ₹200 = ₹400 (40000 paise)
      cart.addItem(createMenuItemSnapshot(sampleItem2), 3); // 3 * ₹50 = ₹150 (15000 paise)
      // Subtotal = ₹550 (55000 paise)
      // Tax @ 5% = ₹27.50 (2750 paise: CGST ₹13.75 -> 1375 paise, SGST 1375 paise)
      // Grand Total = ₹577.50 (57750 paise)

      const order = await orderService.createOrderFromCart({
        restaurantId: 'REST_ABC_999',
        cartState: cart.getState(),
        orderType: 'takeaway',
        source: 'pos',
        notes: 'Pack quickly'
      });

      expect(order).toBeDefined();
      expect(order.restaurantId).toBe('REST_ABC_999');
      expect(order.orderType).toBe('takeaway');
      expect(order.tableId).toBeNull();
      expect(order.tableSessionId).toBeNull();
      expect(order.status).toBe('confirmed');
      expect(order.items).toHaveLength(2);

      // Financial invariant verification
      expect(order.subtotalMinor).toBe(55000);
      expect(order.totalTaxMinor).toBe(2750);
      expect(order.cgstMinor).toBe(1375);
      expect(order.sgstMinor).toBe(1375);
      expect(order.grandTotalMinor).toBe(57750);
      expect(order.paidAmountMinor).toBe(0);
      expect(order.dueAmountMinor).toBe(57750);
      expect(firestore.setDoc).toHaveBeenCalled();
    });

    it('creates a takeaway order with order-level discount applied proportionally', async () => {
      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 1); // ₹200 = 20000 paise
      cart.setOrderDiscount({ type: 'percentage', percentageRate: 10 }); // 10% off -> ₹20 (2000 paise)
      // Net Taxable = ₹180 (18000 paise)
      // 5% GST on ₹180 = ₹9 (900 paise: CGST 450, SGST 450)
      // Grand Total = ₹189 (18900 paise)

      const order = await orderService.createOrderFromCart({
        restaurantId: 'REST_ABC_999',
        cartState: cart.getState(),
        orderType: 'takeaway',
        source: 'pos'
      });

      expect(order.subtotalMinor).toBe(20000);
      expect(order.discountMinor).toBe(2000);
      expect(order.taxableAmountMinor).toBe(18000);
      expect(order.totalTaxMinor).toBe(900);
      expect(order.cgstMinor).toBe(450);
      expect(order.sgstMinor).toBe(450);
      expect(order.grandTotalMinor).toBe(18900);
    });
  });

  describe('Dine-In Order Creation & TableSession Association', () => {
    const restaurantId = 'REST_ABC_999';
    const sessionId = 'session_table_4';

    it('creates dine-in order when tableSession exists, belongs to same restaurant, and is open', async () => {
      // Mock active tableSession lookup
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: sessionId,
          restaurantId,
          tableId: 'table_4',
          status: 'open',
          guestCount: 4
        })
      } as any);

      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 1);

      const order = await orderService.createOrderFromCart({
        restaurantId,
        cartState: cart.getState(),
        orderType: 'dineIn',
        source: 'pos',
        tableId: 'table_4',
        tableSessionId: sessionId
      });

      expect(order.orderType).toBe('dineIn');
      expect(order.tableId).toBe('table_4');
      expect(order.tableSessionId).toBe(sessionId);
      expect(order.status).toBe('confirmed');
    });

    it('rejects dine-in order without tableSessionId', async () => {
      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 1);

      await expect(
        orderService.createOrderFromCart({
          restaurantId,
          cartState: cart.getState(),
          orderType: 'dineIn',
          source: 'pos'
        })
      ).rejects.toThrow(/tableSessionId/i);
    });

    it('rejects dine-in order if tableSession does not exist', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => false
      } as any);

      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 1);

      await expect(
        orderService.createOrderFromCart({
          restaurantId,
          cartState: cart.getState(),
          orderType: 'dineIn',
          source: 'pos',
          tableSessionId: 'non_existent_session'
        })
      ).rejects.toThrow(/does not exist/i);
    });

    it('rejects dine-in order if tableSession is already closed', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: sessionId,
          restaurantId,
          tableId: 'table_4',
          status: 'closed'
        })
      } as any);

      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 1);

      await expect(
        orderService.createOrderFromCart({
          restaurantId,
          cartState: cart.getState(),
          orderType: 'dineIn',
          source: 'pos',
          tableSessionId: sessionId
        })
      ).rejects.toThrow(/closed/i);
    });

    it('rejects dine-in order if tableSession belongs to a different restaurant (Cross-Tenant check)', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: sessionId,
          restaurantId: 'ANOTHER_RESTAURANT',
          tableId: 'table_4',
          status: 'open'
        })
      } as any);

      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 1);

      await expect(
        orderService.createOrderFromCart({
          restaurantId,
          cartState: cart.getState(),
          orderType: 'dineIn',
          source: 'pos',
          tableSessionId: sessionId
        })
      ).rejects.toThrow(/does not belong to restaurant/i);
    });
  });

  describe('Delivery & Online Order Compatibility', () => {
    it('creates delivery order with customer snapshot', async () => {
      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 1);

      const order = await orderService.createOrderFromCart({
        restaurantId: 'REST_ABC_999',
        cartState: cart.getState(),
        orderType: 'delivery',
        source: 'online',
        customerSnapshot: {
          name: 'Rahul Sharma',
          phone: '+91 9876543210',
          address: 'Flat 402, Green Valley Apts, Bangalore'
        }
      });

      expect(order.orderType).toBe('delivery');
      expect(order.source).toBe('online');
      expect(order.customerSnapshot?.name).toBe('Rahul Sharma');
      expect(order.customerSnapshot?.address).toContain('Bangalore');
    });
  });

  describe('Order Lifecycle & Status Transitions', () => {
    const restaurantId = 'REST_ABC_999';
    const orderId = 'order_lifecycle_test';

    it('transitions order from confirmed -> sentToKitchen -> preparing -> ready -> served -> completed', async () => {
      const statuses: OrderStatus[] = [
        'confirmed',
        'sentToKitchen',
        'preparing',
        'ready',
        'served',
        'completed'
      ];

      for (let i = 0; i < statuses.length - 1; i++) {
        const fromStatus = statuses[i];
        const toStatus = statuses[i + 1];

        vi.mocked(firestore.getDoc).mockResolvedValueOnce({
          exists: () => true,
          data: () => ({
            id: orderId,
            restaurantId,
            status: fromStatus
          })
        } as any);

        await orderService.updateOrderStatus(restaurantId, orderId, toStatus, 'WAITER_1');

        expect(firestore.updateDoc).toHaveBeenLastCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: toStatus,
            updatedBy: 'WAITER_1'
          })
        );
      }
    });

    it('cancels an active order with cancellation reason', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: orderId,
          restaurantId,
          status: 'confirmed'
        })
      } as any);

      await orderService.updateOrderStatus(
        restaurantId,
        orderId,
        'cancelled',
        'MANAGER_1',
        'Customer changed mind'
      );

      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'cancelled',
          cancellationReason: 'Customer changed mind',
          cancelledBy: 'MANAGER_1'
        })
      );
    });

    it('rejects invalid transitions (e.g. completed -> confirmed or cancelled -> preparing)', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: orderId,
          restaurantId,
          status: 'completed'
        })
      } as any);

      await expect(
        orderService.updateOrderStatus(restaurantId, orderId, 'confirmed', 'USER_1')
      ).rejects.toThrow(/illegal/i);
    });
  });

  describe('Multi-Tenant Path & Restaurant ID Decoupling', () => {
    it('ensures orders are saved strictly under the restaurantId path, independent of auth.uid', async () => {
      const restaurantId = 'RESTAURANT_ACTUAL_777';
      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(sampleItem1), 1);

      await orderService.createOrderFromCart({
        restaurantId,
        cartState: cart.getState(),
        orderType: 'takeaway',
        source: 'pos'
      });

      expect(firestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'restaurants',
        'RESTAURANT_ACTUAL_777',
        'orders'
      );
    });
  });

  describe('sanitizeFirestoreData utility', () => {
    it('removes undefined values but preserves other types and dates', () => {
      const now = new Date();
      const input = {
        name: 'John Doe',
        notes: undefined,
        address: null,
        metadata: {
          age: 30,
          notes: undefined,
          skills: ['cooking', undefined, 'serving']
        },
        createdAt: now
      };

      const expected = {
        name: 'John Doe',
        address: null,
        metadata: {
          age: 30,
          skills: ['cooking', null, 'serving']
        },
        createdAt: now
      };

      const result = sanitizeFirestoreData(input);
      expect(result).toEqual(expected);
    });
  });
});

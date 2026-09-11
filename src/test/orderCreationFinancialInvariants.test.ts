import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderService } from '../services/orderService';
import { Cart, createMenuItemSnapshot } from '../domain/cart';
import { MenuItem } from '../types/menu';
import * as firestore from 'firebase/firestore';

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

describe('Order Creation & Financial Invariants Engine (Phase 2D Comprehensive)', () => {
  let orderService: OrderService;
  const restaurantId = 'REST_TEST_FIN_001';

  beforeEach(() => {
    vi.clearAllMocks();
    orderService = new OrderService();
  });

  describe('Item 32: Specific User Request Financial Test (₹100, 10% discount, 5% GST)', () => {
    it('accurately verifies: ₹100 subtotal, ₹10 discount, ₹90 taxable, ₹4.50 tax, ₹94.50 grand total', async () => {
      const item: MenuItem = {
        itemId: 'item_spec_32',
        restaurantId,
        categoryId: 'cat_main',
        name: 'Special Dal',
        shortName: 'Dal',
        description: 'Lentil stew',
        imageUrl: null,
        price: 100.0, // ₹100 -> 10000 paise
        taxRate: 5,
        taxInclusive: false,
        foodType: 'veg',
        isAvailable: true,
        sku: 'DAL-01',
        sortOrder: 1
      };

      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(item), 1);
      cart.setOrderDiscount({ type: 'percentage', percentageRate: 10 }); // 10% discount

      const order = await orderService.createOrderFromCart({
        restaurantId,
        cartState: cart.getState(),
        orderType: 'takeaway',
        source: 'pos'
      });

      // ₹100 subtotal = 10000 paise
      expect(order.subtotalMinor).toBe(10000);
      // ₹10 discount = 1000 paise
      expect(order.discountMinor).toBe(1000);
      // ₹90 taxable = 9000 paise
      expect(order.taxableAmountMinor).toBe(9000);
      // ₹4.50 tax = 450 paise (CGST: 225 paise, SGST: 225 paise)
      expect(order.totalTaxMinor).toBe(450);
      expect(order.cgstMinor).toBe(225);
      expect(order.sgstMinor).toBe(225);
      expect(order.igstMinor).toBe(0);
      // ₹94.50 grand total = 9450 paise
      expect(order.grandTotalMinor).toBe(9450);

      // Verify mathematical invariants
      expect(order.taxableAmountMinor + order.totalTaxMinor).toBe(order.grandTotalMinor);
      expect(order.cgstMinor + order.sgstMinor + order.igstMinor).toBe(order.totalTaxMinor);
      expect(order.paidAmountMinor + order.dueAmountMinor).toBe(order.grandTotalMinor);
    });
  });

  describe('Item 33: Multi-Line Order Test (Item A: qty 2, ₹100, 5%; Item B: qty 1, ₹200, 18%; Item C: qty 3, ₹99, 12%)', () => {
    it('calculates each line with deterministic rounding and aggregates exact sum', async () => {
      const itemA: MenuItem = {
        itemId: 'item_A',
        restaurantId,
        categoryId: 'cat_1',
        name: 'Item A',
        shortName: 'A',
        description: '',
        imageUrl: null,
        price: 100.0, // ₹100 -> 10000 paise
        taxRate: 5,
        taxInclusive: false,
        foodType: 'veg',
        isAvailable: true,
        sku: 'A',
        sortOrder: 1
      };

      const itemB: MenuItem = {
        itemId: 'item_B',
        restaurantId,
        categoryId: 'cat_1',
        name: 'Item B',
        shortName: 'B',
        description: '',
        imageUrl: null,
        price: 200.0, // ₹200 -> 20000 paise
        taxRate: 18,
        taxInclusive: false,
        foodType: 'veg',
        isAvailable: true,
        sku: 'B',
        sortOrder: 2
      };

      const itemC: MenuItem = {
        itemId: 'item_C',
        restaurantId,
        categoryId: 'cat_1',
        name: 'Item C',
        shortName: 'C',
        description: '',
        imageUrl: null,
        price: 99.0, // ₹99 -> 9900 paise
        taxRate: 12,
        taxInclusive: false,
        foodType: 'veg',
        isAvailable: true,
        sku: 'C',
        sortOrder: 3
      };

      const cart = new Cart();
      cart.addItem(createMenuItemSnapshot(itemA), 2); // 2 * 10000 = 20000 paise. Tax 5% = 1000 paise (CGST: 500, SGST: 500). Line total: 21000 paise.
      cart.addItem(createMenuItemSnapshot(itemB), 1); // 1 * 20000 = 20000 paise. Tax 18% = 3600 paise (CGST: 1800, SGST: 1800). Line total: 23600 paise.
      cart.addItem(createMenuItemSnapshot(itemC), 3); // 3 * 9900 = 29700 paise. Tax 12% = 3564 paise (CGST: 1782, SGST: 1782). Line total: 33264 paise.

      const order = await orderService.createOrderFromCart({
        restaurantId,
        cartState: cart.getState(),
        orderType: 'takeaway',
        source: 'pos'
      });

      // Subtotal = 20000 + 20000 + 29700 = 69700 paise (₹697.00)
      expect(order.subtotalMinor).toBe(69700);
      expect(order.taxableAmountMinor).toBe(69700);
      // Total tax = 1000 + 3600 + 3564 = 8164 paise (₹81.64)
      expect(order.totalTaxMinor).toBe(8164);
      // CGST = 500 + 1800 + 1782 = 4082 paise
      expect(order.cgstMinor).toBe(4082);
      // SGST = 500 + 1800 + 1782 = 4082 paise
      expect(order.sgstMinor).toBe(4082);
      // Grand total = 21000 + 23600 + 33264 = 77864 paise (₹778.64)
      expect(order.grandTotalMinor).toBe(77864);

      // Line results check
      expect(order.items[0].lineTotalMinor).toBe(21000);
      expect(order.items[1].lineTotalMinor).toBe(23600);
      expect(order.items[2].lineTotalMinor).toBe(33264);
    });
  });

  describe('Item 34: Snapshot Regression & Catalog Isolation Test', () => {
    it('proves that mutating catalog prices and tax rates has ZERO impact on created orders', async () => {
      const catalogItem: MenuItem = {
        itemId: 'item_dyn_100',
        restaurantId,
        categoryId: 'cat_beverages',
        name: 'Masala Chai',
        shortName: 'Chai',
        description: 'Cardamom tea',
        imageUrl: null,
        price: 100.0, // ₹100 = 10000 paise
        taxRate: 5,
        taxInclusive: false,
        foodType: 'veg',
        isAvailable: true,
        sku: 'CHAI',
        sortOrder: 1
      };

      // 1. Create cart snapshot at ₹100
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(catalogItem);
      cart.addItem(snapshot, 1);

      // 2. Mutate catalog item price to ₹150 and tax to 18%
      catalogItem.price = 150.0;
      catalogItem.taxRate = 18;

      // 3. Create order from the cart
      const order = await orderService.createOrderFromCart({
        restaurantId,
        cartState: cart.getState(),
        orderType: 'takeaway',
        source: 'pos'
      });

      // 4. Verify order uses ₹100 (10000 paise) and 5% tax
      expect(order.items[0].unitPriceMinor).toBe(10000);
      expect(order.items[0].taxRate).toBe(5);
      expect(order.subtotalMinor).toBe(10000);
      expect(order.totalTaxMinor).toBe(500);
      expect(order.grandTotalMinor).toBe(10500);

      // 5. Mutate catalog AGAIN to ₹250
      catalogItem.price = 250.0;
      catalogItem.taxRate = 28;

      // 6. Recalculate historical order items and totals from order.items
      const lineInputs = order.items.map((it) => ({
        quantity: it.quantity,
        unitPriceMinor: it.unitPriceMinor,
        taxRate: it.taxRate,
        taxInclusive: it.taxInclusive
      }));

      const totals = orderService.prepareOrderItemsAndTotals({ items: order.items as any });
      expect(totals.calculationResult.grandTotalMinor).toBe(10500);
      expect(totals.calculationResult.subtotalMinor).toBe(10000);
    });
  });

  describe('Edge Cases & Zero Subtotal Invariants', () => {
    it('rejects order creation if cart has no items', async () => {
      const cart = new Cart();
      await expect(
        orderService.createOrderFromCart({
          restaurantId,
          cartState: cart.getState(),
          orderType: 'takeaway',
          source: 'pos'
        })
      ).rejects.toThrow(/empty cart/i);
    });

    it('rejects order creation if restaurantId is missing or whitespace', async () => {
      const cart = new Cart();
      const item: MenuItem = {
        itemId: 'item_1',
        restaurantId,
        categoryId: 'cat_1',
        name: 'Item 1',
        shortName: '1',
        description: '',
        imageUrl: null,
        price: 50.0,
        taxRate: 5,
        taxInclusive: false,
        foodType: 'veg',
        isAvailable: true,
        sku: '1',
        sortOrder: 1
      };
      cart.addItem(createMenuItemSnapshot(item), 1);

      await expect(
        orderService.createOrderFromCart({
          restaurantId: '   ',
          cartState: cart.getState(),
          orderType: 'takeaway',
          source: 'pos'
        })
      ).rejects.toThrow(/restaurantId is required/i);
    });
  });
});

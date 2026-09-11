import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KOTService, createKOTItemFromOrderItem } from '../services/kotService';
import { OrderService } from '../services/orderService';
import { Cart, createMenuItemSnapshot } from '../domain/cart';
import { MenuItem } from '../types/menu';
import { Order } from '../types/order';

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

describe('KOT Historical Immutability, Separation & Cross-Tenant Security (Phase 2E)', () => {
  let kotService: KOTService;
  let orderService: OrderService;
  let sampleMenuItem: MenuItem;

  beforeEach(() => {
    vi.clearAllMocks();
    kotService = new KOTService();
    orderService = new OrderService();

    sampleMenuItem = {
      itemId: 'item_biryani_01',
      restaurantId: 'REST_TENANT_A',
      categoryId: 'cat_mains',
      name: 'Hyderabadi Veg Biryani',
      shortName: 'Hyd Biryani',
      description: 'Authentic dum biryani',
      imageUrl: null,
      price: 250.0, // ₹250
      taxRate: 5,
      taxInclusive: false,
      foodType: 'veg',
      isAvailable: true,
      sku: 'HVB-01',
      sortOrder: 1
    };
  });

  describe('1. Historical Price & Catalog Immutability Test', () => {
    it('guarantees that mutating catalog item name, price, or description does NOT alter historical OrderItem or KOTItem snapshots', () => {
      // Step A: Create cart item from catalog snapshot
      const cartSnapshot = createMenuItemSnapshot(
        sampleMenuItem,
        [{ id: 'mod_extra_salan', name: 'Extra Salan', priceMinor: 3000 }],
        'Medium spicy'
      );
      const cart = new Cart();
      cart.addItem(cartSnapshot, 2);

      // Calculate authoritative order items using OrderService internal helper
      const { items } = (orderService as any).prepareOrderItemsAndTotals(cart.getState());
      const orderItem = items[0];

      // Step B: Create KOT item snapshot from OrderItem
      const kotItem = createKOTItemFromOrderItem(orderItem);

      // Verify baseline snapshot
      expect(kotItem.nameSnapshot).toBe('Hyderabadi Veg Biryani');
      expect(kotItem.shortNameSnapshot).toBe('Hyd Biryani');
      expect(kotItem.quantity).toBe(2);
      expect(kotItem.notes).toBe('Medium spicy');
      expect(kotItem.modifiers?.[0].name).toBe('Extra Salan');

      // Step C: Simulate LIVE CATALOG MUTATIONS (price hike, rename, deletion)
      sampleMenuItem.name = 'Royal Luxury Veg Biryani';
      sampleMenuItem.shortName = 'Royal Biryani';
      sampleMenuItem.price = 450.0; // ₹450
      sampleMenuItem.taxRate = 18;
      sampleMenuItem.isAvailable = false;

      // Step D: Verify that existing OrderItem and KOTItem remain completely immutable
      expect(orderItem.nameSnapshot).toBe('Hyderabadi Veg Biryani');
      expect(orderItem.unitPriceMinor).toBe(25000);
      expect(kotItem.nameSnapshot).toBe('Hyderabadi Veg Biryani');
      expect(kotItem.shortNameSnapshot).toBe('Hyd Biryani');
      expect(kotItem.quantity).toBe(2);
      expect(kotItem.modifiers?.[0].name).toBe('Extra Salan');
    });
  });

  describe('2. Financial Separation Invariant', () => {
    it('ensures KOT does not calculate or contain financial totals', async () => {
      const orderDoc: Order = {
        id: 'ord_fin_test_1',
        restaurantId: 'REST_TENANT_A',
        orderNumber: 'ORD-999',
        orderType: 'takeaway',
        source: 'pos',
        status: 'confirmed',
        items: [
          {
            itemId: 'item_pizza_01',
            nameSnapshot: 'Margherita Pizza',
            shortNameSnapshot: 'Marg Pizza',
            quantity: 2,
            unitPriceMinor: 35000,
            taxRate: 5,
            taxInclusive: false,
            discountMinor: 0,
            lineSubtotalMinor: 70000,
            lineTaxMinor: 3500,
            lineTotalMinor: 73500
          }
        ],
        subtotalMinor: 70000,
        discountMinor: 0,
        taxableAmountMinor: 70000,
        cgstMinor: 1750,
        sgstMinor: 1750,
        igstMinor: 0,
        totalTaxMinor: 3500,
        grandTotalMinor: 73500,
        paidAmountMinor: 0,
        dueAmountMinor: 73500,
        createdBy: 'STAFF_1',
        updatedBy: 'STAFF_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'ord_fin_test_1',
        data: () => ({ ...orderDoc })
      } as any);

      const kot = await kotService.createKOTFromOrder({
        restaurantId: 'REST_TENANT_A',
        orderId: 'ord_fin_test_1'
      });

      // Assert KOT entity contains no financial totals
      expect((kot as any).subtotalMinor).toBeUndefined();
      expect((kot as any).grandTotalMinor).toBeUndefined();
      expect((kot as any).totalTaxMinor).toBeUndefined();
      expect((kot as any).discountMinor).toBeUndefined();
      expect((kot as any).dueAmountMinor).toBeUndefined();
      expect((kot as any).paidAmountMinor).toBeUndefined();

      // Assert KOT items contain no financial unit prices
      expect((kot.items[0] as any).unitPriceMinor).toBeUndefined();
      expect((kot.items[0] as any).lineTotalMinor).toBeUndefined();
    });
  });

  describe('3. Cross-Tenant Security & Isolation', () => {
    it('rejects KOT operations when user attempts cross-restaurant order access', async () => {
      // Attacker is in REST_TENANT_B, trying to create KOT for an order that belongs to REST_TENANT_A
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'ord_tenant_a_secret',
        data: () => ({
          id: 'ord_tenant_a_secret',
          restaurantId: 'REST_TENANT_A',
          status: 'confirmed',
          items: [{ itemId: 'item_1', nameSnapshot: 'Secret Recipe', quantity: 1 }]
        })
      } as any);

      await expect(
        kotService.createKOTFromOrder({
          restaurantId: 'REST_TENANT_B',
          orderId: 'ord_tenant_a_secret'
        })
      ).rejects.toThrow('Cross-tenant violation');
    });

    it('rejects low-level createKOT when payload restaurantId does not match path restaurantId', async () => {
      await expect(
        kotService.createKOT('REST_TENANT_A', {
          kotNumber: 'KOT-001',
          restaurantId: 'REST_TENANT_B', // Mismatch!
          orderId: 'ord_100',
          status: 'sentToKitchen',
          items: [{ itemId: 'item_1', nameSnapshot: 'Paneer', quantity: 1 }],
          createdBy: 'USER_1'
        })
      ).rejects.toThrow('Payload restaurantId "REST_TENANT_B" does not match target restaurantId "REST_TENANT_A"');
    });
  });
});

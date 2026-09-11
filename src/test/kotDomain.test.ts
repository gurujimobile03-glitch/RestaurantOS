import { describe, it, expect } from 'vitest';
import {
  validateKOT,
  validateKOTStatusTransition,
  VALID_KOT_STATUSES
} from '../utils/transactionValidation';
import { KOT, KOTItem, KOTStatus } from '../types/kot';
import { OrderItem } from '../types/order';
import { createKOTItemFromOrderItem } from '../services/kotService';

describe('KOT Domain & Snapshot Architecture (Phase 2E)', () => {
  const sampleOrderItem: OrderItem = {
    itemId: 'item_veg_biryani',
    nameSnapshot: 'Veg Biryani',
    shortNameSnapshot: 'Veg Biry',
    quantity: 2,
    unitPriceMinor: 25000,
    taxRate: 5,
    taxInclusive: false,
    discountMinor: 0,
    lineSubtotalMinor: 50000,
    lineTaxMinor: 2500,
    lineTotalMinor: 52500,
    notes: 'Extra spicy, less oil',
    modifiers: [
      { id: 'mod_raita', name: 'Add Boondi Raita', priceMinor: 4000 }
    ]
  };

  describe('1. KOTItem Snapshot Creation (createKOTItemFromOrderItem)', () => {
    it('creates a clean kitchen snapshot stripping financial fields', () => {
      const kotItem = createKOTItemFromOrderItem(sampleOrderItem);

      expect(kotItem.itemId).toBe('item_veg_biryani');
      expect(kotItem.nameSnapshot).toBe('Veg Biryani');
      expect(kotItem.shortNameSnapshot).toBe('Veg Biry');
      expect(kotItem.quantity).toBe(2);
      expect(kotItem.notes).toBe('Extra spicy, less oil');
      expect(kotItem.modifiers).toHaveLength(1);
      expect(kotItem.modifiers?.[0].name).toBe('Add Boondi Raita');

      // Crucial: KOT item does not contain financial authority fields
      expect((kotItem as any).unitPriceMinor).toBeUndefined();
      expect((kotItem as any).lineTotalMinor).toBeUndefined();
      expect((kotItem as any).taxRate).toBeUndefined();
    });

    it('handles items without optional shortNameSnapshot, notes, or modifiers', () => {
      const plainItem: OrderItem = {
        itemId: 'item_water',
        nameSnapshot: 'Mineral Water 1L',
        shortNameSnapshot: '',
        quantity: 1,
        unitPriceMinor: 2000,
        taxRate: 18,
        taxInclusive: true,
        discountMinor: 0,
        lineSubtotalMinor: 1695,
        lineTaxMinor: 305,
        lineTotalMinor: 2000
      };

      const kotItem = createKOTItemFromOrderItem(plainItem);
      expect(kotItem.itemId).toBe('item_water');
      expect(kotItem.nameSnapshot).toBe('Mineral Water 1L');
      expect(kotItem.quantity).toBe(1);
      expect(kotItem.shortNameSnapshot).toBeUndefined();
      expect(kotItem.notes).toBeUndefined();
      expect(kotItem.modifiers).toBeUndefined();
    });

    it('rejects invalid order item missing itemId or nameSnapshot or invalid quantity', () => {
      expect(() =>
        createKOTItemFromOrderItem({ ...sampleOrderItem, itemId: '' })
      ).toThrow('orderItem.itemId is missing or invalid');

      expect(() =>
        createKOTItemFromOrderItem({ ...sampleOrderItem, nameSnapshot: '   ' })
      ).toThrow('orderItem.nameSnapshot is missing or invalid');

      expect(() =>
        createKOTItemFromOrderItem({ ...sampleOrderItem, quantity: 0 })
      ).toThrow('quantity must be an integer > 0');

      expect(() =>
        createKOTItemFromOrderItem({ ...sampleOrderItem, quantity: -2 })
      ).toThrow('quantity must be an integer > 0');

      expect(() =>
        createKOTItemFromOrderItem({ ...sampleOrderItem, quantity: 1.5 })
      ).toThrow('quantity must be an integer > 0');
    });
  });

  describe('2. KOT Entity Validation (validateKOT)', () => {
    it('validates a correct KOT object', () => {
      const validKot: Partial<KOT> = {
        restaurantId: 'REST_ABC_01',
        orderId: 'ORD_123',
        status: 'sentToKitchen',
        items: [
          {
            itemId: 'item_01',
            nameSnapshot: 'Paneer Butter Masala',
            quantity: 1
          }
        ]
      };

      const result = validateKOT(validKot);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects missing or empty restaurantId', () => {
      const result = validateKOT({
        restaurantId: '',
        orderId: 'ORD_123',
        status: 'sentToKitchen',
        items: [{ itemId: 'item_01', nameSnapshot: 'Paneer', quantity: 1 }]
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Valid restaurantId is required');
    });

    it('rejects missing or empty orderId', () => {
      const result = validateKOT({
        restaurantId: 'REST_ABC_01',
        orderId: '   ',
        status: 'sentToKitchen',
        items: [{ itemId: 'item_01', nameSnapshot: 'Paneer', quantity: 1 }]
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Valid orderId is required');
    });

    it('rejects invalid status', () => {
      const result = validateKOT({
        restaurantId: 'REST_ABC_01',
        orderId: 'ORD_123',
        status: 'invalid_status' as any,
        items: [{ itemId: 'item_01', nameSnapshot: 'Paneer', quantity: 1 }]
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('status must be one of:');
    });

    it('rejects empty items array', () => {
      const result = validateKOT({
        restaurantId: 'REST_ABC_01',
        orderId: 'ORD_123',
        status: 'sentToKitchen',
        items: []
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('KOT must contain at least one item');
    });

    it('rejects items with missing itemId, nameSnapshot, or invalid quantity', () => {
      const invalidItemQty = validateKOT({
        restaurantId: 'REST_ABC_01',
        orderId: 'ORD_123',
        status: 'sentToKitchen',
        items: [{ itemId: 'item_01', nameSnapshot: 'Paneer', quantity: 0 }]
      });
      expect(invalidItemQty.isValid).toBe(false);
      expect(invalidItemQty.error).toContain('quantity must be an integer greater than 0');

      const missingName = validateKOT({
        restaurantId: 'REST_ABC_01',
        orderId: 'ORD_123',
        status: 'sentToKitchen',
        items: [{ itemId: 'item_01', nameSnapshot: '', quantity: 1 }]
      });
      expect(missingName.isValid).toBe(false);
      expect(missingName.error).toContain('nameSnapshot is required');
    });
  });

  describe('3. KOT Lifecycle State Machine (validateKOTStatusTransition)', () => {
    it('allows valid progressive transitions', () => {
      expect(validateKOTStatusTransition('draft', 'confirmed').isValid).toBe(true);
      expect(validateKOTStatusTransition('confirmed', 'sentToKitchen').isValid).toBe(true);
      expect(validateKOTStatusTransition('sentToKitchen', 'preparing').isValid).toBe(true);
      expect(validateKOTStatusTransition('preparing', 'ready').isValid).toBe(true);
      expect(validateKOTStatusTransition('ready', 'served').isValid).toBe(true);
      // Confirmed directly to preparing is also allowed
      expect(validateKOTStatusTransition('confirmed', 'preparing').isValid).toBe(true);
    });

    it('allows identical status (no-op)', () => {
      for (const status of VALID_KOT_STATUSES) {
        expect(validateKOTStatusTransition(status, status).isValid).toBe(true);
      }
    });

    it('allows cancellation from active non-terminal states', () => {
      expect(validateKOTStatusTransition('draft', 'cancelled').isValid).toBe(true);
      expect(validateKOTStatusTransition('confirmed', 'cancelled').isValid).toBe(true);
      expect(validateKOTStatusTransition('sentToKitchen', 'cancelled').isValid).toBe(true);
      expect(validateKOTStatusTransition('preparing', 'cancelled').isValid).toBe(true);
      expect(validateKOTStatusTransition('ready', 'cancelled').isValid).toBe(true);
    });

    it('rejects transitions from terminal state: served', () => {
      expect(validateKOTStatusTransition('served', 'preparing').isValid).toBe(false);
      expect(validateKOTStatusTransition('served', 'draft').isValid).toBe(false);
      expect(validateKOTStatusTransition('served', 'ready').isValid).toBe(false);
      expect(validateKOTStatusTransition('served', 'cancelled').isValid).toBe(false);
    });

    it('rejects transitions from terminal state: cancelled', () => {
      expect(validateKOTStatusTransition('cancelled', 'draft').isValid).toBe(false);
      expect(validateKOTStatusTransition('cancelled', 'confirmed').isValid).toBe(false);
      expect(validateKOTStatusTransition('cancelled', 'sentToKitchen').isValid).toBe(false);
      expect(validateKOTStatusTransition('cancelled', 'preparing').isValid).toBe(false);
      expect(validateKOTStatusTransition('cancelled', 'ready').isValid).toBe(false);
      expect(validateKOTStatusTransition('cancelled', 'served').isValid).toBe(false);
    });

    it('rejects backward transitions', () => {
      expect(validateKOTStatusTransition('ready', 'preparing').isValid).toBe(false);
      expect(validateKOTStatusTransition('preparing', 'sentToKitchen').isValid).toBe(false);
      expect(validateKOTStatusTransition('sentToKitchen', 'draft').isValid).toBe(false);
    });
  });
});

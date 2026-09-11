import { describe, it, expect, beforeEach } from 'vitest';
import { Cart, createMenuItemSnapshot } from '../domain/cart';
import { MenuItem } from '../types/menu';
import { CartItemSnapshot } from '../types/cart';

describe('Cart Domain & State Architecture (Phase 2D)', () => {
  let mockMenuItem: MenuItem;

  beforeEach(() => {
    mockMenuItem = {
      itemId: 'item_butter_chicken',
      restaurantId: 'REST_TEST_101',
      categoryId: 'cat_main_course',
      name: 'Butter Chicken',
      shortName: 'Butter Chk',
      description: 'Rich tomato and butter gravy with chicken',
      imageUrl: 'https://images.unsplash.com/photo-12345',
      price: 350.0, // ₹350 = 35000 paise
      taxRate: 5,
      taxInclusive: false,
      foodType: 'nonVeg',
      isAvailable: true,
      sku: 'BC-001',
      sortOrder: 1
    };
  });

  describe('Item Snapshot Creation', () => {
    it('creates an immutable snapshot with accurate MoneyMinor conversion', () => {
      const snapshot = createMenuItemSnapshot(mockMenuItem);

      expect(snapshot.itemId).toBe('item_butter_chicken');
      expect(snapshot.nameSnapshot).toBe('Butter Chicken');
      expect(snapshot.shortNameSnapshot).toBe('Butter Chk');
      expect(snapshot.unitPriceMinor).toBe(35000); // Integer paise
      expect(snapshot.taxRate).toBe(5);
      expect(snapshot.taxInclusive).toBe(false);
    });

    it('falls back to full name if shortName is not provided', () => {
      const itemWithoutShortName = { ...mockMenuItem, shortName: '' };
      const snapshot = createMenuItemSnapshot(itemWithoutShortName);
      expect(snapshot.shortNameSnapshot).toBe('Butter Chicken');
    });

    it('preserves modifiers in snapshot if provided', () => {
      const modifiers = [{ id: 'mod_extra_butter', name: 'Extra Butter', priceMinor: 3000 }];
      const snapshot = createMenuItemSnapshot(mockMenuItem, modifiers, 'Make it spicy');

      expect(snapshot.modifiers).toHaveLength(1);
      expect(snapshot.modifiers![0].name).toBe('Extra Butter');
      expect(snapshot.notes).toBe('Make it spicy');
    });
  });

  describe('Cart Operations', () => {
    it('adds an item to an empty cart', () => {
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(mockMenuItem);

      const cartItem = cart.addItem(snapshot, 2);

      expect(cartItem.cartItemId).toBeDefined();
      expect(cartItem.quantity).toBe(2);
      expect(cart.getState().items).toHaveLength(1);
    });

    it('merges identical items by incrementing quantity (Same-Item Merge Policy)', () => {
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(mockMenuItem);

      cart.addItem(snapshot, 2);
      cart.addItem(snapshot, 3);

      const state = cart.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].quantity).toBe(5);
    });

    it('maintains separate lines if modifiers or notes differ', () => {
      const cart = new Cart();
      const snapshot1 = createMenuItemSnapshot(mockMenuItem, undefined, 'No coriander');
      const snapshot2 = createMenuItemSnapshot(mockMenuItem, undefined, 'Extra spicy');
      const snapshot3 = createMenuItemSnapshot(mockMenuItem, [
        { id: 'mod_1', name: 'Extra Cheese', priceMinor: 4000 }
      ]);

      cart.addItem(snapshot1, 1);
      cart.addItem(snapshot2, 1);
      cart.addItem(snapshot3, 1);

      expect(cart.getState().items).toHaveLength(3);
    });

    it('updates quantity of existing cart item', () => {
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(mockMenuItem);
      const added = cart.addItem(snapshot, 2);

      const updated = cart.updateQuantity(added.cartItemId, 4);
      expect(updated.quantity).toBe(4);
      expect(cart.getState().items[0].quantity).toBe(4);
    });

    it('removes item from cart by cartItemId', () => {
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(mockMenuItem);
      const added = cart.addItem(snapshot, 2);

      cart.removeItem(added.cartItemId);
      expect(cart.getState().items).toHaveLength(0);
    });

    it('clears all cart state including discounts and notes', () => {
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(mockMenuItem);
      cart.addItem(snapshot, 2);
      cart.setOrderDiscount({ type: 'fixed', fixedAmountMinor: 5000 });
      cart.setNotes('VIP table');

      cart.clear();

      const state = cart.getState();
      expect(state.items).toHaveLength(0);
      expect(state.orderDiscount).toBeUndefined();
      expect(state.notes).toBeUndefined();
    });
  });

  describe('Quantity & Input Validation', () => {
    it('rejects zero, negative, decimal, NaN, or Infinity quantities', () => {
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(mockMenuItem);

      expect(() => cart.addItem(snapshot, 0)).toThrow(RangeError);
      expect(() => cart.addItem(snapshot, -2)).toThrow(RangeError);
      expect(() => cart.addItem(snapshot, 2.5)).toThrow(TypeError);
      expect(() => cart.addItem(snapshot, NaN)).toThrow(TypeError);
      expect(() => cart.addItem(snapshot, Infinity)).toThrow(TypeError);
    });

    it('rejects updating quantity to invalid values', () => {
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(mockMenuItem);
      const added = cart.addItem(snapshot, 1);

      expect(() => cart.updateQuantity(added.cartItemId, 0)).toThrow(RangeError);
      expect(() => cart.updateQuantity(added.cartItemId, -5)).toThrow(RangeError);
      expect(() => cart.updateQuantity(added.cartItemId, 1.2)).toThrow(TypeError);
    });
  });

  describe('Historical Price Snapshot Locking', () => {
    it('locks item price snapshot in cart even if original catalog item price changes', () => {
      const cart = new Cart();
      const snapshot = createMenuItemSnapshot(mockMenuItem); // ₹350 (35000 paise)
      cart.addItem(snapshot, 2);

      // Mutate live menu item catalog price
      mockMenuItem.price = 500.0; // ₹500
      mockMenuItem.taxRate = 18;

      // Cart recalculation should still use locked historical snapshot (₹350 @ 5% GST)
      const totals = cart.calculateTotals('intraState');
      expect(totals.subtotalMinor).toBe(70000); // 2 * 35000 = 70000 paise (₹700)
      expect(totals.totalTaxMinor).toBe(3500); // 5% of ₹700 = ₹35 (3500 paise)
      expect(totals.grandTotalMinor).toBe(73500); // ₹735
    });
  });
});

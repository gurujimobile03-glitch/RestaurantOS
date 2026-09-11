import { describe, it, expect } from 'vitest';
import { Order, OrderItem } from '../types/order';
import { MenuItem } from '../types/menu';
import { recalculateOrderFromSnapshots } from '../services/orderCalculationService';

describe('Historical Price Snapshot Policy (Step 8 Regression Test)', () => {
  it('strictly preserves historical OrderItem snapshot price and never uses current menu item price', () => {
    // 1. Suppose a menu item was created in the past with price ₹100.00 (10000 paise)
    const menuItemCatalogRecord: MenuItem = {
      itemId: 'item-burger-001',
      restaurantId: 'rest-001',
      categoryId: 'cat-001',
      name: 'Classic Burger',
      shortName: 'Burger',
      description: 'Delicious burger',
      imageUrl: null,
      sku: 'SKU-001',
      price: 150.0, // CURRENT catalog price increased to ₹150.00!
      taxRate: 5,
      taxInclusive: false,
      foodType: 'veg',
      isAvailable: true,
      sortOrder: 1
    };

    // 2. An order was placed historically when the price was ₹100.00 (10000 paise).
    // The OrderItem stored the price snapshot at that time.
    const historicalOrderItem: OrderItem = {
      itemId: 'item-burger-001',
      nameSnapshot: 'Classic Burger',
      shortNameSnapshot: 'Burger',
      quantity: 2,
      unitPriceMinor: 10000, // HISTORICAL SNAPSHOT: ₹100.00
      taxRate: 5,
      taxInclusive: false,
      discountMinor: 0,
      lineSubtotalMinor: 20000,
      lineTaxMinor: 1000,
      lineTotalMinor: 21000
    };

    const historicalOrder: Order = {
      id: 'order-001',
      restaurantId: 'rest-001',
      orderNumber: 'ORD-1001',
      orderType: 'dineIn',
      source: 'pos',
      status: 'completed',
      items: [historicalOrderItem],
      subtotalMinor: 20000,
      discountMinor: 0,
      taxableAmountMinor: 20000,
      cgstMinor: 500,
      sgstMinor: 500,
      igstMinor: 0,
      totalTaxMinor: 1000,
      grandTotalMinor: 21000,
      paidAmountMinor: 21000,
      dueAmountMinor: 0,
      createdAt: '2026-01-01T12:00:00Z',
      updatedAt: '2026-01-01T12:30:00Z',
      createdBy: 'user-001'
    };

    // 3. When recalculating the historical order, the calculation engine MUST use
    // the OrderItem's unitPriceMinor (10000 paise = ₹100) and NOT the current catalog price (15000 paise = ₹150).
    const recalculated = recalculateOrderFromSnapshots(historicalOrder);

    // Subtotal must be 2 x ₹100 = ₹200 (20000 paise), NOT 2 x ₹150 = ₹300 (30000 paise)
    expect(recalculated.subtotalMinor).toBe(20000);
    expect(recalculated.subtotalMinor).not.toBe(30000);

    // Tax must be 5% of ₹200 = ₹10 (1000 paise), NOT 5% of ₹300 = ₹15 (1500 paise)
    expect(recalculated.totalTaxMinor).toBe(1000);
    expect(recalculated.totalTaxMinor).not.toBe(1500);

    // Grand total must be ₹210 (21000 paise), NOT ₹315 (31500 paise)
    expect(recalculated.grandTotalMinor).toBe(21000);
    expect(recalculated.grandTotalMinor).not.toBe(31500);

    // Line snapshot verification
    expect(recalculated.lineResults[0].unitPriceMinor).toBe(10000);
    expect(recalculated.lineResults[0].lineTotalMinor).toBe(21000);

    // Double check with menu item price to verify difference
    const currentPriceMinor = Math.round(menuItemCatalogRecord.price * 100);
    expect(currentPriceMinor).toBe(15000);
    expect(recalculated.lineResults[0].unitPriceMinor).not.toBe(currentPriceMinor);
  });
});

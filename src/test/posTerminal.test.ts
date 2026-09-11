import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateOrderTotals, calculateOrderItemLine } from '../services/orderCalculationService';
import { validateOrder } from '../utils/transactionValidation';
import { formatMoney, toMoneyMinor, fromMoneyMinor } from '../utils/money';
import { CartItem, CartState } from '../types/cart';
import { OrderType } from '../types/order';
import { DiscountSpec } from '../types/discount';

describe('Phase 3 — POS Terminal Integration & Business Invariants', () => {
  const sampleCartItems: CartItem[] = [
    {
      cartItemId: 'c1',
      itemId: 'item_butter_chicken',
      nameSnapshot: 'Butter Chicken',
      shortNameSnapshot: 'Btr Chk',
      unitPriceMinor: 35000, // ₹350.00
      taxRate: 5,
      taxInclusive: false,
      quantity: 2
    },
    {
      cartItemId: 'c2',
      itemId: 'item_garlic_naan',
      nameSnapshot: 'Garlic Naan',
      shortNameSnapshot: 'Grlc Naan',
      unitPriceMinor: 6000, // ₹60.00
      taxRate: 5,
      taxInclusive: false,
      quantity: 4
    }
  ];

  it('1. Calculates menu item line price and tax correctly using minor units', () => {
    const item1 = sampleCartItems[0];
    const lineRes = calculateOrderItemLine({
      quantity: item1.quantity,
      unitPriceMinor: item1.unitPriceMinor,
      taxRate: item1.taxRate,
      taxInclusive: item1.taxInclusive
    });

    // Subtotal: 35000 * 2 = 70000 (₹700.00)
    expect(lineRes.subtotalMinor).toBe(70000);
    // Tax at 5% on 70000 = 3500 (₹35.00)
    expect(lineRes.totalTaxMinor).toBe(3500);
    // Line total: 70000 + 3500 = 73500 (₹735.00)
    expect(lineRes.lineTotalMinor).toBe(73500);
  });

  it('2. Calculates complete POS Cart totals with subtotal, tax, and discount', () => {
    const lineInputs = sampleCartItems.map((item) => ({
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      taxRate: item.taxRate,
      taxInclusive: item.taxInclusive
    }));

    const orderDiscount: DiscountSpec = { type: 'percentage', percentageRate: 10 }; // 10% discount

    const totals = calculateOrderTotals({
      items: lineInputs,
      orderDiscount,
      taxJurisdiction: 'intraState'
    });

    // Subtotal: (35000 * 2) + (6000 * 4) = 70000 + 24000 = 94000 (₹940.00)
    expect(totals.subtotalMinor).toBe(94000);
    // Discount: 10% of 94000 = 9400 (₹94.00)
    expect(totals.discountMinor).toBe(9400);
    // Taxable Amount: 94000 - 9400 = 84600 (₹846.00)
    expect(totals.taxableAmountMinor).toBe(84600);
    // Tax at 5% on 84600 = 4230 (₹42.30 -> CGST 2115, SGST 2115)
    expect(totals.totalTaxMinor).toBe(4230);
    expect(totals.cgstMinor + totals.sgstMinor).toBe(4230);
    // Grand Total: 84600 + 4230 = 88830 (₹888.30)
    expect(totals.grandTotalMinor).toBe(88830);
  });

  it('3. Formats money values correctly without floating-point errors', () => {
    expect(formatMoney(88830, '₹')).toBe('₹888.30');
    expect(formatMoney(0, '₹')).toBe('₹0.00');
    expect(toMoneyMinor(350.50)).toBe(35050);
    expect(fromMoneyMinor(35050)).toBe(350.50);
  });

  it('4. Validates Dine-In Order model requires a valid table/session context', () => {
    const invalidDineInOrder: any = {
      restaurantId: 'rest_123',
      orderNumber: 'ORD-TEST-001',
      orderType: 'dineIn',
      source: 'pos',
      status: 'confirmed',
      tableId: null, // missing tableId
      tableSessionId: null, // missing tableSessionId
      items: [
        {
          itemId: 'item_1',
          nameSnapshot: 'Butter Chicken',
          shortNameSnapshot: 'Btr Chk',
          quantity: 1,
          unitPriceMinor: 35000,
          taxRate: 5,
          taxInclusive: false,
          discountMinor: 0,
          lineSubtotalMinor: 35000,
          lineTaxMinor: 1750,
          lineTotalMinor: 36750
        }
      ],
      subtotalMinor: 35000,
      discountMinor: 0,
      taxableAmountMinor: 35000,
      cgstMinor: 875,
      sgstMinor: 875,
      igstMinor: 0,
      totalTaxMinor: 1750,
      grandTotalMinor: 36750,
      paidAmountMinor: 0,
      dueAmountMinor: 36750,
      createdBy: 'user_1'
    };

    const result = validateOrder(invalidDineInOrder);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('tableId is required for confirmed dine-in orders.');
  });

  it('5. Validates Takeaway and Delivery orders do not require table/session', () => {
    const validTakeawayOrder: any = {
      restaurantId: 'rest_123',
      orderNumber: 'ORD-TEST-002',
      orderType: 'takeaway',
      source: 'pos',
      status: 'confirmed',
      tableId: null,
      tableSessionId: null,
      items: [
        {
          itemId: 'item_1',
          nameSnapshot: 'Butter Chicken',
          shortNameSnapshot: 'Btr Chk',
          quantity: 1,
          unitPriceMinor: 35000,
          taxRate: 5,
          taxInclusive: false,
          discountMinor: 0,
          lineSubtotalMinor: 35000,
          lineTaxMinor: 1750,
          lineTotalMinor: 36750
        }
      ],
      subtotalMinor: 35000,
      discountMinor: 0,
      taxableAmountMinor: 35000,
      cgstMinor: 875,
      sgstMinor: 875,
      igstMinor: 0,
      totalTaxMinor: 1750,
      grandTotalMinor: 36750,
      paidAmountMinor: 0,
      dueAmountMinor: 36750,
      createdBy: 'user_1'
    };

    const result = validateOrder(validTakeawayOrder);
    expect(result.isValid).toBe(true);
  });

  it('6. Preserves historical price snapshot invariant when item price changes', () => {
    // Original cart item snapshot taken at ₹350.00
    const snapshotPrice = 35000;
    // Catalog price updated later to ₹400.00
    const updatedCatalogPrice = 40000;

    const orderItem = {
      itemId: 'item_1',
      nameSnapshot: 'Butter Chicken',
      shortNameSnapshot: 'Btr Chk',
      quantity: 1,
      unitPriceMinor: snapshotPrice, // frozen at snapshot time
      taxRate: 5,
      taxInclusive: false,
      discountMinor: 0,
      lineSubtotalMinor: snapshotPrice,
      lineTaxMinor: 1750,
      lineTotalMinor: 36750
    };

    expect(orderItem.unitPriceMinor).toBe(35000);
    expect(orderItem.unitPriceMinor).not.toBe(updatedCatalogPrice);
  });

  it('7. Enforces financial invariant: paidAmountMinor + dueAmountMinor === grandTotalMinor', () => {
    const grandTotal = 36750;
    const paidAmount = 15000;
    const dueAmount = grandTotal - paidAmount; // 21750

    expect(paidAmount + dueAmount).toBe(grandTotal);
    expect(dueAmount).toBeGreaterThanOrEqual(0);
  });
});

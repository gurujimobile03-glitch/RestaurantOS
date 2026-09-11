import { describe, it, expect } from 'vitest';
import {
  validateTable,
  validateTableSession,
  validateOrderItem,
  validateOrder,
  validatePayment,
  validateKOT
} from '../utils/transactionValidation';
import { OrderItem } from '../types/order';

describe('Table Validation', () => {
  it('accepts a valid table configuration', () => {
    const result = validateTable({
      name: 'Table 1',
      tableNumber: 'T-01',
      floorOrArea: 'Main Dining Hall',
      capacity: 4,
      isActive: true,
      sortOrder: 1
    });
    expect(result.isValid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('rejects tables with missing or blank name and table number', () => {
    expect(validateTable({ name: '', tableNumber: 'T-01', capacity: 4 }).isValid).toBe(false);
    expect(validateTable({ name: '   ', tableNumber: 'T-01', capacity: 4 }).isValid).toBe(false);
    expect(validateTable({ name: 'Table 1', tableNumber: '', capacity: 4 }).isValid).toBe(false);
  });

  it('rejects invalid table capacity (0, negative, non-integer, >100)', () => {
    expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 0 }).isValid).toBe(false);
    expect(validateTable({ name: 'T1', tableNumber: '1', capacity: -2 }).isValid).toBe(false);
    expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 4.5 }).isValid).toBe(false);
    expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 150 }).isValid).toBe(false);
  });

  it('rejects invalid sortOrder', () => {
    expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 2, sortOrder: -1 }).isValid).toBe(false);
    expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 2, sortOrder: 1.5 }).isValid).toBe(false);
  });
});

describe('Table Session Validation', () => {
  it('accepts valid table session data', () => {
    const result = validateTableSession({
      tableId: 'table_123',
      guestCount: 2,
      status: 'open'
    });
    expect(result.isValid).toBe(true);
  });

  it('rejects table session without tableId or invalid guestCount', () => {
    expect(validateTableSession({ tableId: '', guestCount: 2, status: 'open' }).isValid).toBe(false);
    expect(validateTableSession({ tableId: 'table_123', guestCount: 0, status: 'open' }).isValid).toBe(false);
    expect(validateTableSession({ tableId: 'table_123', guestCount: -1, status: 'open' }).isValid).toBe(false);
  });

  it('rejects table session with invalid status', () => {
    expect(validateTableSession({ tableId: 'table_123', guestCount: 2, status: 'unknown' as any }).isValid).toBe(false);
  });
});

describe('OrderItem Validation', () => {
  const sampleValidItem: OrderItem = {
    itemId: 'item_butter_chicken',
    nameSnapshot: 'Butter Chicken',
    shortNameSnapshot: 'Btr Chk',
    quantity: 2,
    unitPriceMinor: 35000, // ₹350.00
    taxRate: 5,
    taxInclusive: false,
    discountMinor: 0,
    lineSubtotalMinor: 70000,
    lineTaxMinor: 3500,
    lineTotalMinor: 73500
  };

  it('accepts a fully valid order item', () => {
    const result = validateOrderItem(sampleValidItem);
    expect(result.isValid).toBe(true);
  });

  it('rejects order item with missing itemId or nameSnapshot', () => {
    expect(validateOrderItem({ ...sampleValidItem, itemId: '' }).isValid).toBe(false);
    expect(validateOrderItem({ ...sampleValidItem, nameSnapshot: '  ' }).isValid).toBe(false);
  });

  it('rejects order item with invalid quantity (<= 0 or non-integer)', () => {
    expect(validateOrderItem({ ...sampleValidItem, quantity: 0 }).isValid).toBe(false);
    expect(validateOrderItem({ ...sampleValidItem, quantity: -1 }).isValid).toBe(false);
    expect(validateOrderItem({ ...sampleValidItem, quantity: 1.5 }).isValid).toBe(false);
  });

  it('rejects order item with decimal or non-integer money values', () => {
    expect(validateOrderItem({ ...sampleValidItem, unitPriceMinor: 350.5 }).isValid).toBe(false);
    expect(validateOrderItem({ ...sampleValidItem, unitPriceMinor: NaN }).isValid).toBe(false);
    expect(validateOrderItem({ ...sampleValidItem, unitPriceMinor: -100 }).isValid).toBe(false);
  });

  it('rejects order item with invalid taxRate', () => {
    expect(validateOrderItem({ ...sampleValidItem, taxRate: -1 }).isValid).toBe(false);
    expect(validateOrderItem({ ...sampleValidItem, taxRate: 105 }).isValid).toBe(false);
    expect(validateOrderItem({ ...sampleValidItem, taxRate: NaN }).isValid).toBe(false);
  });
});

describe('Order Validation', () => {
  const validOrder = {
    restaurantId: 'rest_abc123',
    orderNumber: 'ORD-101',
    tableId: 'tbl_1',
    tableSessionId: 'sess_1',
    orderType: 'dineIn' as const,
    source: 'pos' as const,
    status: 'confirmed' as const,
    items: [
      {
        itemId: 'item_biryani',
        nameSnapshot: 'Chicken Biryani',
        shortNameSnapshot: 'Chk Bir',
        quantity: 1,
        unitPriceMinor: 25000,
        taxRate: 5,
        taxInclusive: false,
        discountMinor: 0,
        lineSubtotalMinor: 25000,
        lineTaxMinor: 1250,
        lineTotalMinor: 26250
      }
    ],
    subtotalMinor: 25000,
    discountMinor: 0,
    taxableAmountMinor: 25000,
    cgstMinor: 625,
    sgstMinor: 625,
    igstMinor: 0,
    totalTaxMinor: 1250,
    grandTotalMinor: 26250,
    paidAmountMinor: 0,
    dueAmountMinor: 26250
  };

  it('accepts a valid confirmed order', () => {
    const result = validateOrder(validOrder);
    expect(result.isValid).toBe(true);
  });

  it('allows draft orders with empty items list', () => {
    const draftOrder = {
      ...validOrder,
      status: 'draft' as const,
      items: []
    };
    expect(validateOrder(draftOrder).isValid).toBe(true);
  });

  it('rejects confirmed orders with empty items list', () => {
    const confirmedEmpty = {
      ...validOrder,
      status: 'confirmed' as const,
      items: []
    };
    const result = validateOrder(confirmedEmpty);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('at least one item');
  });

  it('rejects confirmed dine-in orders without tableId', () => {
    const dineInWithoutTable = {
      ...validOrder,
      orderType: 'dineIn' as const,
      status: 'confirmed' as const,
      tableId: null
    };
    const result = validateOrder(dineInWithoutTable);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('tableId is required');
  });

  it('rejects orders with invalid financial minor units (decimals or NaN)', () => {
    const decimalOrder = {
      ...validOrder,
      grandTotalMinor: 262.5 // decimal instead of minor units 26250!
    };
    const result = validateOrder(decimalOrder);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('must be an integer minor unit');
  });

  it('rejects inconsistent due amounts', () => {
    const inconsistentOrder = {
      ...validOrder,
      grandTotalMinor: 26250,
      paidAmountMinor: 10000,
      dueAmountMinor: 20000 // should be 16250
    };
    const result = validateOrder(inconsistentOrder);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('dueAmountMinor');
  });
});

describe('Payment Validation', () => {
  const validPayment = {
    restaurantId: 'rest_123',
    orderId: 'ord_456',
    amountMinor: 26250,
    method: 'upi' as const,
    status: 'completed' as const
  };

  it('accepts a valid payment payload', () => {
    expect(validatePayment(validPayment).isValid).toBe(true);
  });

  it('rejects payments with non-positive amountMinor (0 or negative)', () => {
    expect(validatePayment({ ...validPayment, amountMinor: 0 }).isValid).toBe(false);
    expect(validatePayment({ ...validPayment, amountMinor: -500 }).isValid).toBe(false);
  });

  it('rejects payments with decimal amountMinor', () => {
    expect(validatePayment({ ...validPayment, amountMinor: 262.5 }).isValid).toBe(false);
  });

  it('rejects invalid payment method or status', () => {
    expect(validatePayment({ ...validPayment, method: 'bitcoin' as any }).isValid).toBe(false);
    expect(validatePayment({ ...validPayment, status: 'processing' as any }).isValid).toBe(false);
  });

  it('rejects payments with missing orderId or restaurantId', () => {
    expect(validatePayment({ ...validPayment, orderId: '' }).isValid).toBe(false);
    expect(validatePayment({ ...validPayment, restaurantId: ' ' }).isValid).toBe(false);
  });
});

describe('KOT Validation', () => {
  const validKOT = {
    restaurantId: 'rest_123',
    orderId: 'ord_456',
    status: 'sentToKitchen' as const,
    items: [
      {
        itemId: 'item_nan',
        nameSnapshot: 'Garlic Naan',
        quantity: 3
      }
    ]
  };

  it('accepts a valid KOT payload', () => {
    expect(validateKOT(validKOT).isValid).toBe(true);
  });

  it('rejects KOT without items or with zero quantity items', () => {
    expect(validateKOT({ ...validKOT, items: [] }).isValid).toBe(false);
    expect(
      validateKOT({
        ...validKOT,
        items: [{ itemId: 'item_nan', nameSnapshot: 'Naan', quantity: 0 }]
      }).isValid
    ).toBe(false);
  });

  it('rejects KOT with invalid status', () => {
    expect(validateKOT({ ...validKOT, status: 'dispatched' as any }).isValid).toBe(false);
  });
});

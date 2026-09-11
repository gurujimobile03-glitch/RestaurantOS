import { describe, it, expect } from 'vitest';
import { analyticsService, parseToDate, getPresetDateBounds } from '../services/analyticsService';
import { Order } from '../types/order';
import { Payment } from '../types/payment';

describe('Analytics Core Service (analyticsService)', () => {
  const restId = 'REST_TEST_123';

  // Helper to create basic mock orders
  const makeMockOrder = (overrides: Partial<Order>): Order => {
    return {
      id: 'ord_' + Math.random().toString(36).substring(2, 7),
      restaurantId: restId,
      orderNumber: 'ORD-MOCK',
      orderType: 'dineIn',
      source: 'pos',
      status: 'completed',
      items: [],
      subtotalMinor: 0,
      discountMinor: 0,
      taxableAmountMinor: 0,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 0,
      paidAmountMinor: 0,
      dueAmountMinor: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user_1',
      ...overrides
    } as Order;
  };

  // Helper to create basic mock payments
  const makeMockPayment = (overrides: Partial<Payment>): Payment => {
    return {
      id: 'pay_' + Math.random().toString(36).substring(2, 7),
      restaurantId: restId,
      orderId: 'ord_123',
      amountMinor: 0,
      method: 'cash',
      status: 'completed',
      createdAt: new Date(),
      createdBy: 'user_1',
      ...overrides
    } as Payment;
  };

  // 1. empty dataset
  it('1. handles empty dataset correctly with zero metrics', () => {
    const summary = analyticsService.calculateAnalyticsSummary(restId, [], []);
    expect(summary.grossSalesMinor).toBe(0);
    expect(summary.discountsMinor).toBe(0);
    expect(summary.taxableAmountMinor).toBe(0);
    expect(summary.totalTaxMinor).toBe(0);
    expect(summary.cgstMinor).toBe(0);
    expect(summary.sgstMinor).toBe(0);
    expect(summary.igstMinor).toBe(0);
    expect(summary.grandTotalMinor).toBe(0);
    expect(summary.orderCount).toBe(0);
    expect(summary.averageOrderValueMinor).toBe(0);
    expect(summary.activeOrderCount).toBe(0);
    expect(summary.activeGrandTotalMinor).toBe(0);
    expect(summary.cancelledOrderCount).toBe(0);
    expect(summary.cancelledTotalMinor).toBe(0);
    expect(summary.collectedAmountMinor).toBe(0);
    expect(summary.dueAmountMinor).toBe(0);
    expect(summary.refundedAmountMinor).toBe(0);
    expect(summary.items).toEqual([]);
    expect(summary.categories).toEqual([]);
  });

  // 2. one completed order
  it('2. aggregates metrics for exactly one completed order', () => {
    const order = makeMockOrder({
      subtotalMinor: 10000, // ₹100
      discountMinor: 1000,  // ₹10
      taxableAmountMinor: 9000, // ₹90
      cgstMinor: 450,       // ₹4.50
      sgstMinor: 450,       // ₹4.50
      totalTaxMinor: 900,   // ₹9
      grandTotalMinor: 9900, // ₹99
      paidAmountMinor: 9900,
      dueAmountMinor: 0
    });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [order], []);
    expect(summary.grossSalesMinor).toBe(10000);
    expect(summary.discountsMinor).toBe(1000);
    expect(summary.taxableAmountMinor).toBe(9000);
    expect(summary.totalTaxMinor).toBe(900);
    expect(summary.cgstMinor).toBe(450);
    expect(summary.sgstMinor).toBe(450);
    expect(summary.igstMinor).toBe(0);
    expect(summary.grandTotalMinor).toBe(9900);
    expect(summary.orderCount).toBe(1);
    expect(summary.averageOrderValueMinor).toBe(9900);
    expect(summary.collectedAmountMinor).toBe(9900);
    expect(summary.dueAmountMinor).toBe(0);
  });

  // 3. multiple orders
  it('3. aggregates metrics across multiple completed orders', () => {
    const order1 = makeMockOrder({
      subtotalMinor: 10000,
      grandTotalMinor: 10500,
      paidAmountMinor: 10500
    });
    const order2 = makeMockOrder({
      subtotalMinor: 20000,
      grandTotalMinor: 21000,
      paidAmountMinor: 21000
    });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [order1, order2], []);
    expect(summary.grossSalesMinor).toBe(30000);
    expect(summary.grandTotalMinor).toBe(31500);
    expect(summary.orderCount).toBe(2);
    expect(summary.averageOrderValueMinor).toBe(15750); // 31500 / 2
  });

  // 4. subtotal aggregation
  it('4. aggregates gross subtotals correctly', () => {
    const order1 = makeMockOrder({ subtotalMinor: 5000 });
    const order2 = makeMockOrder({ subtotalMinor: 7500 });
    const summary = analyticsService.calculateAnalyticsSummary(restId, [order1, order2]);
    expect(summary.grossSalesMinor).toBe(12500);
  });

  // 5. discount aggregation
  it('5. aggregates discounts correctly', () => {
    const order1 = makeMockOrder({ discountMinor: 500 });
    const order2 = makeMockOrder({ discountMinor: 1500 });
    const summary = analyticsService.calculateAnalyticsSummary(restId, [order1, order2]);
    expect(summary.discountsMinor).toBe(2000);
  });

  // 6. CGST aggregation
  it('6. aggregates CGST correctly', () => {
    const order1 = makeMockOrder({ cgstMinor: 250 });
    const order2 = makeMockOrder({ cgstMinor: 500 });
    const summary = analyticsService.calculateAnalyticsSummary(restId, [order1, order2]);
    expect(summary.cgstMinor).toBe(750);
  });

  // 7. SGST aggregation
  it('7. aggregates SGST correctly', () => {
    const order1 = makeMockOrder({ sgstMinor: 250 });
    const order2 = makeMockOrder({ sgstMinor: 500 });
    const summary = analyticsService.calculateAnalyticsSummary(restId, [order1, order2]);
    expect(summary.sgstMinor).toBe(750);
  });

  // 8. IGST aggregation
  it('8. aggregates IGST correctly', () => {
    const order1 = makeMockOrder({ igstMinor: 500 });
    const order2 = makeMockOrder({ igstMinor: 1000 });
    const summary = analyticsService.calculateAnalyticsSummary(restId, [order1, order2]);
    expect(summary.igstMinor).toBe(1500);
  });

  // 9. integer paise arithmetic
  it('9. maintains integer paise representation strictly with no floating points', () => {
    const order = makeMockOrder({
      subtotalMinor: 10005, // ₹100.05
      grandTotalMinor: 10505
    });
    const summary = analyticsService.calculateAnalyticsSummary(restId, [order]);
    expect(Number.isInteger(summary.grossSalesMinor)).toBe(true);
    expect(summary.grossSalesMinor).toBe(10005);
  });

  // 10. half-up rounding consistency
  it('10. applies standard half-up rounding to average order values', () => {
    // Total = 10005 paise, Orders = 2. 10005 / 2 = 5002.5. Should round to 5003.
    const o1 = makeMockOrder({ grandTotalMinor: 5002 });
    const o2 = makeMockOrder({ grandTotalMinor: 5003 });
    const summary = analyticsService.calculateAnalyticsSummary(restId, [o1, o2]);
    expect(summary.averageOrderValueMinor).toBe(5003);

    // Total = 10003 paise, Orders = 2. 10003 / 2 = 5001.5. Should round to 5002.
    const o3 = makeMockOrder({ grandTotalMinor: 5001 });
    const o4 = makeMockOrder({ grandTotalMinor: 5002 });
    const summary2 = analyticsService.calculateAnalyticsSummary(restId, [o3, o4]);
    expect(summary2.averageOrderValueMinor).toBe(5002);
  });

  // 11. average ticket calculation
  it('11. calculates the correct average ticket value', () => {
    const o1 = makeMockOrder({ grandTotalMinor: 10000 });
    const o2 = makeMockOrder({ grandTotalMinor: 20000 });
    const o3 = makeMockOrder({ grandTotalMinor: 30000 });
    const summary = analyticsService.calculateAnalyticsSummary(restId, [o1, o2, o3]);
    expect(summary.averageOrderValueMinor).toBe(20000);
  });

  // 12. cancelled orders
  it('12. separates cancelled orders into their own metric block', () => {
    const completed = makeMockOrder({ status: 'completed', grandTotalMinor: 10000 });
    const cancelled = makeMockOrder({ status: 'cancelled', grandTotalMinor: 15000 });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [completed, cancelled]);
    expect(summary.orderCount).toBe(1);
    expect(summary.grandTotalMinor).toBe(10000);
    expect(summary.cancelledOrderCount).toBe(1);
    expect(summary.cancelledTotalMinor).toBe(15000);
  });

  // 13. refunded payments
  it('13. aggregates refunded payments correctly from Payment documents', () => {
    const pay1 = makeMockPayment({ status: 'completed', amountMinor: 5000 });
    const pay2 = makeMockPayment({ status: 'refunded', amountMinor: 3000 });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [], [pay1, pay2]);
    expect(summary.refundedAmountMinor).toBe(3000);
  });

  // 14. due/unpaid amounts
  it('14. aggregates paidAmountMinor and dueAmountMinor across non-cancelled, non-draft orders', () => {
    const order1 = makeMockOrder({
      status: 'completed',
      grandTotalMinor: 10000,
      paidAmountMinor: 8000,
      dueAmountMinor: 2000
    });
    const order2 = makeMockOrder({
      status: 'served', // Active
      grandTotalMinor: 5000,
      paidAmountMinor: 1000,
      dueAmountMinor: 4000
    });
    const cancelled = makeMockOrder({
      status: 'cancelled',
      grandTotalMinor: 5000,
      paidAmountMinor: 0,
      dueAmountMinor: 5000
    });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [order1, order2, cancelled]);
    expect(summary.collectedAmountMinor).toBe(9000); // 8000 + 1000
    expect(summary.dueAmountMinor).toBe(6000);       // 2000 + 4000
  });

  // 15. date boundaries
  it('15. filters orders and payments based on start and end date boundaries', () => {
    const d1 = new Date('2026-09-09T10:00:00Z');
    const d2 = new Date('2026-09-10T10:00:00Z');
    const d3 = new Date('2026-09-11T10:00:00Z');

    const o1 = makeMockOrder({ createdAt: d1, grandTotalMinor: 5000 });
    const o2 = makeMockOrder({ createdAt: d2, grandTotalMinor: 10000 });
    const o3 = makeMockOrder({ createdAt: d3, grandTotalMinor: 20000 });

    const bounds = {
      start: new Date('2026-09-10T00:00:00Z'),
      end: new Date('2026-09-10T23:59:59Z')
    };

    const summary = analyticsService.calculateAnalyticsSummary(restId, [o1, o2, o3], [], bounds);
    expect(summary.orderCount).toBe(1);
    expect(summary.grandTotalMinor).toBe(10000);
  });

  // 16. same-day boundary behavior
  it('16. handles same-day boundaries with exact millisecond coverage', () => {
    const startOfDay = new Date('2026-09-09T00:00:00.000Z');
    const endOfDay = new Date('2026-09-09T23:59:59.999Z');

    const o1 = makeMockOrder({ createdAt: new Date('2026-09-08T23:59:59.999Z'), grandTotalMinor: 1000 });
    const o2 = makeMockOrder({ createdAt: startOfDay, grandTotalMinor: 2000 });
    const o3 = makeMockOrder({ createdAt: endOfDay, grandTotalMinor: 3000 });
    const o4 = makeMockOrder({ createdAt: new Date('2026-09-10T00:00:00.000Z'), grandTotalMinor: 4000 });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [o1, o2, o3, o4], [], {
      start: startOfDay,
      end: endOfDay
    });

    expect(summary.orderCount).toBe(2);
    expect(summary.grandTotalMinor).toBe(5000); // 2000 + 3000
  });

  // 17. custom date range
  it('17. allows custom date range query parameters', () => {
    const customStart = new Date('2026-05-01T00:00:00Z');
    const customEnd = new Date('2026-05-15T23:59:59Z');

    const o1 = makeMockOrder({ createdAt: new Date('2026-04-30T23:50:00Z'), grandTotalMinor: 1000 });
    const o2 = makeMockOrder({ createdAt: new Date('2026-05-02T12:00:00Z'), grandTotalMinor: 5000 });
    const o3 = makeMockOrder({ createdAt: new Date('2026-05-16T00:01:00Z'), grandTotalMinor: 9000 });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [o1, o2, o3], [], {
      start: customStart,
      end: customEnd
    });

    expect(summary.orderCount).toBe(1);
    expect(summary.grandTotalMinor).toBe(5000);
  });

  // 18. item aggregation
  it('18. aggregates individual item volumes and financial sub-elements accurately', () => {
    const o1 = makeMockOrder({
      status: 'completed',
      items: [
        {
          itemId: 'item_a',
          nameSnapshot: 'Burger',
          shortNameSnapshot: 'Bgr',
          quantity: 2,
          unitPriceMinor: 1000,
          taxRate: 5,
          taxInclusive: true,
          discountMinor: 100,
          lineSubtotalMinor: 2000,
          lineTaxMinor: 95,
          lineTotalMinor: 1900
        } as any
      ]
    });

    const o2 = makeMockOrder({
      status: 'completed',
      items: [
        {
          itemId: 'item_a',
          nameSnapshot: 'Burger',
          shortNameSnapshot: 'Bgr',
          quantity: 1,
          unitPriceMinor: 1000,
          taxRate: 5,
          taxInclusive: true,
          discountMinor: 50,
          lineSubtotalMinor: 1000,
          lineTaxMinor: 48,
          lineTotalMinor: 950
        } as any,
        {
          itemId: 'item_b',
          nameSnapshot: 'Fries',
          shortNameSnapshot: 'Frs',
          quantity: 3,
          unitPriceMinor: 500,
          taxRate: 5,
          taxInclusive: true,
          discountMinor: 0,
          lineSubtotalMinor: 1500,
          lineTaxMinor: 71,
          lineTotalMinor: 1500
        } as any
      ]
    });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [o1, o2], []);
    expect(summary.items.length).toBe(2);

    const burger = summary.items.find(i => i.itemId === 'item_a')!;
    expect(burger.quantity).toBe(3);
    expect(burger.totalSubtotalMinor).toBe(3000);
    expect(burger.totalDiscountMinor).toBe(150);
    expect(burger.totalTaxMinor).toBe(143);
    expect(burger.totalGrandTotalMinor).toBe(2850);

    const fries = summary.items.find(i => i.itemId === 'item_b')!;
    expect(fries.quantity).toBe(3);
    expect(fries.totalGrandTotalMinor).toBe(1500);
  });

  // 19. category aggregation
  it('19. groups item aggregations into categories when a mapping registry is passed', () => {
    const itemMap = {
      item_a: 'cat_fastfood',
      item_b: 'cat_sides'
    };

    const catNames = {
      cat_fastfood: 'Burgers & Pizzas',
      cat_sides: 'Sides & Extras'
    };

    const o1 = makeMockOrder({
      status: 'completed',
      items: [
        {
          itemId: 'item_a',
          nameSnapshot: 'Burger',
          quantity: 1,
          lineSubtotalMinor: 1000,
          lineTotalMinor: 950
        } as any,
        {
          itemId: 'item_b',
          nameSnapshot: 'Fries',
          quantity: 2,
          lineSubtotalMinor: 1000,
          lineTotalMinor: 1000
        } as any
      ]
    });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [o1], [], undefined, itemMap, catNames);
    expect(summary.categories.length).toBe(2);

    const fastfood = summary.categories.find(c => c.categoryId === 'cat_fastfood')!;
    expect(fastfood.name).toBe('Burgers & Pizzas');
    expect(fastfood.totalGrandTotalMinor).toBe(950);

    const sides = summary.categories.find(c => c.categoryId === 'cat_sides')!;
    expect(sides.name).toBe('Sides & Extras');
    expect(sides.totalGrandTotalMinor).toBe(1000);
  });

  // 20. missing/optional fields
  it('20. handles missing or optional schema fields with robust default fallbacks', () => {
    // Missing subtotals or tax values completely
    const order = {
      id: 'ord_missing',
      restaurantId: restId,
      status: 'completed'
    } as any as Order;

    const summary = analyticsService.calculateAnalyticsSummary(restId, [order]);
    expect(summary.grossSalesMinor).toBe(0);
    expect(summary.totalTaxMinor).toBe(0);
    expect(summary.grandTotalMinor).toBe(0);
  });

  // 21. restaurant isolation
  it('21. throws a tenant violation error if an order from another restaurant is provided', () => {
    const validOrder = makeMockOrder({ restaurantId: restId });
    const crossOrder = makeMockOrder({ restaurantId: 'CROSS_REST' });

    expect(() => {
      analyticsService.calculateAnalyticsSummary(restId, [validOrder, crossOrder]);
    }).toThrow('Tenant Isolation Violation');
  });

  // 22. offline/unsynchronized records excluded
  it('22. excludes local draft / unsynchronized orders from financial totals', () => {
    const d1 = makeMockOrder({ status: 'draft', grandTotalMinor: 5000 });
    const d2 = makeMockOrder({ status: 'completed', grandTotalMinor: 3000 });

    const summary = analyticsService.calculateAnalyticsSummary(restId, [d1, d2]);
    expect(summary.orderCount).toBe(1);
    expect(summary.grandTotalMinor).toBe(3000);
  });

  // 23. deterministic repeated calculations
  it('23. produces deterministic outcomes on repeated calculation invocations', () => {
    const o1 = makeMockOrder({ grandTotalMinor: 5000 });
    const o2 = makeMockOrder({ grandTotalMinor: 7000 });

    const summary1 = analyticsService.calculateAnalyticsSummary(restId, [o1, o2]);
    const summary2 = analyticsService.calculateAnalyticsSummary(restId, [o1, o2]);

    expect(summary1).toEqual(summary2);
  });

  // 24. immutability/no mutation of source orders
  it('24. does not mutate original source order or payment arrays/objects during processing', () => {
    const order = makeMockOrder({ grandTotalMinor: 5000 });
    const orders = [order];
    const originalFreeze = JSON.stringify(orders);

    analyticsService.calculateAnalyticsSummary(restId, orders);
    expect(JSON.stringify(orders)).toBe(originalFreeze);
  });
});

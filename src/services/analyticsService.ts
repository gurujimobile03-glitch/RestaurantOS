import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Order, OrderItem } from '../types/order';
import { Payment } from '../types/payment';
import { ordersPath, paymentsPath } from '../utils/paths';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { enforcePermission } from '../utils/permissions';

export interface ItemSalesSummary {
  itemId: string;
  name: string;
  quantity: number;
  totalSubtotalMinor: number;
  totalDiscountMinor: number;
  totalTaxMinor: number;
  totalGrandTotalMinor: number;
}

export interface CategorySalesSummary {
  categoryId: string;
  name: string;
  quantity: number;
  totalSubtotalMinor: number;
  totalDiscountMinor: number;
  totalTaxMinor: number;
  totalGrandTotalMinor: number;
}

export interface AnalyticsSummary {
  // Completed sales metrics (completed orders only)
  grossSalesMinor: number;          // subtotal of completed orders (without discounts/taxes)
  discountsMinor: number;           // total discount of completed orders
  taxableAmountMinor: number;       // taxable subtotal of completed orders
  totalTaxMinor: number;            // total tax of completed orders
  cgstMinor: number;                // CGST of completed orders
  sgstMinor: number;                // SGST of completed orders
  igstMinor: number;                // IGST of completed orders
  grandTotalMinor: number;          // grand total of completed orders (inclusive of tax & discount)
  orderCount: number;               // count of completed orders
  averageOrderValueMinor: number;   // grandTotalMinor / orderCount (rounded half-up)

  // Active/unsettled metrics (non-completed, non-cancelled, non-draft orders)
  activeOrderCount: number;         // count of active orders (e.g. confirmed, preparing, ready, served)
  activeGrandTotalMinor: number;    // grand total of active orders

  // Cancelled metrics (cancelled orders only)
  cancelledOrderCount: number;      // count of cancelled orders
  cancelledTotalMinor: number;      // grand total of cancelled orders

  // Collection & Outstandings (across all non-cancelled, non-draft orders: completed + active)
  collectedAmountMinor: number;     // total paid amount across non-cancelled, non-draft orders
  dueAmountMinor: number;           // total unpaid/due amount across non-cancelled, non-draft orders

  // Refunded metrics (aggregated from payment records if provided)
  refundedAmountMinor: number;      // sum of refunded payments

  // Detailed breakdowns
  items: ItemSalesSummary[];
  categories: CategorySalesSummary[];
}

/**
 * Parses any timestamp representation (Firestore Timestamp, Date, ISO String, UNIX seconds) into a JS Date.
 */
export function parseToDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Calculates start and end Date boundaries for standard preset values in local timezone.
 */
export function getPresetDateBounds(
  preset: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth',
  nowReference: Date = new Date()
): { start: Date; end: Date } {
  const start = new Date(nowReference);
  const end = new Date(nowReference);

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'thisWeek': {
      const day = start.getDay();
      // Adjust start to previous Monday
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'thisMonth':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
}

export class AnalyticsService {
  /**
   * Pure, deterministic analytical calculation engine.
   * Compiles the AnalyticsSummary from array of orders and payments.
   * Does NOT perform mutations on input source parameters.
   */
  calculateAnalyticsSummary(
    restaurantId: string,
    orders: Order[],
    payments: Payment[] = [],
    dateBounds?: { start: Date; end: Date },
    itemCategoryMap?: Record<string, string>,
    categoryNamesMap?: Record<string, string>
  ): AnalyticsSummary {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required for tenant calculation isolation.');
    }

    // Initialize summary metrics
    let grossSalesMinor = 0;
    let discountsMinor = 0;
    let taxableAmountMinor = 0;
    let totalTaxMinor = 0;
    let cgstMinor = 0;
    let sgstMinor = 0;
    let igstMinor = 0;
    let grandTotalMinor = 0;
    let orderCount = 0;

    let activeOrderCount = 0;
    let activeGrandTotalMinor = 0;

    let cancelledOrderCount = 0;
    let cancelledTotalMinor = 0;

    let collectedAmountMinor = 0;
    let dueAmountMinor = 0;

    const itemMap = new Map<string, ItemSalesSummary>();
    const categoryMap = new Map<string, CategorySalesSummary>();

    // Step 1: Filter and process Orders
    for (const order of orders) {
      // 1. Tenant Isolation Check
      if (order.restaurantId !== cleanRestaurantId) {
        throw new Error(
          `Tenant Isolation Violation: Order belongs to restaurant "${order.restaurantId}", expected "${cleanRestaurantId}".`
        );
      }

      // 2. Draft/Unsynchronized Check
      if (order.status === 'draft') {
        continue;
      }

      // 3. Date Boundary Check (if specified)
      if (dateBounds) {
        const orderDate = parseToDate(order.createdAt);
        if (!orderDate) {
          continue; // Skip order if we cannot parse its timestamp
        }
        if (orderDate < dateBounds.start || orderDate > dateBounds.end) {
          continue; // Outside target query range
        }
      }

      // 4. Summarize based on order status
      if (order.status === 'completed') {
        grossSalesMinor += order.subtotalMinor ?? 0;
        discountsMinor += order.discountMinor ?? 0;
        taxableAmountMinor += order.taxableAmountMinor ?? 0;
        totalTaxMinor += order.totalTaxMinor ?? 0;
        cgstMinor += order.cgstMinor ?? 0;
        sgstMinor += order.sgstMinor ?? 0;
        igstMinor += order.igstMinor ?? 0;
        grandTotalMinor += order.grandTotalMinor ?? 0;
        orderCount++;

        // Collection & Outstanding attribution
        collectedAmountMinor += order.paidAmountMinor ?? 0;
        dueAmountMinor += order.dueAmountMinor ?? 0;

        // Process item sales aggregation
        for (const item of order.items || []) {
          const itemId = item.itemId;
          const name = item.nameSnapshot || 'Unknown Item';
          const qty = item.quantity ?? 0;
          const subtotal = item.lineSubtotalMinor ?? 0;
          const discount = item.discountMinor ?? 0;
          const tax = item.lineTaxMinor ?? 0;
          const total = item.lineTotalMinor ?? 0;

          // Aggregating by itemId
          let itemSummary = itemMap.get(itemId);
          if (!itemSummary) {
            itemSummary = {
              itemId,
              name,
              quantity: 0,
              totalSubtotalMinor: 0,
              totalDiscountMinor: 0,
              totalTaxMinor: 0,
              totalGrandTotalMinor: 0
            };
            itemMap.set(itemId, itemSummary);
          }
          itemSummary.quantity += qty;
          itemSummary.totalSubtotalMinor += subtotal;
          itemSummary.totalDiscountMinor += discount;
          itemSummary.totalTaxMinor += tax;
          itemSummary.totalGrandTotalMinor += total;

          // Aggregating by category (using external registry mapping or default 'unknown')
          const categoryId = itemCategoryMap ? (itemCategoryMap[itemId] || 'unknown') : 'unknown';
          const categoryName = categoryNamesMap ? (categoryNamesMap[categoryId] || 'Unknown Category') : 'Unknown Category';

          let categorySummary = categoryMap.get(categoryId);
          if (!categorySummary) {
            categorySummary = {
              categoryId,
              name: categoryName,
              quantity: 0,
              totalSubtotalMinor: 0,
              totalDiscountMinor: 0,
              totalTaxMinor: 0,
              totalGrandTotalMinor: 0
            };
            categoryMap.set(categoryId, categorySummary);
          }
          categorySummary.quantity += qty;
          categorySummary.totalSubtotalMinor += subtotal;
          categorySummary.totalDiscountMinor += discount;
          categorySummary.totalTaxMinor += tax;
          categorySummary.totalGrandTotalMinor += total;
        }
      } else if (order.status === 'cancelled') {
        cancelledOrderCount++;
        cancelledTotalMinor += order.grandTotalMinor ?? 0;
      } else {
        // Active/unsettled order status (confirmed, sentToKitchen, preparing, ready, served)
        activeOrderCount++;
        activeGrandTotalMinor += order.grandTotalMinor ?? 0;

        // Collection & Outstanding attribution
        collectedAmountMinor += order.paidAmountMinor ?? 0;
        dueAmountMinor += order.dueAmountMinor ?? 0;
      }
    }

    // Step 2: Aggregate Refunds from Payment documents
    let refundedAmountMinor = 0;
    for (const payment of payments) {
      if (payment.restaurantId !== cleanRestaurantId) {
        throw new Error(
          `Tenant Isolation Violation: Payment belongs to restaurant "${payment.restaurantId}", expected "${cleanRestaurantId}".`
        );
      }

      // Check date bounds if specified
      if (dateBounds) {
        const paymentDate = parseToDate(payment.createdAt);
        if (!paymentDate || paymentDate < dateBounds.start || paymentDate > dateBounds.end) {
          continue;
        }
      }

      if (payment.status === 'refunded') {
        refundedAmountMinor += payment.amountMinor ?? 0;
      }
    }

    // Step 3: Compute final average (rounded half-up)
    const averageOrderValueMinor = orderCount > 0
      ? Math.round(grandTotalMinor / orderCount)
      : 0;

    return {
      grossSalesMinor,
      discountsMinor,
      taxableAmountMinor,
      totalTaxMinor,
      cgstMinor,
      sgstMinor,
      igstMinor,
      grandTotalMinor,
      orderCount,
      averageOrderValueMinor,
      activeOrderCount,
      activeGrandTotalMinor,
      cancelledOrderCount,
      cancelledTotalMinor,
      collectedAmountMinor,
      dueAmountMinor,
      refundedAmountMinor,
      items: Array.from(itemMap.values()).sort((a, b) => b.totalGrandTotalMinor - a.totalGrandTotalMinor),
      categories: Array.from(categoryMap.values()).sort((a, b) => b.totalGrandTotalMinor - a.totalGrandTotalMinor)
    };
  }

  /**
   * Scoped, authenticated fetch of order and payment documents within a date range.
   * Resolves total analytics using the pure calculation engine.
   */
  async fetchAnalyticsForRange(
    restaurantId: string,
    startDate: Date,
    endDate: Date,
    itemCategoryMap?: Record<string, string>,
    categoryNamesMap?: Record<string, string>
  ): Promise<AnalyticsSummary> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('Valid restaurantId is required to fetch analytics.');
    }

    // Enforce role-based financial visibility permission
    await enforcePermission(cleanRestaurantId, 'view_financial_info');

    try {
      const ordersCol = collection(db, ordersPath(cleanRestaurantId));
      const paymentsCol = collection(db, paymentsPath(cleanRestaurantId));

      // Construct Firestore queries with date bounds
      const ordersQuery = query(
        ordersCol,
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        orderBy('createdAt', 'asc')
      );

      const paymentsQuery = query(
        paymentsCol,
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        orderBy('createdAt', 'asc')
      );

      // Execute queries in parallel
      const [ordersSnap, paymentsSnap] = await Promise.all([
        getDocs(ordersQuery),
        getDocs(paymentsQuery)
      ]);

      const orders: Order[] = [];
      ordersSnap.forEach((docSnap) => {
        orders.push({ id: docSnap.id, ...docSnap.data() } as Order);
      });

      const payments: Payment[] = [];
      paymentsSnap.forEach((docSnap) => {
        payments.push({ id: docSnap.id, ...docSnap.data() } as Payment);
      });

      // Delegate to pure calculation engine with exact date bounds filter to prevent timezone edge cases
      return this.calculateAnalyticsSummary(
        cleanRestaurantId,
        orders,
        payments,
        { start: startDate, end: endDate },
        itemCategoryMap,
        categoryNamesMap
      );
    } catch (err: any) {
      if (err.message && err.message.includes('Permission Denied')) {
        throw err;
      }
      throw handleFirestoreError(err, OperationType.LIST, ordersPath(cleanRestaurantId));
    }
  }
}

export const analyticsService = new AnalyticsService();

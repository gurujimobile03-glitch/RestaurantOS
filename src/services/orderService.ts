import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { Order, OrderItem, OrderStatus, OrderType, OrderSource, CustomerSnapshot } from '../types/order';
import { CartState } from '../types/cart';
import { TaxJurisdiction } from '../types/tax';
import { IOrderService } from './transactionInterfaces';
import { ordersPath, orderDocPath, tableSessionDocPath } from '../utils/paths';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { validateOrder, validateOrderStatusTransition } from '../utils/transactionValidation';
import { calculateOrderTotals } from './orderCalculationService';
import { idempotencyService } from './idempotencyService';
import { enforcePermission } from '../utils/permissions';
import { auditService } from './auditService';
import { sanitizeFirestoreData } from '../utils/sanitize';
import { stockConsumptionService } from './stockConsumptionService';

export interface CreateOrderFromCartInput {
  restaurantId: string;
  cartState: CartState;
  orderType: OrderType;
  source: OrderSource;
  tableId?: string | null;
  tableSessionId?: string | null;
  customerSnapshot?: CustomerSnapshot | null;
  notes?: string;
  taxJurisdiction?: TaxJurisdiction;
  createdBy?: string;
  clientRequestId?: string; // Phase 2G idempotency preparation
}

export interface OrderHistoryFilterOptions {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  tableId?: string | null;
  tableSessionId?: string | null;
  orderType?: OrderType | 'all';
  orderStatus?: OrderStatus | 'all';
  paymentStatus?: 'all' | 'paid' | 'partial' | 'unpaid';
  searchQuery?: string;
  limitCount?: number;
}

/**
 * OrderService
 * 
 * Centralized Order Creation & Lifecycle Management for RestaurantOS POS.
 * 
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Multi-Tenant Restaurant Isolation: Every query and mutation is strictly scoped
 *    under `restaurants/{restaurantId}/orders/{orderId}`.
 * 2. Identity Decoupling: auth.uid is never assumed to be equal to restaurantId.
 * 3. Authoritative Financial Recalculation: Client-supplied financial totals are NEVER trusted.
 *    Order totals and line snapshots are calculated authoritatively by the Phase 2B engine.
 * 4. Historical Price Snapshot Policy: Order items snapshot unitPriceMinor, taxRate, and taxInclusive,
 *    guaranteeing that subsequent catalog changes do not alter finalized orders.
 * 5. Lifecycle State Machine: Order status transitions are validated using validateOrderStatusTransition.
 *    Non-draft orders cannot be deleted; cancellation is preferred to preserve audit trails.
 * 6. Dine-in Invariant: Dine-in orders require a valid, open TableSession belonging to the same restaurant.
 */
export class OrderService implements IOrderService {
  /**
   * Retrieves an order by its ID within a restaurant.
   */
  async getOrderById(restaurantId: string, orderId: string): Promise<Order | null> {
    const path = orderDocPath(restaurantId, orderId);
    try {
      const docRef = doc(db, 'restaurants', restaurantId.trim(), 'orders', orderId.trim());
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return null;
      }
      return { id: snap.id, ...snap.data() } as Order;
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.GET, path);
    }
  }

  /**
   * Retrieves all orders for a specific table session.
   */
  async getOrdersForSession(restaurantId: string, sessionId: string): Promise<Order[]> {
    const path = ordersPath(restaurantId);
    try {
      const colRef = collection(db, 'restaurants', restaurantId.trim(), 'orders');
      const q = query(
        colRef,
        where('tableSessionId', '==', sessionId.trim())
      );
      const snap = await getDocs(q);
      const orders: Order[] = [];
      snap.forEach((d) => {
        orders.push({ id: d.id, ...d.data() } as Order);
      });
      return orders.sort((a, b) => {
        const timeA = (a.createdAt as any)?.toMillis?.() || (a.createdAt ? new Date(a.createdAt as any).getTime() : 0);
        const timeB = (b.createdAt as any)?.toMillis?.() || (b.createdAt ? new Date(b.createdAt as any).getTime() : 0);
        return timeB - timeA;
      });
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.LIST, path);
    }
  }

  /**
   * Converts a CartState into validated OrderItems and calculates authoritative financial totals
   * using the Phase 2B Calculation Engine.
   */
  prepareOrderItemsAndTotals(
    cartState: CartState,
    taxJurisdiction: TaxJurisdiction = 'intraState'
  ): { items: OrderItem[]; calculationResult: ReturnType<typeof calculateOrderTotals> } {
    if (!cartState.items || cartState.items.length === 0) {
      throw new Error('Cannot create order from an empty cart.');
    }

    // 1. Prepare line inputs for Phase 2B calculation engine
    const lineInputs = cartState.items.map((cartItem) => ({
      quantity: cartItem.quantity,
      unitPriceMinor: cartItem.unitPriceMinor,
      taxRate: cartItem.taxRate,
      taxInclusive: cartItem.taxInclusive,
      discount: cartItem.discount
    }));

    // 2. Authoritatively calculate order totals using Phase 2B engine
    const calculationResult = calculateOrderTotals({
      items: lineInputs,
      orderDiscount: cartState.orderDiscount,
      taxJurisdiction
    });

    // 3. Build snapshot OrderItems with both historical catalog attributes and calculated line totals
    const items: OrderItem[] = cartState.items.map((cartItem, idx) => {
      const lineRes = calculationResult.lineResults[idx];
      return {
        itemId: cartItem.itemId,
        nameSnapshot: cartItem.nameSnapshot,
        shortNameSnapshot: cartItem.shortNameSnapshot,
        quantity: cartItem.quantity,
        unitPriceMinor: cartItem.unitPriceMinor,
        taxRate: cartItem.taxRate,
        taxInclusive: cartItem.taxInclusive,
        discountMinor: lineRes.discountMinor,
        lineSubtotalMinor: lineRes.subtotalMinor,
        lineTaxMinor: lineRes.totalTaxMinor,
        lineTotalMinor: lineRes.lineTotalMinor,
        notes: cartItem.notes,
        modifiers: cartItem.modifiers ? [...cartItem.modifiers] : undefined
      };
    });

    return { items, calculationResult };
  }

  /**
   * High-level order creation method from POS Cart state.
   * Performs full session validation, authoritative financial recalculation, and atomic persistence.
   */
  async createOrderFromCart(input: CreateOrderFromCartInput): Promise<Order> {
    const {
      restaurantId,
      cartState,
      orderType,
      source,
      tableId,
      tableSessionId,
      customerSnapshot,
      notes,
      taxJurisdiction = 'intraState',
      createdBy
    } = input;

    if (!restaurantId || typeof restaurantId !== 'string' || restaurantId.trim() === '') {
      throw new Error('Valid restaurantId is required to create an order.');
    }

    const cleanRestaurantId = restaurantId.trim();

    await enforcePermission(cleanRestaurantId, 'create_orders');

    // 1. Validate Dine-In Pre-conditions
    if (orderType === 'dineIn') {
      if (!tableSessionId || typeof tableSessionId !== 'string' || tableSessionId.trim() === '') {
        throw new Error('Dine-in orders require a valid tableSessionId.');
      }

      // Verify TableSession existence, restaurant scope, and open status
      const sessionPath = tableSessionDocPath(cleanRestaurantId, tableSessionId.trim());
      const sessionRef = doc(
        db,
        'restaurants',
        cleanRestaurantId,
        'tableSessions',
        tableSessionId.trim()
      );
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error(
          `Cannot create dine-in order: TableSession "${tableSessionId}" does not exist in restaurant "${cleanRestaurantId}".`
        );
      }

      const sessionData = sessionSnap.data();
      if (sessionData.status !== 'open') {
        throw new Error(
          `Cannot create dine-in order: TableSession "${tableSessionId}" is closed (status: ${sessionData.status}).`
        );
      }

      if (sessionData.restaurantId !== cleanRestaurantId) {
        throw new Error(
          `Cannot create dine-in order: TableSession does not belong to restaurant "${cleanRestaurantId}".`
        );
      }
    }

    // 2. Authoritatively calculate OrderItems & Totals via Phase 2B engine
    const { items, calculationResult } = this.prepareOrderItemsAndTotals(cartState, taxJurisdiction);

    // 3. Construct Order entity
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const now = new Date();
    const resolvedUserId = createdBy || auth.currentUser?.uid || 'system';

    const orderPayload: Omit<Order, 'id' | 'createdAt' | 'updatedAt'> = {
      restaurantId: cleanRestaurantId,
      orderNumber,
      orderType,
      source,
      status: 'confirmed', // Initial authoritative POS order status
      tableId: orderType === 'dineIn' ? (tableId || null) : null,
      tableSessionId: orderType === 'dineIn' ? (tableSessionId || null) : null,
      items,
      subtotalMinor: calculationResult.subtotalMinor,
      discountMinor: calculationResult.discountMinor,
      taxableAmountMinor: calculationResult.taxableAmountMinor,
      cgstMinor: calculationResult.cgstMinor,
      sgstMinor: calculationResult.sgstMinor,
      igstMinor: calculationResult.igstMinor,
      totalTaxMinor: calculationResult.totalTaxMinor,
      grandTotalMinor: calculationResult.grandTotalMinor,
      paidAmountMinor: 0,
      dueAmountMinor: calculationResult.grandTotalMinor,
      notes: notes || cartState.notes,
      customerSnapshot: customerSnapshot || null,
      createdBy: resolvedUserId,
      updatedBy: resolvedUserId
    };

    // 4. Validate complete order structure and financial invariants
    const validation = validateOrder(orderPayload);
    if (!validation.isValid) {
      throw new Error(`Order validation failed: ${validation.error}`);
    }

    return this.createOrder(cleanRestaurantId, orderPayload, input.clientRequestId);
  }

  /**
   * Persists a pre-constructed order entity into Firestore.
   * Hardened with Idempotency Key binding to prevent duplicate orders across retries/network drops.
   */
  async createOrder(
    restaurantId: string,
    orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>,
    clientRequestId?: string
  ): Promise<Order> {
    const cleanRestaurantId = restaurantId.trim();
    const path = ordersPath(cleanRestaurantId);

    // Validate order
    const validation = validateOrder(orderData);
    if (!validation.isValid) {
      throw new Error(`Order validation failed: ${validation.error}`);
    }

    const cleanKey = clientRequestId?.trim();

    // Check idempotency if clientRequestId is provided
    if (cleanKey) {
      const check = await idempotencyService.checkOrAcquire<Order>(
        cleanRestaurantId,
        cleanKey,
        'create_order',
        orderData
      );

      if (check.action === 'return_cached' && check.cachedResult) {
        return check.cachedResult;
      }
    }

    try {
      const colRef = collection(db, 'restaurants', cleanRestaurantId, 'orders');
      const newDocRef = doc(colRef);
      const now = new Date();

      const docPayload = sanitizeFirestoreData({
        ...orderData,
        createdAt: serverTimestamp() || now,
        updatedAt: serverTimestamp() || now
      });

      await setDoc(newDocRef, docPayload);

      const createdOrder: Order = {
        id: newDocRef.id,
        ...orderData,
        createdAt: now,
        updatedAt: now
      };

      await auditService.logEvent(cleanRestaurantId, {
        restaurantId: cleanRestaurantId,
        entityType: 'order',
        entityId: createdOrder.id,
        action: 'order_created',
        actorUid: createdOrder.createdBy || auth.currentUser?.uid || 'system',
        metadata: {
          orderNumber: createdOrder.orderNumber,
          grandTotalMinor: createdOrder.grandTotalMinor,
          orderType: createdOrder.orderType,
          tableSessionId: createdOrder.tableSessionId || null
        }
      });

      if (cleanKey) {
        await idempotencyService.recordSuccess(
          cleanRestaurantId,
          cleanKey,
          'create_order',
          orderData,
          createdOrder.id,
          createdOrder
        );
      }

      // Automatic recipe stock consumption for confirmed order
      try {
        await stockConsumptionService.consumeStockForOrder(cleanRestaurantId, {
          orderId: createdOrder.id,
          orderNumber: createdOrder.orderNumber,
          items: createdOrder.items.map((i) => ({
            itemId: i.itemId,
            quantity: i.quantity,
            nameSnapshot: i.nameSnapshot
          })),
          clientRequestId: cleanKey ? `${cleanKey}_consumption` : undefined
        });
      } catch (consumptionErr) {
        console.warn('Recipe stock consumption notice:', consumptionErr);
      }

      return createdOrder;
    } catch (err: unknown) {
      if (cleanKey) {
        await idempotencyService.recordFailure(
          cleanRestaurantId,
          cleanKey,
          (err as any)?.message || 'Failed to create order'
        );
      }
      throw handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  /**
   * Updates an order's lifecycle status using the centralized status transition validator.
   */
  async updateOrderStatus(
    restaurantId: string,
    orderId: string,
    newStatus: OrderStatus,
    updatedBy: string,
    cancellationReason?: string
  ): Promise<void> {
    const cleanRestaurantId = restaurantId.trim();

    if (newStatus === 'cancelled') {
      await enforcePermission(cleanRestaurantId, 'cancel_orders');
    } else {
      await enforcePermission(cleanRestaurantId, 'modify_orders');
    }

    const cleanOrderId = orderId.trim();
    const path = orderDocPath(cleanRestaurantId, cleanOrderId);

    // 1. Fetch current order
    let orderSnap;
    try {
      const docRef = doc(db, 'restaurants', cleanRestaurantId, 'orders', cleanOrderId);
      orderSnap = await getDoc(docRef);
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.GET, path);
    }

    if (!orderSnap.exists()) {
      throw new Error(`Cannot update order status: Order "${cleanOrderId}" not found.`);
    }

    const currentOrder = orderSnap.data() as Order;

    // 2. Validate lifecycle transition
    const transitionResult = validateOrderStatusTransition(currentOrder.status, newStatus);
    if (!transitionResult.isValid) {
      throw new Error(`Cannot transition order status: ${transitionResult.error}`);
    }

    // 3. Apply status update
    try {
      const docRef = doc(db, 'restaurants', cleanRestaurantId, 'orders', cleanOrderId);
      const now = new Date();
      const resolvedUserId = updatedBy || auth.currentUser?.uid || 'system';

      const updatePayload: Record<string, unknown> = {
        status: newStatus,
        updatedAt: serverTimestamp() || now,
        updatedBy: resolvedUserId
      };

      if (newStatus === 'cancelled') {
        updatePayload.cancellationReason = cancellationReason || 'Cancelled by staff';
        updatePayload.cancelledAt = serverTimestamp() || now;
        updatePayload.cancelledBy = resolvedUserId;
      }

      await updateDoc(docRef, updatePayload);

      // Reverse stock consumption for cancelled order
      if (newStatus === 'cancelled') {
        try {
          await stockConsumptionService.reverseOrderStockConsumption(
            cleanRestaurantId,
            cleanOrderId,
            cancellationReason || 'Order cancelled'
          );
        } catch (revErr) {
          console.warn('Stock consumption reversal notice:', revErr);
        }
      }

      await auditService.logEvent(cleanRestaurantId, {
        restaurantId: cleanRestaurantId,
        entityType: 'order',
        entityId: cleanOrderId,
        action: newStatus === 'cancelled' ? 'order_cancelled' : 'order_updated',
        actorUid: resolvedUserId,
        metadata: {
          oldStatus: currentOrder.status,
          newStatus,
          cancellationReason: cancellationReason || null
        }
      });
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  /**
   * Subscribes to real-time order updates for a restaurant.
   */
  subscribeToOrders(
    restaurantId: string,
    onUpdate: (orders: Order[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const cleanRestaurantId = restaurantId.trim();
    const colRef = collection(db, 'restaurants', cleanRestaurantId, 'orders');
    const q = query(colRef, orderBy('createdAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const orders: Order[] = [];
        snapshot.forEach((d) => {
          orders.push({ id: d.id, ...d.data() } as Order);
        });
        onUpdate(orders);
      },
      (err) => {
        if (!auth.currentUser) return;
        const errCode = (err as any)?.code;
        if (errCode === 'permission-denied' || errCode === 'unavailable') {
          console.warn('[RestaurantOS Debug] Orders subscription notice (permission/offline):', (err as any)?.message);
          onUpdate([]);
        } else {
          console.error('[RestaurantOS Debug] Error listening to orders:', err);
        }
        if (onError) onError(err as Error);
      }
    );
  }

  /**
   * Queries historical orders for a restaurant with flexible filtering and bounded results.
   * Preserves historical financial and item snapshots without any recalculation.
   */
  async queryOrderHistory(
    restaurantId: string,
    options: OrderHistoryFilterOptions = {}
  ): Promise<{ orders: Order[]; totalCount: number }> {
    const cleanRestaurantId = restaurantId?.trim();
    if (!cleanRestaurantId) {
      throw new Error('restaurantId is required to query order history.');
    }

    await enforcePermission(cleanRestaurantId, 'view_orders');

    const path = ordersPath(cleanRestaurantId);
    try {
      const colRef = collection(db, 'restaurants', cleanRestaurantId, 'orders');
      let q = query(colRef);

      if (options.tableSessionId) {
        q = query(colRef, where('tableSessionId', '==', options.tableSessionId.trim()));
      }

      const snap = await getDocs(q);
      let orders: Order[] = [];
      snap.forEach((d) => {
        orders.push({ id: d.id, ...d.data() } as Order);
      });

      // Apply in-memory multi-attribute filters
      if (options.tableId && options.tableId !== 'all') {
        orders = orders.filter((o) => o.tableId === options.tableId);
      }

      if (options.orderType && options.orderType !== 'all') {
        orders = orders.filter((o) => o.orderType === options.orderType);
      }

      if (options.orderStatus && options.orderStatus !== 'all') {
        orders = orders.filter((o) => o.status === options.orderStatus);
      }

      if (options.paymentStatus && options.paymentStatus !== 'all') {
        if (options.paymentStatus === 'paid') {
          orders = orders.filter((o) => (o.paidAmountMinor || 0) >= (o.grandTotalMinor || 0) && (o.grandTotalMinor || 0) > 0);
        } else if (options.paymentStatus === 'partial') {
          orders = orders.filter(
            (o) => (o.paidAmountMinor || 0) > 0 && (o.paidAmountMinor || 0) < (o.grandTotalMinor || 0)
          );
        } else if (options.paymentStatus === 'unpaid') {
          orders = orders.filter((o) => (o.paidAmountMinor || 0) === 0 || (o.dueAmountMinor || 0) > 0);
        }
      }

      if (options.startDate) {
        const startMillis = new Date(options.startDate).getTime();
        orders = orders.filter((o) => {
          const time = (o.createdAt as any)?.toMillis?.() || (o.createdAt ? new Date(o.createdAt as any).getTime() : 0);
          return time >= startMillis;
        });
      }

      if (options.endDate) {
        const endMillis = new Date(options.endDate).getTime();
        orders = orders.filter((o) => {
          const time = (o.createdAt as any)?.toMillis?.() || (o.createdAt ? new Date(o.createdAt as any).getTime() : 0);
          return time <= endMillis;
        });
      }

      if (options.searchQuery?.trim()) {
        const queryLower = options.searchQuery.trim().toLowerCase();
        orders = orders.filter((o) => {
          const orderNum = (o.orderNumber || '').toLowerCase();
          const custName = (o.customerSnapshot?.name || '').toLowerCase();
          const custPhone = (o.customerSnapshot?.phone || '').toLowerCase();
          const notes = (o.notes || '').toLowerCase();
          return (
            orderNum.includes(queryLower) ||
            custName.includes(queryLower) ||
            custPhone.includes(queryLower) ||
            notes.includes(queryLower)
          );
        });
      }

      // Sort by createdAt descending
      orders.sort((a, b) => {
        const timeA = (a.createdAt as any)?.toMillis?.() || (a.createdAt ? new Date(a.createdAt as any).getTime() : 0);
        const timeB = (b.createdAt as any)?.toMillis?.() || (b.createdAt ? new Date(b.createdAt as any).getTime() : 0);
        return timeB - timeA;
      });

      const totalCount = orders.length;
      const limit = options.limitCount || 50;
      const paginatedOrders = orders.slice(0, limit);

      return {
        orders: paginatedOrders,
        totalCount
      };
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.LIST, path);
    }
  }

  /**
   * Safely reopens or transitions an order for controlled correction.
   * Invariant: Never alters past financial records or removes payment ledger entries.
   */
  async reopenOrder(
    restaurantId: string,
    orderId: string,
    reopenedBy: string,
    reason?: string
  ): Promise<Order> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanOrderId = orderId?.trim();
    if (!cleanRestaurantId || !cleanOrderId) {
      throw new Error('restaurantId and orderId are required to reopen order.');
    }

    await enforcePermission(cleanRestaurantId, 'modify_orders');

    const path = orderDocPath(cleanRestaurantId, cleanOrderId);
    try {
      const order = await this.getOrderById(cleanRestaurantId, cleanOrderId);
      if (!order) {
        throw new Error(`Order "${cleanOrderId}" not found in restaurant "${cleanRestaurantId}".`);
      }

      if (order.status === 'cancelled') {
        throw new Error('Cannot reopen cancelled order.');
      }

      // Reopening is permitted for completed or served orders to allow adjustment
      const newStatus: OrderStatus = 'served';
      const docRef = doc(db, 'restaurants', cleanRestaurantId, 'orders', cleanOrderId);
      const now = new Date();

      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: serverTimestamp() || now,
        updatedBy: reopenedBy
      });

      await auditService.logEvent(cleanRestaurantId, {
        restaurantId: cleanRestaurantId,
        entityType: 'order',
        entityId: cleanOrderId,
        action: 'order_reopened',
        actorUid: reopenedBy,
        metadata: {
          previousStatus: order.status,
          newStatus,
          reason: reason || 'Staff reopened order for adjustment'
        }
      });

      return {
        ...order,
        status: newStatus,
        updatedAt: now,
        updatedBy: reopenedBy
      };
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  /**
   * Logs a bill viewed event in audit log.
   */
  async logBillViewed(restaurantId: string, orderId: string, actorUid: string): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanOrderId = orderId?.trim();
    if (!cleanRestaurantId || !cleanOrderId) return;
    try {
      await auditService.logEvent(cleanRestaurantId, {
        restaurantId: cleanRestaurantId,
        entityType: 'order',
        entityId: cleanOrderId,
        action: 'bill_viewed',
        actorUid,
        metadata: { orderId: cleanOrderId }
      });
    } catch (err) {
      console.warn('[RestaurantOS] Failed to log bill_viewed audit event:', err);
    }
  }

  /**
   * Logs a bill reprinted event in audit log.
   */
  async logBillReprint(restaurantId: string, orderId: string, actorUid: string): Promise<void> {
    const cleanRestaurantId = restaurantId?.trim();
    const cleanOrderId = orderId?.trim();
    if (!cleanRestaurantId || !cleanOrderId) return;
    try {
      await auditService.logEvent(cleanRestaurantId, {
        restaurantId: cleanRestaurantId,
        entityType: 'order',
        entityId: cleanOrderId,
        action: 'bill_reprinted',
        actorUid,
        metadata: { orderId: cleanOrderId }
      });
    } catch (err) {
      console.warn('[RestaurantOS] Failed to log bill_reprinted audit event:', err);
    }
  }
}

export const orderService = new OrderService();

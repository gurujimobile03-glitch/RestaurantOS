import { isValidMoney } from './money';
import { Table, TableFormData, TableSession, TableSessionStatus } from '../types/table';
import { Order, OrderItem, OrderStatus, OrderType, OrderSource } from '../types/order';
import { KOT, KOTItem, KOTStatus } from '../types/kot';
import { Payment, PaymentMethod, PaymentStatus } from '../types/payment';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  errors?: Record<string, string>;
}

// Allowed enums and values
export const VALID_ORDER_TYPES: OrderType[] = ['dineIn', 'takeaway', 'delivery', 'online'];
export const VALID_ORDER_SOURCES: OrderSource[] = ['pos', 'captain', 'admin', 'online', 'api'];
export const VALID_ORDER_STATUSES: OrderStatus[] = [
  'draft',
  'confirmed',
  'sentToKitchen',
  'preparing',
  'ready',
  'served',
  'completed',
  'cancelled'
];

export const VALID_KOT_STATUSES: KOTStatus[] = [
  'draft',
  'confirmed',
  'sentToKitchen',
  'preparing',
  'ready',
  'served',
  'cancelled'
];

export const VALID_PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'upi', 'other'];
export const VALID_PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'completed', 'failed', 'refunded'];
export const VALID_TABLE_SESSION_STATUSES: TableSessionStatus[] = ['open', 'closed'];

// -------------------------------------------------------------
// Table Validation
// -------------------------------------------------------------

export function validateTable(data: Partial<Table | TableFormData>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    errors.name = 'Table name is required.';
  } else if (data.name.trim().length > 50) {
    errors.name = 'Table name cannot exceed 50 characters.';
  }

  if (!data.tableNumber || typeof data.tableNumber !== 'string' || data.tableNumber.trim() === '') {
    errors.tableNumber = 'Table number is required.';
  } else {
    const trimmedNumber = data.tableNumber.trim();
    if (trimmedNumber.length > 20) {
      errors.tableNumber = 'Table number cannot exceed 20 characters.';
    } else if (trimmedNumber.includes('/') || trimmedNumber.includes('\\') || trimmedNumber.includes('..')) {
      errors.tableNumber = 'Table number cannot contain slashes or directory traversal characters.';
    }
  }

  if (typeof data.capacity !== 'number' || !Number.isInteger(data.capacity) || data.capacity <= 0) {
    errors.capacity = 'Capacity must be an integer greater than 0.';
  } else if (data.capacity > 100) {
    errors.capacity = 'Capacity cannot exceed 100.';
  }

  if (data.sortOrder !== undefined) {
    if (typeof data.sortOrder !== 'number' || !Number.isInteger(data.sortOrder) || data.sortOrder < 0) {
      errors.sortOrder = 'Sort order must be a non-negative integer.';
    }
  }

  const keys = Object.keys(errors);
  return {
    isValid: keys.length === 0,
    error: keys.length > 0 ? errors[keys[0]] : undefined,
    errors: keys.length > 0 ? errors : undefined
  };
}

// -------------------------------------------------------------
// Table Session Validation
// -------------------------------------------------------------

export function validateTableSession(data: Partial<TableSession>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.tableId || typeof data.tableId !== 'string' || data.tableId.trim() === '') {
    errors.tableId = 'Valid tableId is required.';
  }

  if (
    typeof data.guestCount !== 'number' ||
    !Number.isInteger(data.guestCount) ||
    data.guestCount <= 0
  ) {
    errors.guestCount = 'Guest count must be an integer greater than 0.';
  }

  if (!data.status || !VALID_TABLE_SESSION_STATUSES.includes(data.status)) {
    errors.status = `Session status must be one of: ${VALID_TABLE_SESSION_STATUSES.join(', ')}`;
  }

  const keys = Object.keys(errors);
  return {
    isValid: keys.length === 0,
    error: keys.length > 0 ? errors[keys[0]] : undefined,
    errors: keys.length > 0 ? errors : undefined
  };
}

// -------------------------------------------------------------
// Order Item Validation
// -------------------------------------------------------------

export function validateOrderItem(item: Partial<OrderItem>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!item.itemId || typeof item.itemId !== 'string' || item.itemId.trim() === '') {
    errors.itemId = 'Valid itemId is required.';
  }

  if (!item.nameSnapshot || typeof item.nameSnapshot !== 'string' || item.nameSnapshot.trim() === '') {
    errors.nameSnapshot = 'nameSnapshot is required to preserve historical menu item state.';
  }

  if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
    errors.quantity = 'Quantity must be an integer greater than 0.';
  }

  if (!isValidMoney(item.unitPriceMinor)) {
    errors.unitPriceMinor = 'unitPriceMinor must be an authoritative non-negative integer minor unit.';
  }

  if (
    typeof item.taxRate !== 'number' ||
    Number.isNaN(item.taxRate) ||
    item.taxRate < 0 ||
    item.taxRate > 100
  ) {
    errors.taxRate = 'taxRate must be a number between 0 and 100.';
  }

  if (item.discountMinor !== undefined && !isValidMoney(item.discountMinor)) {
    errors.discountMinor = 'discountMinor must be a non-negative integer minor unit.';
  }

  if (item.lineSubtotalMinor !== undefined && !isValidMoney(item.lineSubtotalMinor)) {
    errors.lineSubtotalMinor = 'lineSubtotalMinor must be a non-negative integer minor unit.';
  }

  if (item.lineTaxMinor !== undefined && !isValidMoney(item.lineTaxMinor)) {
    errors.lineTaxMinor = 'lineTaxMinor must be a non-negative integer minor unit.';
  }

  if (item.lineTotalMinor !== undefined && !isValidMoney(item.lineTotalMinor)) {
    errors.lineTotalMinor = 'lineTotalMinor must be a non-negative integer minor unit.';
  }

  const keys = Object.keys(errors);
  return {
    isValid: keys.length === 0,
    error: keys.length > 0 ? errors[keys[0]] : undefined,
    errors: keys.length > 0 ? errors : undefined
  };
}

// -------------------------------------------------------------
// Order Validation
// -------------------------------------------------------------

export function validateOrder(order: Partial<Order>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!order.restaurantId || typeof order.restaurantId !== 'string' || order.restaurantId.trim() === '') {
    errors.restaurantId = 'Valid restaurantId is required.';
  }

  if (!order.orderType || !VALID_ORDER_TYPES.includes(order.orderType)) {
    errors.orderType = `orderType must be one of: ${VALID_ORDER_TYPES.join(', ')}`;
  }

  if (!order.source || !VALID_ORDER_SOURCES.includes(order.source)) {
    errors.source = `source must be one of: ${VALID_ORDER_SOURCES.join(', ')}`;
  }

  if (!order.status || !VALID_ORDER_STATUSES.includes(order.status)) {
    errors.status = `status must be one of: ${VALID_ORDER_STATUSES.join(', ')}`;
  }

  // Dine-in orders must specify a tableId if not in draft
  if (order.orderType === 'dineIn' && order.status !== 'draft' && !order.tableId) {
    errors.tableId = 'tableId is required for confirmed dine-in orders.';
  }

  // Confirmed orders (and beyond) must have at least one item
  if (order.status !== 'draft' && (!Array.isArray(order.items) || order.items.length === 0)) {
    errors.items = 'Order must contain at least one item when confirmed.';
  }

  // Validate each item if present
  if (Array.isArray(order.items)) {
    for (let i = 0; i < order.items.length; i++) {
      const itemValidation = validateOrderItem(order.items[i]);
      if (!itemValidation.isValid) {
        errors[`items[${i}]`] = itemValidation.error || 'Invalid item';
        break; // surface first item error
      }
    }
  }

  // Validate financial totals
  const moneyFields: (keyof Order)[] = [
    'subtotalMinor',
    'discountMinor',
    'taxableAmountMinor',
    'cgstMinor',
    'sgstMinor',
    'igstMinor',
    'totalTaxMinor',
    'grandTotalMinor',
    'paidAmountMinor',
    'dueAmountMinor'
  ];

  for (const field of moneyFields) {
    const val = order[field];
    if (val !== undefined && !isValidMoney(val)) {
      errors[field] = `${field} must be an integer minor unit (e.g. paise), received: ${val}`;
    }
  }

  // Basic totals consistency check if grandTotalMinor and paidAmountMinor are present
  if (
    isValidMoney(order.grandTotalMinor) &&
    isValidMoney(order.paidAmountMinor) &&
    isValidMoney(order.dueAmountMinor)
  ) {
    const expectedDue = Math.max(0, order.grandTotalMinor - order.paidAmountMinor);
    if (order.dueAmountMinor !== expectedDue) {
      errors.dueAmountMinor = `dueAmountMinor (${order.dueAmountMinor}) does not match grandTotalMinor (${order.grandTotalMinor}) - paidAmountMinor (${order.paidAmountMinor})`;
    }
  }

  const keys = Object.keys(errors);
  return {
    isValid: keys.length === 0,
    error: keys.length > 0 ? errors[keys[0]] : undefined,
    errors: keys.length > 0 ? errors : undefined
  };
}

// -------------------------------------------------------------
// Payment Validation
// -------------------------------------------------------------

export function validatePayment(payment: Partial<Payment>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!payment.orderId || typeof payment.orderId !== 'string' || payment.orderId.trim() === '') {
    errors.orderId = 'Valid orderId is required.';
  }

  if (!payment.restaurantId || typeof payment.restaurantId !== 'string' || payment.restaurantId.trim() === '') {
    errors.restaurantId = 'Valid restaurantId is required.';
  }

  if (!isValidMoney(payment.amountMinor) || payment.amountMinor <= 0) {
    errors.amountMinor = 'amountMinor must be an integer minor unit greater than 0.';
  }

  if (!payment.method || !VALID_PAYMENT_METHODS.includes(payment.method)) {
    errors.method = `method must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`;
  }

  if (!payment.status || !VALID_PAYMENT_STATUSES.includes(payment.status)) {
    errors.status = `status must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}`;
  }

  const keys = Object.keys(errors);
  return {
    isValid: keys.length === 0,
    error: keys.length > 0 ? errors[keys[0]] : undefined,
    errors: keys.length > 0 ? errors : undefined
  };
}

// -------------------------------------------------------------
// KOT Validation
// -------------------------------------------------------------

export function validateKOT(kot: Partial<KOT>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!kot.orderId || typeof kot.orderId !== 'string' || kot.orderId.trim() === '') {
    errors.orderId = 'Valid orderId is required.';
  }

  if (!kot.restaurantId || typeof kot.restaurantId !== 'string' || kot.restaurantId.trim() === '') {
    errors.restaurantId = 'Valid restaurantId is required.';
  }

  if (!kot.status || !VALID_KOT_STATUSES.includes(kot.status)) {
    errors.status = `status must be one of: ${VALID_KOT_STATUSES.join(', ')}`;
  }

  if (!Array.isArray(kot.items) || kot.items.length === 0) {
    errors.items = 'KOT must contain at least one item.';
  } else {
    for (let i = 0; i < kot.items.length; i++) {
      const item: Partial<KOTItem> = kot.items[i];
      if (!item.itemId || typeof item.itemId !== 'string' || item.itemId.trim() === '') {
        errors[`items[${i}].itemId`] = 'itemId is required for each KOT item.';
      }
      if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity <= 0) {
        errors[`items[${i}].quantity`] = 'KOT item quantity must be an integer greater than 0.';
      }
      if (!item.nameSnapshot || typeof item.nameSnapshot !== 'string' || item.nameSnapshot.trim() === '') {
        errors[`items[${i}].nameSnapshot`] = 'nameSnapshot is required for each KOT item.';
      }
    }
  }

  const keys = Object.keys(errors);
  return {
    isValid: keys.length === 0,
    error: keys.length > 0 ? errors[keys[0]] : undefined,
    errors: keys.length > 0 ? errors : undefined
  };
}

// -------------------------------------------------------------
// Lifecycle Transitions
// -------------------------------------------------------------

/**
 * Valid transitions for Order lifecycle:
 * draft -> confirmed -> sentToKitchen -> preparing -> ready -> served -> completed
 * Takeaway / express flows can transition ready -> completed.
 * cancellation is allowed from any non-terminal state.
 */
const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['sentToKitchen', 'preparing', 'cancelled'],
  sentToKitchen: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'completed', 'cancelled'],
  served: ['completed', 'cancelled'],
  completed: [], // terminal
  cancelled: [] // terminal
};

export function validateOrderStatusTransition(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
): ValidationResult {
  if (!VALID_ORDER_STATUSES.includes(currentStatus)) {
    return { isValid: false, error: `Invalid currentStatus: ${currentStatus}` };
  }
  if (!VALID_ORDER_STATUSES.includes(nextStatus)) {
    return { isValid: false, error: `Invalid nextStatus: ${nextStatus}` };
  }
  if (currentStatus === nextStatus) {
    return { isValid: true };
  }

  const allowed = ALLOWED_ORDER_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return {
      isValid: false,
      error: `Illegal order status transition from "${currentStatus}" to "${nextStatus}". Allowed next statuses: ${allowed.length ? allowed.join(', ') : 'none (terminal state)'}`
    };
  }

  return { isValid: true };
}

/**
 * Valid transitions for KOT lifecycle:
 * draft -> confirmed -> sentToKitchen -> preparing -> ready -> served
 * cancellation is allowed from any active state before served.
 */
const ALLOWED_KOT_TRANSITIONS: Record<KOTStatus, KOTStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['sentToKitchen', 'preparing', 'cancelled'],
  sentToKitchen: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: [], // terminal
  cancelled: [] // terminal
};

export function validateKOTStatusTransition(
  currentStatus: KOTStatus,
  nextStatus: KOTStatus
): ValidationResult {
  if (!VALID_KOT_STATUSES.includes(currentStatus)) {
    return { isValid: false, error: `Invalid currentStatus: ${currentStatus}` };
  }
  if (!VALID_KOT_STATUSES.includes(nextStatus)) {
    return { isValid: false, error: `Invalid nextStatus: ${nextStatus}` };
  }
  if (currentStatus === nextStatus) {
    return { isValid: true };
  }

  const allowed = ALLOWED_KOT_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return {
      isValid: false,
      error: `Illegal KOT status transition from "${currentStatus}" to "${nextStatus}". Allowed next statuses: ${allowed.length ? allowed.join(', ') : 'none (terminal state)'}`
    };
  }

  return { isValid: true };
}

/**
 * Valid transitions for TableSession lifecycle:
 * open -> closed (terminal)
 * closed -> open is strictly prohibited (closed is terminal; new session must be created).
 * closed -> closed is prohibited.
 */
const ALLOWED_TABLE_SESSION_TRANSITIONS: Record<TableSessionStatus, TableSessionStatus[]> = {
  open: ['closed'],
  closed: [] // terminal
};

export function validateTableSessionStatusTransition(
  currentStatus: TableSessionStatus,
  nextStatus: TableSessionStatus
): ValidationResult {
  if (!VALID_TABLE_SESSION_STATUSES.includes(currentStatus)) {
    return { isValid: false, error: `Invalid currentStatus: ${currentStatus}` };
  }
  if (!VALID_TABLE_SESSION_STATUSES.includes(nextStatus)) {
    return { isValid: false, error: `Invalid nextStatus: ${nextStatus}` };
  }
  if (currentStatus === nextStatus) {
    if (currentStatus === 'closed') {
      return {
        isValid: false,
        error: 'TableSession is already closed and cannot be re-closed.'
      };
    }
    return { isValid: true };
  }

  const allowed = ALLOWED_TABLE_SESSION_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return {
      isValid: false,
      error: `Illegal table session status transition from "${currentStatus}" to "${nextStatus}". Closed sessions cannot be reopened; a new session must be created.`
    };
  }

  return { isValid: true };
}

/**
 * Valid transitions for Payment lifecycle:
 * pending -> completed
 * pending -> failed
 * completed -> refunded
 *
 * Terminal / illegal transitions:
 * failed -> completed (illegal)
 * refunded -> completed (illegal)
 * refunded -> pending (illegal)
 * completed -> pending (illegal)
 */
const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['completed', 'failed'],
  completed: ['refunded'],
  failed: [], // terminal
  refunded: [] // terminal
};

export function validatePaymentStatusTransition(
  currentStatus: PaymentStatus,
  nextStatus: PaymentStatus
): ValidationResult {
  if (!VALID_PAYMENT_STATUSES.includes(currentStatus)) {
    return { isValid: false, error: `Invalid currentStatus: ${currentStatus}` };
  }
  if (!VALID_PAYMENT_STATUSES.includes(nextStatus)) {
    return { isValid: false, error: `Invalid nextStatus: ${nextStatus}` };
  }
  if (currentStatus === nextStatus) {
    return { isValid: true };
  }

  const allowed = ALLOWED_PAYMENT_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return {
      isValid: false,
      error: `Illegal payment status transition from "${currentStatus}" to "${nextStatus}". Allowed next statuses: ${allowed.length ? allowed.join(', ') : 'none (terminal state)'}`
    };
  }

  return { isValid: true };
}



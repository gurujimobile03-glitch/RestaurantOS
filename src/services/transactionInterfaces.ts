import { Table, TableFormData, TableSession } from '../types/table';
import { Order, OrderStatus } from '../types/order';
import { Payment, PaymentStatus } from '../types/payment';
import { KOT, KOTStatus } from '../types/kot';
import { AuditLog } from '../types/audit';

/**
 * Service interfaces for Milestone 2 Transaction System.
 * Establishes clean architectural boundaries between UI, domain logic, and Firebase data layer.
 */

export interface ITableService {
  getTables(restaurantId: string): Promise<Table[]>;
  getTableById(restaurantId: string, tableId: string): Promise<Table | null>;
  createTable(restaurantId: string, data: TableFormData, createdBy: string): Promise<Table>;
  updateTable(restaurantId: string, tableId: string, data: Partial<TableFormData>, updatedBy: string): Promise<void>;
  deleteTable(restaurantId: string, tableId: string): Promise<void>;
  subscribeToTables(restaurantId: string, onUpdate: (tables: Table[]) => void, onError?: (err: Error) => void): () => void;
}

export interface ITableSessionService {
  getActiveSession(restaurantId: string, tableId: string): Promise<TableSession | null>;
  openSession(restaurantId: string, tableId: string, guestCount: number, openedBy: string, clientRequestId?: string): Promise<TableSession>;
  closeSession(restaurantId: string, sessionId: string, closedBy: string): Promise<void>;
  updateGuestCount(restaurantId: string, sessionId: string, newGuestCount: number, updatedBy: string): Promise<void>;
  subscribeToActiveSessions(restaurantId: string, onUpdate: (sessions: TableSession[]) => void, onError?: (err: Error) => void): () => void;
}

export interface IOrderService {
  getOrderById(restaurantId: string, orderId: string): Promise<Order | null>;
  getOrdersForSession(restaurantId: string, sessionId: string): Promise<Order[]>;
  createOrder(restaurantId: string, order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  updateOrderStatus(restaurantId: string, orderId: string, newStatus: OrderStatus, updatedBy: string): Promise<void>;
  subscribeToOrders(restaurantId: string, onUpdate: (orders: Order[]) => void, onError?: (err: Error) => void): () => void;
}

export interface IPaymentService {
  getPaymentById(restaurantId: string, paymentId: string): Promise<Payment | null>;
  getPaymentsForOrder(restaurantId: string, orderId: string): Promise<Payment[]>;
  recordPayment(restaurantId: string, payment: Omit<Payment, 'id' | 'createdAt'>, idempotencyKey?: string): Promise<Payment>;
  updatePaymentStatus(restaurantId: string, paymentId: string, newStatus: PaymentStatus, updatedBy: string): Promise<void>;
  refundPayment(restaurantId: string, paymentId: string, refundedBy: string, reason?: string): Promise<void>;
  subscribeToPaymentsForOrder(restaurantId: string, orderId: string, onUpdate: (payments: Payment[]) => void, onError?: (err: Error) => void): () => void;
}

export interface IKOTService {
  getKOTById(restaurantId: string, kotId: string): Promise<KOT | null>;
  getKOTsForOrder(restaurantId: string, orderId: string): Promise<KOT[]>;
  getActiveKOTs(restaurantId: string): Promise<KOT[]>;
  createKOT(restaurantId: string, kot: Omit<KOT, 'id' | 'createdAt' | 'updatedAt'>, idempotencyKey?: string): Promise<KOT>;
  updateKOTStatus(restaurantId: string, kotId: string, newStatus: KOTStatus, updatedBy: string, idempotencyKey?: string): Promise<void>;
  cancelKOT(restaurantId: string, kotId: string, reason: string, cancelledBy: string, idempotencyKey?: string): Promise<void>;
  subscribeToKitchenKOTs(restaurantId: string, onUpdate: (kots: KOT[]) => void, onError?: (err: Error) => void): () => void;
  subscribeToKOTs(restaurantId: string, onUpdate: (kots: KOT[]) => void, onError?: (err: Error) => void): () => void;
}

export interface IAuditService {
  logEvent(restaurantId: string, event: Omit<AuditLog, 'id' | 'createdAt' | 'restaurantId'> & { restaurantId?: string }): Promise<void>;
  getRecentLogs(restaurantId: string, limitCount?: number): Promise<AuditLog[]>;
  getPaginatedLogs?(
    restaurantId: string,
    filters: {
      action?: string;
      entityType?: string;
      actorUid?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limitCount?: number,
    lastVisibleDoc?: any
  ): Promise<{ logs: AuditLog[]; lastVisible: any }>;
}

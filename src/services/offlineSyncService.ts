import {
  OfflineQueueItem,
  OfflineOperationStatus,
  SyncStats,
  FailureCategory
} from '../types/offlineQueue';
import { SyncConflictStatus, ConflictResolutionStrategy } from '../types/deviceSession';
import { IdempotencyOperation } from '../types/idempotency';
import { orderService } from './orderService';
import { kotService } from './kotService';
import { paymentService } from './paymentService';
import { tableSessionService } from './tableSessionService';
import { deviceService } from './deviceService';
import { auditService } from './auditService';
import { inventoryService } from './inventoryService';
import { supplierService } from './supplierService';
import { purchaseOrderService } from './purchaseOrderService';
import { recipeService } from './recipeService';
import { stockConsumptionService } from './stockConsumptionService';
import { auth } from '../config/firebase';

const QUEUE_STORAGE_KEY = 'restaurantos_offline_sync_queue';
export const MAX_OFFLINE_QUEUE_CAPACITY = 500;

export class OfflineSyncService {
  private queue: OfflineQueueItem[] = [];
  private isProcessing = false;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private listeners: ((stats: SyncStats, queue: OfflineQueueItem[]) => void)[] = [];

  constructor() {
    this.loadFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.processQueue();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notifyListeners();
      });
    }
    // Automatically trigger processing on startup if online and there are items to sync
    if (
      this.isOnline &&
      this.queue.some(item => item.status === 'queued' || item.status === 'failed')
    ) {
      this.processQueue();
    }
  }

  private loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch (err) {
      console.error('Failed to load offline queue from localStorage:', err);
      this.queue = [];
    }
  }

  private saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      console.error('Failed to save offline queue to localStorage:', err);
    }
  }

  private notifyListeners() {
    const stats = this.getStats();
    for (const listener of this.listeners) {
      try {
        listener(stats, [...this.queue]);
      } catch (err) {
        console.error('Sync listener error:', err);
      }
    }
  }

  public setOnlineStatus(online: boolean, autoProcess = false) {
    this.isOnline = online;
    if (online && autoProcess) {
      this.processQueue();
    } else {
      this.notifyListeners();
    }
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public subscribe(listener: (stats: SyncStats, queue: OfflineQueueItem[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.getStats(), [...this.queue]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public getStats(): SyncStats {
    let queued = 0;
    let syncing = 0;
    let completed = 0;
    let failed = 0;
    let deadLetter = 0;
    let conflict = 0;
    let stale = 0;

    for (const item of this.queue) {
      if (item.status === 'queued') queued++;
      else if (item.status === 'syncing') syncing++;
      else if (item.status === 'completed') completed++;
      else if (item.status === 'failed') failed++;
      else if (item.status === 'dead_letter') deadLetter++;
      else if (item.status === 'conflict') conflict++;
      else if (item.status === 'stale') stale++;
    }

    return {
      total: this.queue.length,
      queued,
      syncing,
      completed,
      failed,
      deadLetter,
      conflict,
      stale
    };
  }

  public getStatsForRestaurant(restaurantId?: string): SyncStats {
    if (!restaurantId) return this.getStats();
    const cleanId = restaurantId.trim();
    const items = this.queue.filter(i => i.restaurantId === cleanId);

    let queued = 0;
    let syncing = 0;
    let completed = 0;
    let failed = 0;
    let deadLetter = 0;
    let conflict = 0;
    let stale = 0;

    for (const item of items) {
      if (item.status === 'queued') queued++;
      else if (item.status === 'syncing') syncing++;
      else if (item.status === 'completed') completed++;
      else if (item.status === 'failed') failed++;
      else if (item.status === 'dead_letter') deadLetter++;
      else if (item.status === 'conflict') conflict++;
      else if (item.status === 'stale') stale++;
    }

    return {
      total: items.length,
      queued,
      syncing,
      completed,
      failed,
      deadLetter,
      conflict,
      stale
    };
  }

  public getSyncStatus(restaurantId?: string): SyncConflictStatus {
    if (!this.isOnline) return 'OFFLINE';
    const stats = this.getStatsForRestaurant(restaurantId);

    if (stats.syncing > 0) return 'SYNCING';
    if (stats.conflict > 0) return 'CONFLICT';
    if (stats.stale > 0) return 'STALE';
    if (stats.failed > 0) return 'RETRYING';
    if (stats.deadLetter > 0) return 'FAILED';
    if (stats.queued > 0) return 'SYNCING';
    return 'SYNCED';
  }

  public getQueue(): OfflineQueueItem[] {
    return [...this.queue];
  }

  public getQueueForRestaurant(restaurantId: string): OfflineQueueItem[] {
    const cleanId = restaurantId?.trim();
    if (!cleanId) return [];
    return this.queue.filter(i => i.restaurantId === cleanId);
  }

  /**
   * Enqueues an operation into the offline queue with a deterministic idempotency key.
   * Enforces bounded queue capacity, device metadata attachment, and digital payment safeguards.
   */
  public enqueue<TPayload = any>(
    restaurantId: string,
    operation: IdempotencyOperation,
    payload: TPayload,
    idempotencyKey?: string,
    maxRetries = 5,
    extraMeta?: {
      targetEntityId?: string;
      expectedVersion?: number;
      expectedUpdatedAt?: number;
    }
  ): OfflineQueueItem<TPayload> {
    const activeItems = this.queue.filter(
      i => i.status !== 'completed' && i.status !== 'dead_letter'
    );
    if (activeItems.length >= MAX_OFFLINE_QUEUE_CAPACITY) {
      throw new Error(
        `Offline queue capacity limit reached (${MAX_OFFLINE_QUEUE_CAPACITY} active items). Please sync or clear completed items before enqueueing new operations.`
      );
    }

    // Safety guard: External digital payments (card, UPI) cannot be falsely marked 'completed' while offline
    if (!this.isOnline && operation === 'record_payment') {
      const p = payload as any;
      const method = p?.method;
      const status = p?.status ?? 'completed';
      if ((method === 'card' || method === 'upi') && status === 'completed') {
        throw new Error(
          `Cannot record external ${method.toUpperCase()} payment as "completed" while offline without online payment gateway authorization.`
        );
      }
    }

    const now = Date.now();
    const cleanRestaurantId = restaurantId.trim();
    const resolvedIdempotencyKey =
      idempotencyKey?.trim() ||
      `idemp_${operation}_${cleanRestaurantId}_${now}_${Math.random().toString(36).substring(2, 8)}`;

    const deviceId = deviceService.getOrCreateDeviceId();

    const queueItem: OfflineQueueItem<TPayload> = {
      id: `op_local_${now}_${Math.random().toString(36).substring(2, 6)}`,
      restaurantId: cleanRestaurantId,
      operation,
      idempotencyKey: resolvedIdempotencyKey,
      payload,
      status: 'queued',
      retryCount: 0,
      maxRetries,
      lastError: null,
      deviceId,
      targetEntityId: extraMeta?.targetEntityId,
      expectedVersion: extraMeta?.expectedVersion,
      expectedUpdatedAt: extraMeta?.expectedUpdatedAt,
      createdAt: now,
      updatedAt: now
    };

    this.queue.push(queueItem);
    this.saveToStorage();
    this.notifyListeners();

    // Trigger processing if online
    if (this.isOnline) {
      this.processQueue(cleanRestaurantId);
    }

    return queueItem;
  }

  /**
   * Dispatches queued operations in strict chronological order with idempotency protection,
   * restaurant isolation, bounded exponential backoff, and server-authoritative conflict resolution.
   */
  public async processQueue(targetRestaurantId?: string): Promise<void> {
    if (this.isProcessing || !this.isOnline) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      const cleanTargetRestId = targetRestaurantId?.trim();

      for (const item of this.queue) {
        // Multi-tenant switching isolation: Skip items from other restaurants when target specified
        if (cleanTargetRestId && item.restaurantId !== cleanTargetRestId) {
          continue;
        }

        if (item.status !== 'queued' && item.status !== 'failed') {
          continue;
        }

        // Bounded exponential backoff check for failed items
        if (item.status === 'failed' && item.nextRetryAt && item.nextRetryAt > now) {
          continue;
        }

        item.status = 'syncing';
        item.updatedAt = Date.now();
        this.saveToStorage();
        this.notifyListeners();

        try {
          let result: any = null;

          switch (item.operation) {
            case 'create_order': {
              result = await orderService.createOrderFromCart({
                ...item.payload,
                restaurantId: item.restaurantId,
                clientRequestId: item.idempotencyKey
              });
              break;
            }
            case 'create_kot': {
              result = await kotService.createKOTFromOrder({
                ...item.payload,
                restaurantId: item.restaurantId,
                clientRequestId: item.idempotencyKey
              });
              break;
            }
            case 'record_payment': {
              result = await paymentService.recordPayment(
                item.restaurantId,
                item.payload,
                item.idempotencyKey
              );
              break;
            }
            case 'open_session': {
              result = await tableSessionService.openSession(
                item.restaurantId,
                item.payload.tableId,
                item.payload.guestCount,
                item.payload.openedBy,
                item.idempotencyKey
              );
              break;
            }
            case 'close_session': {
              try {
                result = await tableSessionService.closeSession(
                  item.restaurantId,
                  item.payload.sessionId,
                  item.payload.closedBy
                );
              } catch (err: any) {
                if (
                  err?.message &&
                  (err.message.includes('already closed') ||
                    err.message.includes('is closed') ||
                    err.message.includes('already has been closed'))
                ) {
                  result = { idempotentSuccess: true };
                } else {
                  throw err;
                }
              }
              break;
            }
            case 'update_guest_count': {
              result = await tableSessionService.updateGuestCount(
                item.restaurantId,
                item.payload.sessionId,
                item.payload.newGuestCount,
                item.payload.updatedBy
              );
              break;
            }
            case 'update_kot_status': {
              result = await kotService.updateKOTStatus(
                item.restaurantId,
                item.payload.kotId,
                item.payload.newStatus,
                item.payload.updatedBy,
                item.idempotencyKey
              );
              break;
            }
            case 'cancel_kot': {
              result = await kotService.cancelKOT(
                item.restaurantId,
                item.payload.kotId,
                item.payload.reason,
                item.payload.cancelledBy,
                item.idempotencyKey
              );
              break;
            }
            case 'update_order_status': {
              result = await orderService.updateOrderStatus(
                item.restaurantId,
                item.payload.orderId,
                item.payload.newStatus,
                item.payload.updatedBy,
                item.payload.cancellationReason
              );
              break;
            }
            case 'create_inventory_item': {
              result = await inventoryService.createInventoryItem(
                item.restaurantId,
                item.payload,
                item.idempotencyKey
              );
              break;
            }
            case 'record_stock_movement': {
              result = await inventoryService.recordStockMovement(
                item.restaurantId,
                {
                  ...item.payload,
                  clientRequestId: item.idempotencyKey
                }
              );
              break;
            }
            case 'create_supplier': {
              result = await supplierService.createSupplier(
                item.restaurantId,
                item.payload,
                item.idempotencyKey
              );
              break;
            }
            case 'create_purchase_order': {
              result = await purchaseOrderService.createPurchaseOrder(
                item.restaurantId,
                item.payload,
                item.idempotencyKey
              );
              break;
            }
            case 'submit_purchase_order': {
              result = await purchaseOrderService.submitPurchaseOrder(
                item.restaurantId,
                item.payload.purchaseOrderId,
                item.idempotencyKey
              );
              break;
            }
            case 'receive_purchase_order': {
              result = await purchaseOrderService.receiveGoods(
                item.restaurantId,
                item.payload,
                item.idempotencyKey
              );
              break;
            }
            case 'cancel_purchase_order': {
              result = await purchaseOrderService.cancelPurchaseOrder(
                item.restaurantId,
                item.payload.purchaseOrderId,
                item.payload.reason,
                item.idempotencyKey
              );
              break;
            }
            case 'create_recipe': {
              result = await recipeService.createRecipe(
                item.restaurantId,
                item.payload,
                item.idempotencyKey
              );
              break;
            }
            case 'update_recipe': {
              result = await recipeService.updateRecipe(
                item.restaurantId,
                item.payload.recipeId,
                item.payload,
                item.idempotencyKey
              );
              break;
            }
            case 'activate_recipe': {
              await recipeService.activateRecipe(
                item.restaurantId,
                item.payload.recipeId
              );
              result = { activated: true };
              break;
            }
            case 'archive_recipe': {
              await recipeService.archiveRecipe(
                item.restaurantId,
                item.payload.recipeId
              );
              result = { archived: true };
              break;
            }
            case 'consume_stock': {
              result = await stockConsumptionService.consumeStockForOrder(
                item.restaurantId,
                {
                  ...item.payload,
                  clientRequestId: item.idempotencyKey
                }
              );
              break;
            }
            case 'reverse_consumption': {
              result = await stockConsumptionService.reverseOrderStockConsumption(
                item.restaurantId,
                item.payload.orderId,
                item.payload.reason,
                item.idempotencyKey
              );
              break;
            }
            default:
              throw new Error(`Unsupported offline operation: ${item.operation}`);
          }

          item.status = 'completed';
          item.resultSnapshot = result;
          item.lastError = null;
          item.conflictReason = null;
          item.failureCategory = undefined;
          item.updatedAt = Date.now();
          console.info(
            `[OfflineSync Diagnostic] Operation Succeeded: operation=${item.operation}, requestId=${item.idempotencyKey}, retryCount=${item.retryCount}, status=completed`
          );
          this.saveToStorage();
          this.notifyListeners();
        } catch (err: any) {
          const errMsg = err?.message || 'Sync failed';
          item.retryCount += 1;
          item.lastError = errMsg;
          item.updatedAt = Date.now();

          // Conflict & Concurrency Analysis:
          const isConcurrencyCollision =
            errMsg.includes('already has an active open session') ||
            errMsg.includes('Table already occupied') ||
            errMsg.includes('already closed') ||
            errMsg.includes('Cannot reopen');

          const isStaleConflict =
            errMsg.includes('Illegal status transition') ||
            errMsg.includes('stale state') ||
            errMsg.includes('Cannot transition order status') ||
            errMsg.includes('Illegal KOT status transition') ||
            errMsg.includes('Illegal payment status transition') ||
            errMsg.includes('Cannot receive goods on purchase order with status') ||
            errMsg.includes('Cannot submit purchase order with status') ||
            errMsg.includes('Cannot cancel purchase order with status');

          const isFatalValidation =
            errMsg.includes('validation') ||
            errMsg.includes('Overpayment rejected') ||
            errMsg.includes('Cross-tenant') ||
            errMsg.includes('does not exist') ||
            errMsg.includes('Over-receiving rejected') ||
            errMsg.includes('exceeds remaining quantity') ||
            errMsg.includes('Incompatible units');

          let failureCategory: FailureCategory = 'transient_failure';

          if (isConcurrencyCollision) {
            failureCategory = 'concurrency_collision';
            item.status = 'conflict';
            item.conflictReason = errMsg;
            item.nextRetryAt = undefined;

            auditService.logEvent(item.restaurantId, {
              restaurantId: item.restaurantId,
              entityType: 'order',
              entityId: item.targetEntityId || item.idempotencyKey,
              action: 'offline_conflict_detected',
              actorUid: auth.currentUser?.uid || 'offline_sync',
              metadata: {
                operation: item.operation,
                idempotencyKey: item.idempotencyKey,
                conflictType: 'concurrency_collision',
                error: errMsg
              }
            }).catch(() => {});
          } else if (isStaleConflict) {
            failureCategory = 'conflict_stale';
            item.status = 'stale';
            item.conflictReason = errMsg;
            item.nextRetryAt = undefined;

            auditService.logEvent(item.restaurantId, {
              restaurantId: item.restaurantId,
              entityType: 'order',
              entityId: item.targetEntityId || item.idempotencyKey,
              action: 'offline_conflict_detected',
              actorUid: auth.currentUser?.uid || 'offline_sync',
              metadata: {
                operation: item.operation,
                idempotencyKey: item.idempotencyKey,
                conflictType: 'stale_state',
                error: errMsg
              }
            }).catch(() => {});
          } else if (isFatalValidation) {
            failureCategory = 'fatal_validation';
            item.status = 'dead_letter';
            item.nextRetryAt = undefined;
          } else if (item.retryCount >= item.maxRetries) {
            failureCategory = 'max_retries_exceeded';
            item.status = 'dead_letter';
            item.nextRetryAt = undefined;
          } else {
            item.status = 'failed';
            // Exponential backoff: 1s, 2s, 4s, 8s... capped at 60s
            const delayMs = Math.min(60000, 1000 * Math.pow(2, item.retryCount - 1));
            item.nextRetryAt = Date.now() + delayMs;
          }

          item.failureCategory = failureCategory;
          console.warn(
            `[OfflineSync Diagnostic] Operation Failed: operation=${item.operation}, requestId=${item.idempotencyKey}, retryCount=${item.retryCount}, failureCategory=${failureCategory}, finalState=${item.status}, error=${errMsg}`
          );

          this.saveToStorage();
          this.notifyListeners();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Resolves an item marked 'conflict' or 'stale' using explicit resolution strategies.
   */
  public async resolveConflict(
    itemId: string,
    resolution: ConflictResolutionStrategy
  ): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return;

    if (resolution === 'server_wins' || resolution === 'discard') {
      // Discard client change and accept server authoritative truth
      item.status = 'completed';
      item.conflictReason = `Resolved via ${resolution} (Server-Authoritative wins)`;
      item.updatedAt = Date.now();
    } else if (resolution === 'retry_with_refresh') {
      item.status = 'queued';
      item.retryCount = 0;
      item.lastError = null;
      item.conflictReason = null;
      item.nextRetryAt = undefined;
      item.updatedAt = Date.now();
    }

    this.saveToStorage();
    this.notifyListeners();

    if (this.isOnline && item.status === 'queued') {
      await this.processQueue(item.restaurantId);
    }
  }

  /**
   * Clears all items from queue (useful for testing or cache reset).
   */
  public clearAll(): void {
    this.queue = [];
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Clears only items belonging to a specific restaurant (for tenant switching isolation).
   */
  public clearRestaurantQueue(restaurantId: string): void {
    const cleanId = restaurantId.trim();
    this.queue = this.queue.filter(item => item.restaurantId !== cleanId);
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Clears completed items from queue.
   */
  public clearCompleted(): void {
    this.queue = this.queue.filter(item => item.status !== 'completed');
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Retries a specific dead-letter, conflict, stale, or failed item.
   */
  public async retryItem(itemId: string): Promise<void> {
    const item = this.queue.find(i => i.id === itemId);
    if (
      item &&
      (item.status === 'dead_letter' ||
        item.status === 'failed' ||
        item.status === 'conflict' ||
        item.status === 'stale')
    ) {
      item.status = 'queued';
      item.retryCount = 0;
      item.lastError = null;
      item.conflictReason = null;
      item.nextRetryAt = undefined;
      item.updatedAt = Date.now();
      this.saveToStorage();
      this.notifyListeners();
      if (this.isOnline) {
        await this.processQueue(item.restaurantId);
      }
    }
  }

}

export const offlineSyncService = new OfflineSyncService();

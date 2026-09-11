import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineSyncService } from '../services/offlineSyncService';
import { orderService } from '../services/orderService';
import { kotService } from '../services/kotService';
import { paymentService } from '../services/paymentService';

describe('Phase 2G: Offline Queue & Sync Service', () => {
  let syncService: OfflineSyncService;

  beforeEach(() => {
    // Clear localStorage simulation
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    syncService = new OfflineSyncService();
    vi.clearAllMocks();
  });

  it('enqueues an operation with unique ID and stable idempotency key', () => {
    // Spy to prevent immediate async side effects during basic enqueue test
    vi.spyOn(syncService, 'processQueue').mockImplementation(async () => {});

    const item = syncService.enqueue('rest_1', 'create_order', {
      items: [{ itemId: 'item_1', nameSnapshot: 'Burger', quantity: 1 }]
    });

    expect(item.id).toBeDefined();
    expect(item.restaurantId).toBe('rest_1');
    expect(item.operation).toBe('create_order');
    expect(item.status).toBe('queued');
    expect(item.idempotencyKey).toBeDefined();

    const stats = syncService.getStats();
    expect(stats.total).toBe(1);
    expect(stats.queued).toBe(1);
  });

  it('processes queued order operations and marks them completed upon success', async () => {
    const mockOrder = {
      id: 'ord_123',
      restaurantId: 'rest_1',
      orderNumber: 'ORD-123',
      items: [],
      grandTotalMinor: 50000,
      paidAmountMinor: 0,
      dueAmountMinor: 50000
    };

    const spyCreateOrder = vi
      .spyOn(orderService, 'createOrderFromCart')
      .mockResolvedValue(mockOrder as any);

    syncService.enqueue('rest_1', 'create_order', {
      cartState: { items: [], taxJurisdiction: 'intraState' },
      orderType: 'takeaway',
      source: 'pos'
    });

    await syncService.processQueue();

    const stats = syncService.getStats();
    expect(stats.completed).toBe(1);
    expect(stats.queued).toBe(0);
    expect(spyCreateOrder).toHaveBeenCalledTimes(1);

    const queue = syncService.getQueue();
    expect(queue[0].status).toBe('completed');
    expect(queue[0].resultSnapshot).toEqual(mockOrder);
  });

  it('routes deterministic validation failures directly to dead_letter to prevent queue blockage', async () => {
    vi.spyOn(paymentService, 'recordPayment').mockRejectedValue(
      new Error('Overpayment rejected: Order grand total is ₹50.00, attempted payment would exceed')
    );

    syncService.enqueue('rest_1', 'record_payment', {
      orderId: 'ord_1',
      amountMinor: 999999,
      method: 'cash'
    });

    await syncService.processQueue();

    const stats = syncService.getStats();
    expect(stats.deadLetter).toBe(1);
    expect(stats.failed).toBe(0);

    const queue = syncService.getQueue();
    expect(queue[0].status).toBe('dead_letter');
    expect(queue[0].lastError).toContain('Overpayment rejected');
  });

  it('increments retry count on transient network errors and retries until maxRetries', async () => {
    vi.spyOn(kotService, 'createKOTFromOrder').mockRejectedValue(
      new Error('Firestore network connection timeout')
    );

    syncService.enqueue(
      'rest_1',
      'create_kot',
      { orderId: 'ord_1' },
      'idemp_test_1',
      2 // maxRetries = 2
    );

    // Attempt 1
    await syncService.processQueue();
    let queue = syncService.getQueue();
    expect(queue[0].status).toBe('failed');
    expect(queue[0].retryCount).toBe(1);

    // Reset status to queued for next tick attempt simulation
    queue[0].status = 'queued';

    // Attempt 2 (reaches maxRetries)
    await syncService.processQueue();
    queue = syncService.getQueue();
    expect(queue[0].status).toBe('dead_letter');
    expect(queue[0].retryCount).toBe(2);
  });
});

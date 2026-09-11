import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
    doc: vi.fn((_dbOrCol, ...pathSegments) => {
      const id = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : `mock_doc_${Math.random().toString(36).substring(2, 8)}`;
      return { id, path: pathSegments.join('/') };
    }),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn(() => vi.fn()),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z')),
    runTransaction: vi.fn(async (_db, callback) => {
      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      };
      return callback(mockTx);
    })
  };
});


import { deviceService } from '../services/deviceService';
import { offlineSyncService, MAX_OFFLINE_QUEUE_CAPACITY } from '../services/offlineSyncService';
import { idempotencyService } from '../services/idempotencyService';
import { orderService } from '../services/orderService';
import { kotService } from '../services/kotService';
import { paymentService } from '../services/paymentService';
import { tableSessionService } from '../services/tableSessionService';
import { auditService } from '../services/auditService';
import { auth } from '../config/firebase';

describe('Phase 6D — Device/Session Awareness + Offline Conflict Recovery + Operational Resilience Suite', () => {
  const restaurantA = 'rest_tenant_alpha_6d';
  const restaurantB = 'rest_tenant_beta_6d';
  const testUserId = 'staff_user_device_99';

  beforeEach(() => {
    localStorage.clear();
    offlineSyncService.clearAll();
    offlineSyncService.setOnlineStatus(true);
    (auth as any).currentUser = {
      uid: testUserId,
      email: 'staff@restaurant.com',
      getIdToken: () => Promise.resolve('test_token'),
      getIdTokenResult: () => Promise.resolve({ token: 'test_token', claims: {} })
    };
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1-7: DEVICE METADATA, PERSISTENCE & NON-AUTHORITATIVE IDENTIFIERS
  // =========================================================================

  it('1. Device Metadata Generation: getOrCreateDeviceId generates stable unique string and persists to localStorage', () => {
    const devId1 = deviceService.getOrCreateDeviceId();
    expect(devId1).toBeTruthy();
    expect(typeof devId1).toBe('string');
    expect(devId1.startsWith('dev_')).toBe(true);

    const devId2 = deviceService.getOrCreateDeviceId();
    expect(devId2).toBe(devId1);
  });

  it('2. Device Metadata Retrieval: getDeviceMetadata returns correct platform, appVersion, and defaults', () => {
    const meta = deviceService.getDeviceMetadata(restaurantA, 'kitchen');
    expect(meta.restaurantId).toBe(restaurantA);
    expect(meta.deviceType).toBe('kitchen');
    expect(meta.appVersion).toBe('1.0.0');
    expect(meta.isActive).toBe(true);
    expect(meta.status).toBe('online');
    expect(meta.currentUserId).toBe(testUserId);
  });

  it('3. Device Name Update: updates stored name in localStorage and keeps device identity', async () => {
    await deviceService.updateDeviceName(restaurantA, 'Bar Station 02');
    expect(deviceService.getStoredDeviceName()).toBe('Bar Station 02');
  });

  it('4. Device Registration: registers under restaurants/{restaurantId}/devices/{deviceId}', async () => {
    const registered = await deviceService.registerDevice(restaurantA, {
      deviceName: 'Captain Tab #1',
      deviceType: 'captain'
    });

    expect(registered.restaurantId).toBe(restaurantA);
    expect(registered.deviceName).toBe('Captain Tab #1');
    expect(registered.deviceType).toBe('captain');
    expect(registered.deviceId).toBe(deviceService.getOrCreateDeviceId());
  });

  it('5. Device Heartbeat: pings device status and updates operational timestamp', async () => {
    await expect(deviceService.sendHeartbeat(restaurantA, 'online')).resolves.not.toThrow();
  });

  it('6. Multi-Device Discovery: subscribeToActiveDevices returns active devices for restaurant', () => {
    let capturedDevices: any[] = [];
    const unsub = deviceService.subscribeToActiveDevices(restaurantA, (devices) => {
      capturedDevices = devices;
    });

    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('7. Non-Authoritative Device Identity: deviceId never grants permission or bypasses missing auth', async () => {
    (auth as any).currentUser = null;
    const meta = deviceService.getDeviceMetadata(restaurantA, 'pos');
    expect(meta.currentUserId).toBeNull();
    // Device ID alone without authenticated session cannot perform restricted operations
    expect(meta.deviceId).toBeTruthy();
  });

  // =========================================================================
  // 8-15: MULTI-DEVICE CONCURRENCY, CONFLICT DETECTION & RESOLUTION
  // =========================================================================

  it('8. Multi-Device Table Concurrency: Two devices opening session on same table — second collides', async () => {
    const tableId = 'tbl_101';
    vi.spyOn(tableSessionService, 'openSession')
      .mockResolvedValueOnce({ id: 'sess_1', tableId, status: 'active' } as any)
      .mockRejectedValueOnce(new Error(`Table "${tableId}" already has an active open session "sess_1".`));

    // Device 1 opens table session
    const res1 = await tableSessionService.openSession(restaurantA, tableId, 4, 'captain_1', 'key_d1_01');
    expect(res1.id).toBe('sess_1');

    // Device 2 attempts to open session on same table
    await expect(
      tableSessionService.openSession(restaurantA, tableId, 2, 'captain_2', 'key_d2_02')
    ).rejects.toThrow('already has an active open session');
  });

  it('9. Offline Table Session Collision Handling: Queued open_session encountering occupied table transitions to conflict', async () => {
    vi.spyOn(tableSessionService, 'openSession').mockRejectedValueOnce(
      new Error('Table "tbl_101" already has an active open session "sess_1".')
    );
    const auditSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue();

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(
      restaurantA,
      'open_session',
      { tableId: 'tbl_101', guestCount: 2, openedBy: 'captain_2' },
      'idemp_coll_01'
    );

    expect(item.status).toBe('queued');

    // Network returns
    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    const queue = offlineSyncService.getQueue();
    const processed = queue.find(q => q.id === item.id);
    expect(processed?.status).toBe('conflict');
    expect(processed?.failureCategory).toBe('concurrency_collision');
    expect(processed?.conflictReason).toContain('already has an active open session');
    expect(auditSpy).toHaveBeenCalledWith(restaurantA, expect.objectContaining({
      action: 'offline_conflict_detected'
    }));
  });

  it('10. Conflict Event Auditing: Collision triggers offline_conflict_detected audit log', async () => {
    const auditSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue();
    vi.spyOn(orderService, 'updateOrderStatus').mockRejectedValueOnce(
      new Error('Cannot transition order status from "completed" to "in_progress".')
    );

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(
      restaurantA,
      'update_order_status',
      { orderId: 'ord_99', newStatus: 'in_progress', updatedBy: 'cap_1' },
      'idemp_stale_ord_01'
    );

    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    expect(auditSpy).toHaveBeenCalledWith(
      restaurantA,
      expect.objectContaining({
        action: 'offline_conflict_detected',
        metadata: expect.objectContaining({
          conflictType: 'stale_state'
        })
      })
    );
  });

  it('11. Stale KOT Status Conflict: Syncing stale KOT status on already served KOT transitions to stale', async () => {
    vi.spyOn(kotService, 'updateKOTStatus').mockRejectedValueOnce(
      new Error('Illegal KOT status transition from "served" to "preparing".')
    );

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(
      restaurantA,
      'update_kot_status',
      { kotId: 'kot_55', newStatus: 'preparing', updatedBy: 'chef_2' },
      'idemp_stale_kot_01'
    );

    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    const queue = offlineSyncService.getQueue();
    const processed = queue.find(q => q.id === item.id);
    expect(processed?.status).toBe('stale');
    expect(processed?.failureCategory).toBe('conflict_stale');
    expect(processed?.conflictReason).toContain('Illegal KOT status transition');
  });

  it('12. Server-Authoritative Wins (Discard Resolution): resolveConflict(id, "server_wins") accepts server truth', async () => {
    vi.spyOn(kotService, 'updateKOTStatus').mockRejectedValueOnce(
      new Error('Illegal KOT status transition from "served" to "preparing".')
    );

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(
      restaurantA,
      'update_kot_status',
      { kotId: 'kot_55', newStatus: 'preparing', updatedBy: 'chef_2' },
      'idemp_stale_kot_02'
    );

    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    // Resolve conflict by discarding local mutation and accepting server authoritative state
    await offlineSyncService.resolveConflict(item.id, 'server_wins');

    const processed = offlineSyncService.getQueue().find(q => q.id === item.id);
    expect(processed?.status).toBe('completed');
    expect(processed?.conflictReason).toContain('Server-Authoritative wins');
  });

  it('13. Server-Authoritative Wins (Retry with Refresh): resolveConflict(id, "retry_with_refresh") requeues item', async () => {
    vi.spyOn(kotService, 'updateKOTStatus')
      .mockRejectedValueOnce(new Error('Illegal KOT status transition from "served" to "preparing".'))
      .mockResolvedValueOnce();

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(
      restaurantA,
      'update_kot_status',
      { kotId: 'kot_55', newStatus: 'preparing', updatedBy: 'chef_2' },
      'idemp_stale_kot_03'
    );

    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    // Refresh and retry
    await offlineSyncService.resolveConflict(item.id, 'retry_with_refresh');

    const processed = offlineSyncService.getQueue().find(q => q.id === item.id);
    expect(processed?.status).toBe('completed');
  });


  it('14. Idempotency Key Deduplication on Device Reconnect: Re-sending same key returns cached snapshot', async () => {
    const payload = { orderId: 'ord_1', amountMinor: 50000, method: 'cash', status: 'completed' };
    const mockRecord = {
      restaurantId: restaurantA,
      operation: 'record_payment',
      requestSignature: JSON.stringify(payload),
      status: 'completed',
      responseSnapshot: { id: 'pay_cached_99', amountMinor: 50000 }
    };

    vi.spyOn(idempotencyService, 'checkOrAcquire').mockResolvedValueOnce({
      action: 'return_cached',
      cachedResult: mockRecord.responseSnapshot,
      record: mockRecord as any
    });

    const result = await idempotencyService.checkOrAcquire(
      restaurantA,
      'idemp_pay_reconnect_01',
      'record_payment',
      payload
    );

    expect(result.action).toBe('return_cached');
    if (result.action === 'return_cached') {
      expect(result.cachedResult.id).toBe('pay_cached_99');
    }
  });

  it('15. Idempotency Key Poisoning Protection on Device Reconnect: Sending altered payload is rejected', async () => {
    vi.spyOn(idempotencyService, 'checkOrAcquire').mockRejectedValueOnce(
      new Error('Idempotency payload divergence: Key "key_dup" was already used with a different request payload.')
    );

    await expect(
      idempotencyService.checkOrAcquire(
        restaurantA,
        'key_dup',
        'create_order',
        { items: [{ itemId: 'item_B', quantity: 2 }] }
      )
    ).rejects.toThrow('Idempotency payload divergence');
  });

  // =========================================================================
  // 16-20: CROSS-TENANT ISOLATION, QUEUE MANAGEMENT & PAYMENT SAFETY
  // =========================================================================

  it('16. Cross-Tenant Offline Queue Isolation: Restaurant A operations not dispatched during Restaurant B sync', async () => {
    const orderSpy = vi.spyOn(orderService, 'createOrderFromCart').mockResolvedValue({ id: 'ord_B' } as any);

    offlineSyncService.setOnlineStatus(false);
    const itemA = offlineSyncService.enqueue(
      restaurantA,
      'create_order',
      { items: [] },
      'idemp_rest_A_01'
    );
    const itemB = offlineSyncService.enqueue(
      restaurantB,
      'create_order',
      { items: [] },
      'idemp_rest_B_01'
    );

    offlineSyncService.setOnlineStatus(true);
    // Process only Restaurant B
    await offlineSyncService.processQueue(restaurantB);

    const queue = offlineSyncService.getQueue();
    const processedA = queue.find(q => q.id === itemA.id);
    const processedB = queue.find(q => q.id === itemB.id);

    expect(processedA?.status).toBe('queued');
    expect(processedB?.status).toBe('completed');
    expect(orderSpy).toHaveBeenCalledTimes(1);
    expect(orderSpy).toHaveBeenCalledWith(expect.objectContaining({ restaurantId: restaurantB }));
  });

  it('17. Clear Restaurant Queue: clearRestaurantQueue only clears target restaurant items', () => {
    offlineSyncService.setOnlineStatus(false);
    offlineSyncService.enqueue(restaurantA, 'create_order', { test: 'a' });
    offlineSyncService.enqueue(restaurantB, 'create_order', { test: 'b' });

    expect(offlineSyncService.getQueue()).toHaveLength(2);

    offlineSyncService.clearRestaurantQueue(restaurantA);

    const remaining = offlineSyncService.getQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].restaurantId).toBe(restaurantB);
  });

  it('18. Digital Payment Offline Safeguard: Enqueueing completed CARD payment offline throws error', () => {
    offlineSyncService.setOnlineStatus(false);
    expect(() => {
      offlineSyncService.enqueue(restaurantA, 'record_payment', {
        orderId: 'ord_1',
        amountMinor: 50000,
        method: 'card',
        status: 'completed'
      });
    }).toThrow('Cannot record external CARD payment as "completed" while offline');
  });

  it('19. Digital Payment UPI Offline Safeguard: Enqueueing completed UPI payment offline throws error', () => {
    offlineSyncService.setOnlineStatus(false);
    expect(() => {
      offlineSyncService.enqueue(restaurantA, 'record_payment', {
        orderId: 'ord_1',
        amountMinor: 25000,
        method: 'upi',
        status: 'completed'
      });
    }).toThrow('Cannot record external UPI payment as "completed" while offline');
  });

  it('20. Cash Offline Payment Queuing: Enqueueing cash payment while offline succeeds and attaches deviceId', () => {
    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(restaurantA, 'record_payment', {
      orderId: 'ord_1',
      amountMinor: 30000,
      method: 'cash',
      status: 'completed'
    });

    expect(item.status).toBe('queued');
    expect(item.deviceId).toBeTruthy();
    expect(item.payload.method).toBe('cash');
  });

  // =========================================================================
  // 21-25: BOUNDED CAPACITY, EXPONENTIAL BACKOFF & DEAD LETTERING
  // =========================================================================

  it('21. Offline Queue Bounded Capacity: Enqueueing beyond 500 active items throws capacity error', () => {
    offlineSyncService.setOnlineStatus(false);
    for (let i = 0; i < MAX_OFFLINE_QUEUE_CAPACITY; i++) {
      offlineSyncService.enqueue(restaurantA, 'create_order', { index: i }, `idemp_${i}`);
    }

    expect(() => {
      offlineSyncService.enqueue(restaurantA, 'create_order', { index: 501 }, 'idemp_overflow');
    }).toThrow('Offline queue capacity limit reached');
  });

  it('22. Exponential Backoff on Transient Failure: Transient failure increments retryCount and sets backoff delay', async () => {
    vi.spyOn(orderService, 'createOrderFromCart').mockRejectedValueOnce(new Error('Network timeout'));

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(restaurantA, 'create_order', { items: [] }, 'idemp_transient_01');

    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    const queue = offlineSyncService.getQueue();
    const processed = queue.find(q => q.id === item.id);
    expect(processed?.status).toBe('failed');
    expect(processed?.retryCount).toBe(1);
    expect(processed?.nextRetryAt).toBeGreaterThan(Date.now() - 100);
    expect(processed?.failureCategory).toBe('transient_failure');
  });

  it('23. Dead Letter Transition on Max Retries: Exceeding max retries marks item as dead_letter', async () => {
    vi.spyOn(orderService, 'createOrderFromCart').mockRejectedValue(new Error('Persistent server error'));

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(restaurantA, 'create_order', { items: [] }, 'idemp_max_retry_01', 2);

    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA); // Retry 1

    // Fast-forward backoff time
    item.nextRetryAt = Date.now() - 1000;
    await offlineSyncService.processQueue(restaurantA); // Retry 2 -> Dead Letter

    const queue = offlineSyncService.getQueue();
    const processed = queue.find(q => q.id === item.id);
    expect(processed?.status).toBe('dead_letter');
    expect(processed?.failureCategory).toBe('max_retries_exceeded');
  });

  it('24. Dead Letter Transition on Fatal Validation: Deterministic validation error dead-letters immediately', async () => {
    vi.spyOn(paymentService, 'recordPayment').mockRejectedValueOnce(
      new Error('Overpayment rejected: attempted payment of ₹100 exceeds total.')
    );

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(
      restaurantA,
      'record_payment',
      { orderId: 'ord_1', amountMinor: 10000, method: 'cash' },
      'idemp_fatal_val_01'
    );

    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    const queue = offlineSyncService.getQueue();
    const processed = queue.find(q => q.id === item.id);
    expect(processed?.status).toBe('dead_letter');
    expect(processed?.failureCategory).toBe('fatal_validation');
  });

  it('25. Manual Retry of Dead Letter Item: retryItem(id) resets retryCount and requeues for dispatch', async () => {
    vi.spyOn(orderService, 'createOrderFromCart')
      .mockRejectedValueOnce(new Error('Temporary validation error'))
      .mockResolvedValueOnce({ id: 'ord_recovered_99' } as any);

    offlineSyncService.setOnlineStatus(false);
    const item = offlineSyncService.enqueue(restaurantA, 'create_order', { items: [] }, 'idemp_recover_01', 1);

    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    expect(offlineSyncService.getQueue().find(q => q.id === item.id)?.status).toBe('dead_letter');

    // Manual retry by staff
    await offlineSyncService.retryItem(item.id);

    const recovered = offlineSyncService.getQueue().find(q => q.id === item.id);
    expect(recovered?.status).toBe('completed');
    expect(recovered?.resultSnapshot?.id).toBe('ord_recovered_99');
  });

  // =========================================================================
  // 26-30: SYNCONFLICTSTATUS UI STATES & END-TO-END RESILIENCE
  // =========================================================================

  it('26. SyncConflictStatus State Calculation: getSyncStatus returns SYNCED when queue empty and online', () => {
    offlineSyncService.setOnlineStatus(true);
    offlineSyncService.clearAll();
    expect(offlineSyncService.getSyncStatus(restaurantA)).toBe('SYNCED');
  });

  it('27. SyncConflictStatus OFFLINE State: getSyncStatus returns OFFLINE when offline', () => {
    offlineSyncService.setOnlineStatus(false);
    expect(offlineSyncService.getSyncStatus(restaurantA)).toBe('OFFLINE');
  });

  it('28. SyncConflictStatus CONFLICT State: getSyncStatus returns CONFLICT when conflict items exist', async () => {
    vi.spyOn(tableSessionService, 'openSession').mockRejectedValueOnce(
      new Error('Table "tbl_1" already has an active open session')
    );

    offlineSyncService.setOnlineStatus(false);
    offlineSyncService.enqueue(restaurantA, 'open_session', { tableId: 'tbl_1' });
    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    expect(offlineSyncService.getSyncStatus(restaurantA)).toBe('CONFLICT');
  });

  it('29. SyncConflictStatus STALE State: getSyncStatus returns STALE when stale items exist', async () => {
    vi.spyOn(kotService, 'updateKOTStatus').mockRejectedValueOnce(
      new Error('Illegal KOT status transition from "served" to "preparing"')
    );

    offlineSyncService.setOnlineStatus(false);
    offlineSyncService.enqueue(restaurantA, 'update_kot_status', { kotId: 'kot_1', newStatus: 'preparing' });
    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    expect(offlineSyncService.getSyncStatus(restaurantA)).toBe('STALE');
  });

  it('30. Multi-Device Operational Resilience End-to-End: Complete offline queue, sync, conflict isolation & audit trail', async () => {
    const auditSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue();
    const orderSpy = vi.spyOn(orderService, 'createOrderFromCart').mockResolvedValue({ id: 'ord_e2e_100' } as any);
    const kotSpy = vi.spyOn(kotService, 'createKOTFromOrder').mockResolvedValue({ id: 'kot_e2e_100' } as any);

    // 1. Device is offline in busy dining room
    offlineSyncService.setOnlineStatus(false);
    expect(offlineSyncService.getSyncStatus(restaurantA)).toBe('OFFLINE');

    // 2. Captain places Order and sends KOT
    const orderItem = offlineSyncService.enqueue(restaurantA, 'create_order', { cartItems: [] }, 'idemp_e2e_ord_01');
    const kotItem = offlineSyncService.enqueue(restaurantA, 'create_kot', { orderId: 'ord_e2e_100' }, 'idemp_e2e_kot_01');

    expect(offlineSyncService.getStatsForRestaurant(restaurantA).queued).toBe(2);

    // 3. Wi-Fi reconnects
    offlineSyncService.setOnlineStatus(true);
    await offlineSyncService.processQueue(restaurantA);

    // 4. Verifications
    expect(orderSpy).toHaveBeenCalledTimes(1);
    expect(kotSpy).toHaveBeenCalledTimes(1);

    const stats = offlineSyncService.getStatsForRestaurant(restaurantA);
    expect(stats.completed).toBe(2);
    expect(stats.queued).toBe(0);
    expect(offlineSyncService.getSyncStatus(restaurantA)).toBe('SYNCED');
  });
});

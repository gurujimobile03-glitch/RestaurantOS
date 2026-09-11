import React, { useState, useEffect, useMemo } from 'react';
import { useRestaurant } from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';
import { kotService } from '../services/kotService';
import { tableService } from '../services/tableService';
import { orderService } from '../services/orderService';
import { offlineSyncService } from '../services/offlineSyncService';
import { KOT, KOTStatus } from '../types/kot';
import { Table } from '../types/table';
import { Order } from '../types/order';
import { OfflineQueueItem } from '../types/offlineQueue';

import { KitchenHeader, KitchenFilterOption, KitchenViewMode } from '../components/kitchen/KitchenHeader';
import { KotCard } from '../components/kitchen/KotCard';
import { CancelKotModal } from '../components/kitchen/CancelKotModal';

import {
  CookingPot,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Clock,
  CheckCheck,
  Inbox
} from 'lucide-react';
import {
  groupKOTsByOperationalStatus,
  filterKOTsByOperationalStatus,
  calculateKOTElapsedTimeMinutes
} from '../utils/kotQueueHelpers';

export const KitchenPage: React.FC = () => {
  const { restaurant, loading: restaurantLoading, error: restaurantError } = useRestaurant();
  const { user } = useAuth();
  const restaurantId = restaurant?.restaurantId || '';

  // Data states
  const [kots, setKots] = useState<KOT[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [syncQueue, setSyncQueue] = useState<OfflineQueueItem[]>([]);

  // Operational UI states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<KitchenFilterOption>('all');
  const [viewMode, setViewMode] = useState<KitchenViewMode>('lanes');

  // Mutation & Modal states
  const [cancelModalKot, setCancelModalKot] = useState<KOT | null>(null);
  const [updatingKotId, setUpdatingKotId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Subscribe to Offline Sync Service Queue
  useEffect(() => {
    const unsub = offlineSyncService.subscribe((_stats, queue) => {
      setSyncQueue(queue.filter((q) => q.restaurantId === restaurantId && q.status !== 'completed'));
    });
    return () => unsub();
  }, [restaurantId]);

  // Subscribe to Kitchen KOTs, Tables, and Orders
  useEffect(() => {
    if (!restaurantId) return;

    setLoading(true);
    setError(null);

    let unsubKots = () => {};
    let unsubTables = () => {};
    let unsubOrders = () => {};

    try {
      // Subscribe to active kitchen KOTs
      unsubKots = kotService.subscribeToKitchenKOTs(
        restaurantId,
        (activeKots) => {
          setKots(activeKots);
          setLoading(false);
        },
        (err) => {
          const isPerm = (err as any)?.code === 'permission-denied' || err.message?.includes('permission');
          if (isPerm) {
            console.warn('[KitchenPage] Kitchen KOTs subscription permission notice:', err.message);
          } else {
            console.error('Kitchen KOTs error:', err);
            setError(err.message || 'Failed to sync kitchen KOTs from cloud database.');
          }
          setLoading(false);
        }
      );

      // Subscribe to tables for Table Name mapping
      unsubTables = tableService.subscribeToTables(
        restaurantId,
        (tbls) => setTables(tbls),
        (err) => console.warn('Tables sub error in kitchen:', err)
      );

      // Subscribe to orders for Order Number & Order Type mapping
      unsubOrders = orderService.subscribeToOrders(
        restaurantId,
        (ords) => setOrders(ords),
        (err) => console.warn('Orders sub error in kitchen:', err)
      );
    } catch (err: any) {
      setError(err.message || 'Error subscribing to kitchen realtime data');
      setLoading(false);
    }

    return () => {
      unsubKots();
      unsubTables();
      unsubOrders();
    };
  }, [restaurantId]);

  // Lookup maps
  const tableMap = useMemo(() => {
    const map = new Map<string, Table>();
    for (const t of tables) {
      map.set(t.id, t);
    }
    return map;
  }, [tables]);

  const orderMap = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of orders) {
      map.set(o.id, o);
    }
    return map;
  }, [orders]);

  // Map of queued offline operations for KOT cards
  const kotQueueMap = useMemo(() => {
    const map = new Map<string, OfflineQueueItem>();
    for (const item of syncQueue) {
      const targetKotId = item.payload?.kotId;
      if (targetKotId) {
        map.set(targetKotId, item);
      }
    }
    return map;
  }, [syncQueue]);

  // Authoritative operational groups
  const groupedKots = useMemo(() => {
    return groupKOTsByOperationalStatus(kots);
  }, [kots]);

  // Filtered KOTs for Grid mode or single-filter view
  const filteredKots = useMemo(() => {
    return filterKOTsByOperationalStatus(kots, selectedFilter);
  }, [kots, selectedFilter]);

  // Summary Counts
  const summaryCounts = useMemo(() => {
    const waitingCount = groupedKots.waiting.length;
    const preparingCount = groupedKots.preparing.length;
    const readyCount = groupedKots.ready.length;

    let overdueCount = 0;
    const now = Date.now();
    for (const k of kots) {
      if (k.status !== 'ready' && k.status !== 'served' && k.status !== 'cancelled') {
        const elapsed = calculateKOTElapsedTimeMinutes(k, now);
        if (elapsed >= 20) overdueCount++;
      }
    }

    return {
      totalActive: kots.length,
      waitingCount,
      preparingCount,
      readyCount,
      overdueCount
    };
  }, [kots, groupedKots]);

  // Handle Status Change with Offline & Idempotency Safeguards
  const handleStatusChange = async (kotId: string, nextStatus: KOTStatus) => {
    setUpdatingKotId(kotId);
    setStatusMessage(null);

    const actorUid = user?.uid || 'kitchen_staff';
    const idempotencyKey = `idemp_update_kot_${kotId}_${nextStatus}_${Date.now()}`;

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineSyncService.enqueue(
          restaurantId,
          'update_kot_status',
          { kotId, newStatus: nextStatus, updatedBy: actorUid },
          idempotencyKey
        );
        setStatusMessage({
          type: 'info',
          text: `Offline mode: Status update to ${nextStatus.toUpperCase()} queued locally.`
        });
        return;
      }

      await kotService.updateKOTStatus(
        restaurantId,
        kotId,
        nextStatus,
        actorUid,
        idempotencyKey
      );
      setStatusMessage({
        type: 'success',
        text: `KOT status updated to ${nextStatus.toUpperCase()}.`
      });
    } catch (err: any) {
      console.error('KOT status change error:', err);
      const isNetworkError =
        err.message?.includes('network') ||
        err.message?.includes('offline') ||
        err.code === 'unavailable';

      if (isNetworkError) {
        try {
          offlineSyncService.enqueue(
            restaurantId,
            'update_kot_status',
            { kotId, newStatus: nextStatus, updatedBy: actorUid },
            idempotencyKey
          );
          setStatusMessage({
            type: 'info',
            text: `Network issue detected: Status update to ${nextStatus.toUpperCase()} queued for sync.`
          });
          return;
        } catch (queueErr: any) {
          setStatusMessage({
            type: 'error',
            text: queueErr.message || 'Failed to queue offline operation.'
          });
          return;
        }
      }

      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to update KOT status.'
      });
    } finally {
      setUpdatingKotId(null);
    }
  };

  // Handle Confirm Cancel KOT
  const handleConfirmCancel = async (reason: string) => {
    if (!cancelModalKot) return;
    const kotId = cancelModalKot.id;

    setUpdatingKotId(kotId);
    setStatusMessage(null);

    const actorUid = user?.uid || 'kitchen_staff';
    const idempotencyKey = `idemp_cancel_kot_${kotId}_${Date.now()}`;

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineSyncService.enqueue(
          restaurantId,
          'cancel_kot',
          { kotId, reason, cancelledBy: actorUid },
          idempotencyKey
        );
        setStatusMessage({
          type: 'info',
          text: `Offline mode: Cancellation for KOT ${cancelModalKot.kotNumber} queued locally.`
        });
        setCancelModalKot(null);
        return;
      }

      await kotService.cancelKOT(
        restaurantId,
        kotId,
        reason,
        actorUid,
        idempotencyKey
      );
      setStatusMessage({
        type: 'info',
        text: `KOT ${cancelModalKot.kotNumber} was cancelled.`
      });
      setCancelModalKot(null);
    } catch (err: any) {
      console.error('Cancel KOT error:', err);
      const isNetworkError =
        err.message?.includes('network') ||
        err.message?.includes('offline') ||
        err.code === 'unavailable';

      if (isNetworkError) {
        try {
          offlineSyncService.enqueue(
            restaurantId,
            'cancel_kot',
            { kotId, reason, cancelledBy: actorUid },
            idempotencyKey
          );
          setStatusMessage({
            type: 'info',
            text: `Network issue detected: Cancellation for KOT ${cancelModalKot.kotNumber} queued for sync.`
          });
          setCancelModalKot(null);
          return;
        } catch (queueErr: any) {
          setStatusMessage({
            type: 'error',
            text: queueErr.message || 'Failed to queue offline cancellation.'
          });
          return;
        }
      }

      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to cancel KOT.'
      });
    } finally {
      setUpdatingKotId(null);
    }
  };

  const handleRetrySyncItem = (queueItemId: string) => {
    offlineSyncService.retryItem(queueItemId);
    setStatusMessage({
      type: 'info',
      text: 'Retrying queued sync operation...'
    });
  };

  if (restaurantLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <CookingPot className="w-10 h-10 text-amber-500 animate-bounce mb-3" />
        <p className="text-sm font-bold text-white">Loading Kitchen Display...</p>
      </div>
    );
  }

  if (restaurantError || !restaurantId) {
    return (
      <div className="p-6 max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-2xl text-center text-white mt-12">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold">Restaurant Context Missing</h2>
        <p className="text-xs text-slate-400 mt-1">
          {restaurantError || 'Please select or setup an active outlet to access the Kitchen Display System.'}
        </p>
      </div>
    );
  }

  const renderKotCardItem = (kot: KOT) => {
    const tableObj = kot.tableId ? tableMap.get(kot.tableId) : null;
    const tableName = tableObj
      ? `Table ${tableObj.tableNumber}${tableObj.name ? ` (${tableObj.name})` : ''}`
      : null;

    const orderObj = kot.orderId ? orderMap.get(kot.orderId) : null;

    return (
      <KotCard
        key={kot.id}
        kot={kot}
        tableName={tableName}
        orderType={orderObj?.orderType || (kot.tableId ? 'dineIn' : 'takeaway')}
        orderNumber={orderObj?.orderNumber}
        onStatusChange={handleStatusChange}
        onCancel={() => setCancelModalKot(kot)}
        isUpdating={updatingKotId === kot.id}
        queuedItem={kotQueueMap.get(kot.id)}
        onRetrySync={handleRetrySyncItem}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      {/* Header */}
      <KitchenHeader
        totalActiveCount={summaryCounts.totalActive}
        waitingCount={summaryCounts.waitingCount}
        preparingCount={summaryCounts.preparingCount}
        readyCount={summaryCounts.readyCount}
        overdueCount={summaryCounts.overdueCount}
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRefresh={() => setLoading(true)}
        isRefreshing={loading}
      />

      {/* Toast Feedback Notification Banner */}
      {statusMessage && (
        <div
          className={`mx-4 mt-3 p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 p-4 overflow-y-auto">
        {error ? (
          /* Connection Error Banner with Retry */
          <div className="p-6 max-w-xl mx-auto bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center text-white my-8">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-rose-200">Kitchen Display Connection Error</h3>
            <p className="text-xs text-rose-300/80 mt-1 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-2 transition-colors min-h-[40px]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Connection</span>
            </button>
          </div>
        ) : loading ? (
          /* Loading Skeleton State */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-80 rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between"
              >
                <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                  <div className="w-24 h-5 bg-slate-800 rounded-md" />
                  <div className="w-16 h-5 bg-slate-800 rounded-md" />
                </div>
                <div className="space-y-3 py-4">
                  <div className="w-full h-4 bg-slate-800 rounded-md" />
                  <div className="w-3/4 h-4 bg-slate-800 rounded-md" />
                  <div className="w-1/2 h-4 bg-slate-800 rounded-md" />
                </div>
                <div className="w-full h-11 bg-slate-800 rounded-xl" />
              </div>
            ))}
          </div>
        ) : summaryCounts.totalActive === 0 ? (
          /* Overall Empty Queue State */
          <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl max-w-2xl mx-auto my-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-amber-400 mb-4 border border-slate-700">
              <CookingPot className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">No Active Kitchen Orders</h2>
            <p className="text-xs text-slate-400 max-w-md mt-1.5 mb-6 leading-relaxed">
              All incoming tickets have been prepared and served. New KOTs sent from POS or Captains will appear here automatically in real time.
            </p>
          </div>
        ) : viewMode === 'lanes' && selectedFilter === 'all' ? (
          /* 3-Column Operational Lanes View (WAITING | PREPARING | READY) */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Column 1: WAITING */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-sm font-extrabold text-indigo-200 uppercase tracking-wider">
                    Waiting
                  </h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-black">
                  {groupedKots.waiting.length}
                </span>
              </div>
              {groupedKots.waiting.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-500">
                  <Inbox className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-xs font-semibold">No orders waiting</p>
                </div>
              ) : (
                <div className="space-y-4 flex-1">
                  {groupedKots.waiting.map(renderKotCardItem)}
                </div>
              )}
            </div>

            {/* Column 2: PREPARING */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <CookingPot className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-extrabold text-amber-200 uppercase tracking-wider">
                    Preparing
                  </h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black">
                  {groupedKots.preparing.length}
                </span>
              </div>
              {groupedKots.preparing.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-500">
                  <CookingPot className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-xs font-semibold">No orders being prepared</p>
                </div>
              ) : (
                <div className="space-y-4 flex-1">
                  {groupedKots.preparing.map(renderKotCardItem)}
                </div>
              )}
            </div>

            {/* Column 3: READY */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <CheckCheck className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-extrabold text-emerald-200 uppercase tracking-wider">
                    Ready
                  </h2>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black">
                  {groupedKots.ready.length}
                </span>
              </div>
              {groupedKots.ready.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-500">
                  <CheckCircle2 className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-xs font-semibold">No orders ready for pickup</p>
                </div>
              ) : (
                <div className="space-y-4 flex-1">
                  {groupedKots.ready.map(renderKotCardItem)}
                </div>
              )}
            </div>
          </div>
        ) : filteredKots.length === 0 ? (
          /* Filtered Empty State */
          <div className="h-[50vh] flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl max-w-lg mx-auto my-8">
            <Inbox className="w-12 h-12 text-slate-500 mb-3" />
            <h3 className="text-base font-bold text-white">No Tickets Found</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              There are no active KOT tickets matching the selected filter ("{selectedFilter}").
            </p>
            <button
              onClick={() => setSelectedFilter('all')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-bold text-xs transition-colors"
            >
              Show All Active Tickets
            </button>
          </div>
        ) : (
          /* Responsive Card Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredKots.map(renderKotCardItem)}
          </div>
        )}
      </main>

      {/* Cancel KOT Modal */}
      <CancelKotModal
        isOpen={!!cancelModalKot}
        kotNumber={cancelModalKot?.kotNumber || ''}
        onClose={() => setCancelModalKot(null)}
        onConfirm={handleConfirmCancel}
        isSubmitting={!!updatingKotId}
      />
    </div>
  );
};

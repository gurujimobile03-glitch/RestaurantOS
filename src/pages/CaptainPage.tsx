import React, { useState, useEffect, useMemo } from 'react';
import { useRestaurant } from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';
import { tableService } from '../services/tableService';
import { tableSessionService } from '../services/tableSessionService';
import { orderService } from '../services/orderService';
import { kotService } from '../services/kotService';
import { offlineSyncService } from '../services/offlineSyncService';

import { Table, TableSession } from '../types/table';
import { Order } from '../types/order';
import { KOT } from '../types/kot';
import { OfflineQueueItem } from '../types/offlineQueue';

import { CaptainHeader, TableFilterStatus } from '../components/captain/CaptainHeader';
import { TableCard } from '../components/captain/TableCard';
import { OpenSessionModal } from '../components/captain/OpenSessionModal';
import { ActiveSessionModal } from '../components/captain/ActiveSessionModal';
import { OrderKotCard } from '../components/captain/OrderKotCard';
import { OrderKotDetailModal } from '../components/captain/OrderKotDetailModal';
import { TableHistoryModal } from '../components/captain/TableHistoryModal';

import { Layers, AlertCircle, RefreshCw, CheckCircle2, Plus, Users, Inbox, Search, Filter, CookingPot, Utensils, ShoppingBag, Truck, SlidersHorizontal } from 'lucide-react';
import { AdminView } from '../components/layout/Sidebar';

interface CaptainPageProps {
  onNavigate?: (view: AdminView) => void;
}

export const CaptainPage: React.FC<CaptainPageProps> = ({ onNavigate }) => {
  const { restaurant, loading: restaurantLoading, error: restaurantError } = useRestaurant();
  const { user } = useAuth();
  const restaurantId = restaurant?.restaurantId || '';

  // Realtime Data states
  const [tables, setTables] = useState<Table[]>([]);
  const [activeSessions, setActiveSessions] = useState<TableSession[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [kots, setKots] = useState<KOT[]>([]);
  const [syncQueue, setSyncQueue] = useState<OfflineQueueItem[]>([]);

  // UI & Filter states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<TableFilterStatus>('all');
  const [selectedArea, setSelectedArea] = useState<string>('all');

  // Phase 4F: Tab, Search & Filter states
  const [activeTab, setActiveTab] = useState<'tables' | 'orders'>('tables');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'dine_in' | 'takeaway' | 'delivery'>('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'active' | 'preparing' | 'ready' | 'completed'>('all');

  // Modal states
  const [openSessionModalTable, setOpenSessionModalTable] = useState<Table | null>(null);
  const [activeSessionModalTable, setActiveSessionModalTable] = useState<Table | null>(null);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const [tableHistoryModalTable, setTableHistoryModalTable] = useState<Table | null>(null);

  // Mutation & Status states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Subscribe to Offline Sync Queue
  useEffect(() => {
    const unsub = offlineSyncService.subscribe((_stats, queue) => {
      setSyncQueue(queue.filter((q) => q.restaurantId === restaurantId && q.status !== 'completed'));
    });
    return () => unsub();
  }, [restaurantId]);

  // Realtime Subscriptions for Tables, TableSessions, Orders, and KOTs
  useEffect(() => {
    if (!restaurantId) return;

    setLoading(true);
    setError(null);

    let unsubTables = () => {};
    let unsubSessions = () => {};
    let unsubOrders = () => {};
    let unsubKots = () => {};

    try {
      // 1. Subscribe to physical Tables
      unsubTables = tableService.subscribeToTables(
        restaurantId,
        (tbls) => {
          setTables(tbls);
          setLoading(false);
        },
        (err) => {
          const isPerm = (err as any)?.code === 'permission-denied' || err.message?.includes('permission');
          if (isPerm) {
            console.warn('[CaptainPage] Tables subscription permission notice:', err.message);
          } else {
            console.error('Tables sub error:', err);
            setError(err.message || 'Failed to load tables from cloud database.');
          }
          setLoading(false);
        }
      );

      // 2. Subscribe to active Table Sessions
      unsubSessions = tableSessionService.subscribeToActiveSessions(
        restaurantId,
        (sessions) => setActiveSessions(sessions),
        (err) => console.warn('Active sessions sub error:', err)
      );

      // 3. Subscribe to active Orders
      unsubOrders = orderService.subscribeToOrders(
        restaurantId,
        (ords) => setOrders(ords),
        (err) => console.warn('Orders sub error in Captain Ops:', err)
      );

      // 4. Subscribe to All KOTs
      unsubKots = kotService.subscribeToKOTs(
        restaurantId,
        (allKots) => setKots(allKots),
        (err) => console.warn('KOT sub error in Captain Ops:', err)
      );
    } catch (err: any) {
      setError(err.message || 'Error subscribing to floor realtime data');
      setLoading(false);
    }

    return () => {
      unsubTables();
      unsubSessions();
      unsubOrders();
      unsubKots();
    };
  }, [restaurantId]);

  // Lookup Maps
  const sessionByTableMap = useMemo(() => {
    const map = new Map<string, TableSession>();
    for (const s of activeSessions) {
      if (s.status === 'open') {
        map.set(s.tableId, s);
      }
    }
    return map;
  }, [activeSessions]);

  const orderByTableMap = useMemo(() => {
    const map = new Map<string, Order>();
    for (const o of orders) {
      if (o.tableId && o.status !== 'completed' && o.status !== 'cancelled') {
        map.set(o.tableId, o);
      }
    }
    return map;
  }, [orders]);

  // Lookup map from tableId to Table
  const tableMap = useMemo(() => {
    const map = new Map<string, Table>();
    for (const t of tables) {
      map.set(t.id, t);
    }
    return map;
  }, [tables]);

  // Phase 4F: Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Order Type Filter
      if (orderTypeFilter !== 'all' && o.orderType !== orderTypeFilter) {
        return false;
      }

      // 2. Order Status Filter
      if (orderStatusFilter !== 'all') {
        const orderKots = kots.filter((k) => k.orderId === o.id);
        if (orderStatusFilter === 'active') {
          if (o.status === 'completed' || o.status === 'cancelled') return false;
        } else if (orderStatusFilter === 'preparing') {
          const hasPrepKot = orderKots.some((k) => k.status === 'preparing' || k.status === 'sentToKitchen');
          if (o.status !== 'in_preparation' && !hasPrepKot) return false;
        } else if (orderStatusFilter === 'ready') {
          const hasReadyKot = orderKots.some((k) => k.status === 'ready');
          if (o.status !== 'ready' && !hasReadyKot) return false;
        } else if (orderStatusFilter === 'completed') {
          if (o.status !== 'completed') return false;
        }
      }

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const orderNum = (o.orderNumber || o.id).toLowerCase();
        const customerName = (o.customerSnapshot?.name || '').toLowerCase();
        const customerPhone = (o.customerSnapshot?.phone || '').toLowerCase();

        let tableNum = '';
        if (o.tableId && tableMap.has(o.tableId)) {
          tableNum = (tableMap.get(o.tableId)?.tableNumber || '').toLowerCase();
        }

        const orderKots = kots.filter((k) => k.orderId === o.id);
        const kotNums = orderKots.map((k) => (k.kotNumber || k.id).toLowerCase()).join(' ');

        const matches =
          orderNum.includes(q) ||
          customerName.includes(q) ||
          customerPhone.includes(q) ||
          tableNum.includes(q) ||
          kotNums.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [orders, kots, orderTypeFilter, orderStatusFilter, searchQuery, tableMap]);

  // Available Floor Areas
  const availableAreas = useMemo(() => {
    const areas = new Set<string>();
    for (const t of tables) {
      if (t.floorOrArea) areas.add(t.floorOrArea);
    }
    return Array.from(areas);
  }, [tables]);

  // Filtered Tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      // Area filter
      if (selectedArea !== 'all' && t.floorOrArea !== selectedArea) {
        return false;
      }

      // Status filter
      const isOccupied = sessionByTableMap.has(t.id);
      if (selectedFilter === 'available' && isOccupied) return false;
      if (selectedFilter === 'occupied' && !isOccupied) return false;

      return true;
    });
  }, [tables, selectedFilter, selectedArea, sessionByTableMap]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    let availableCount = 0;
    let occupiedCount = 0;

    for (const t of tables) {
      if (sessionByTableMap.has(t.id)) {
        occupiedCount++;
      } else {
        availableCount++;
      }
    }

    let kotWaitingCount = 0;
    let kotPreparingCount = 0;
    let kotReadyCount = 0;

    for (const k of kots) {
      if (k.status === 'sentToKitchen' || k.status === 'confirmed') kotWaitingCount++;
      else if (k.status === 'preparing') kotPreparingCount++;
      else if (k.status === 'ready') kotReadyCount++;
    }

    return {
      totalTables: tables.length,
      availableTables: availableCount,
      occupiedTables: occupiedCount,
      activeOrdersCount: orderByTableMap.size,
      kotWaitingCount,
      kotPreparingCount,
      kotReadyCount
    };
  }, [tables, sessionByTableMap, orderByTableMap, kots]);

  // Action Handlers
  const handleTableClick = (table: Table) => {
    const activeSession = sessionByTableMap.get(table.id);
    if (activeSession) {
      setActiveSessionModalTable(table);
    } else {
      setOpenSessionModalTable(table);
    }
  };

  const handleOpenSessionSubmit = async (tableId: string, guestCount: number) => {
    setIsSubmitting(true);
    setStatusMessage(null);

    const actorUid = user?.uid || 'captain_staff';
    const idempotencyKey = `idemp_open_session_${tableId}_${Date.now()}`;

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineSyncService.enqueue(
          restaurantId,
          'open_session',
          { tableId, guestCount, openedBy: actorUid },
          idempotencyKey
        );
        setStatusMessage({
          type: 'info',
          text: 'Offline mode: Table session open request queued locally.'
        });
        return;
      }

      await tableSessionService.openSession(
        restaurantId,
        tableId,
        guestCount,
        actorUid,
        idempotencyKey
      );

      setStatusMessage({
        type: 'success',
        text: 'Table session opened successfully.'
      });
    } catch (err: any) {
      console.error('Open session error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to open table session.'
      });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSessionSubmit = async (sessionId: string) => {
    setIsSubmitting(true);
    setStatusMessage(null);

    const actorUid = user?.uid || 'captain_staff';

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineSyncService.enqueue(
          restaurantId,
          'close_session',
          { sessionId, closedBy: actorUid }
        );
        setStatusMessage({
          type: 'info',
          text: 'Offline mode: Close session request queued locally.'
        });
        return;
      }

      await tableSessionService.closeSession(restaurantId, sessionId, actorUid);
      setStatusMessage({
        type: 'success',
        text: 'Table session closed.'
      });
    } catch (err: any) {
      console.error('Close session error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to close session.'
      });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateGuestCountSubmit = async (sessionId: string, newGuestCount: number) => {
    setIsSubmitting(true);
    setStatusMessage(null);

    const actorUid = user?.uid || 'captain_staff';

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineSyncService.enqueue(
          restaurantId,
          'update_guest_count',
          { sessionId, newGuestCount, updatedBy: actorUid }
        );
        setStatusMessage({
          type: 'info',
          text: 'Offline mode: Guest count update queued locally.'
        });
        return;
      }

      await tableSessionService.updateGuestCount(restaurantId, sessionId, newGuestCount, actorUid);
      setStatusMessage({
        type: 'success',
        text: 'Guest count updated.'
      });
    } catch (err: any) {
      console.error('Update guest count error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to update guest count.'
      });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendKotToKitchen = async (orderId: string, tableId: string) => {
    setIsSubmitting(true);
    setStatusMessage(null);

    const actorUid = user?.uid || 'captain_staff';
    const idempotencyKey = `idemp_create_kot_${orderId}_${Date.now()}`;

    try {
      const targetOrder = orders.find((o) => o.id === orderId);
      if (!targetOrder || !targetOrder.items || targetOrder.items.length === 0) {
        throw new Error('No items in order to dispatch KOT.');
      }

      await kotService.createKOTFromOrder({
        restaurantId,
        orderId,
        createdBy: actorUid,
        clientRequestId: idempotencyKey
      });

      setStatusMessage({
        type: 'success',
        text: 'KOT dispatched to kitchen display!'
      });
    } catch (err: any) {
      console.error('Send KOT error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to dispatch KOT.'
      });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateKotStatusSubmit = async (kotId: string, newStatus: any) => {
    setIsSubmitting(true);
    setStatusMessage(null);
    const actorUid = user?.uid || 'captain_staff';
    const idempotencyKey = `idemp_update_kot_${kotId}_${newStatus}_${Date.now()}`;

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineSyncService.enqueue(
          restaurantId,
          'update_kot_status',
          { kotId, newStatus, updatedBy: actorUid },
          idempotencyKey
        );
        setStatusMessage({
          type: 'info',
          text: 'Offline mode: KOT status update queued locally.'
        });
        return;
      }

      await kotService.updateKOTStatus(restaurantId, kotId, newStatus, actorUid, idempotencyKey);
      setStatusMessage({
        type: 'success',
        text: `KOT status updated to ${newStatus}.`
      });
    } catch (err: any) {
      console.error('Update KOT status error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to update KOT status.'
      });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelKotSubmit = async (kotId: string, reason: string) => {
    setIsSubmitting(true);
    setStatusMessage(null);
    const actorUid = user?.uid || 'captain_staff';
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
          text: 'Offline mode: KOT cancellation queued locally.'
        });
        return;
      }

      await kotService.cancelKOT(restaurantId, kotId, reason, actorUid, idempotencyKey);
      setStatusMessage({
        type: 'success',
        text: 'KOT cancelled.'
      });
    } catch (err: any) {
      console.error('Cancel KOT error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to cancel KOT.'
      });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelOrderSubmit = async (orderId: string, reason: string) => {
    setIsSubmitting(true);
    setStatusMessage(null);
    const actorUid = user?.uid || 'captain_staff';

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        offlineSyncService.enqueue(
          restaurantId,
          'update_order_status',
          { orderId, newStatus: 'cancelled', updatedBy: actorUid, cancellationReason: reason }
        );
        setStatusMessage({
          type: 'info',
          text: 'Offline mode: Order cancellation queued locally.'
        });
        return;
      }

      await orderService.updateOrderStatus(restaurantId, orderId, 'cancelled', actorUid, reason);
      setStatusMessage({
        type: 'success',
        text: 'Order cancelled.'
      });
    } catch (err: any) {
      console.error('Cancel order error:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to cancel order.'
      });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToPosOrder = (_tableId: string) => {
    if (onNavigate) {
      onNavigate('pos');
    }
  };

  const handleGoToPosSettlement = (_tableId: string) => {
    if (onNavigate) {
      onNavigate('pos');
    }
  };

  if (restaurantLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <Layers className="w-10 h-10 text-indigo-500 animate-bounce mb-3" />
        <p className="text-sm font-bold text-white">Loading Captain Ops Floor View...</p>
      </div>
    );
  }

  if (restaurantError || !restaurantId) {
    return (
      <div className="p-6 max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-2xl text-center text-white mt-12">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold">Restaurant Outlet Required</h2>
        <p className="text-xs text-slate-400 mt-1">
          {restaurantError || 'Please select an active restaurant outlet to access Captain Floor Operations.'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      {/* Header */}
      <CaptainHeader
        totalTables={summaryMetrics.totalTables}
        availableTables={summaryMetrics.availableTables}
        occupiedTables={summaryMetrics.occupiedTables}
        activeOrdersCount={summaryMetrics.activeOrdersCount}
        kotWaitingCount={summaryMetrics.kotWaitingCount}
        kotPreparingCount={summaryMetrics.kotPreparingCount}
        kotReadyCount={summaryMetrics.kotReadyCount}
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
        selectedArea={selectedArea}
        onAreaChange={setSelectedArea}
        availableAreas={availableAreas}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={() => setLoading(true)}
        isRefreshing={loading}
      />

      {/* Status Banner */}
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

      {/* Main Operational View */}
      <main className="flex-1 p-4 overflow-y-auto">
        {error ? (
          /* Error Banner */
          <div className="p-6 max-w-xl mx-auto bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center text-white my-8">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-rose-200">Synchronization Error</h3>
            <p className="text-xs text-rose-300/80 mt-1 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-2 transition-colors min-h-[40px]"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Sync</span>
            </button>
          </div>
        ) : loading ? (
          /* Skeleton Loading Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-44 rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between"
              >
                <div className="flex justify-between items-center">
                  <div className="w-20 h-5 bg-slate-800 rounded-md" />
                  <div className="w-16 h-5 bg-slate-800 rounded-md" />
                </div>
                <div className="space-y-2 py-3">
                  <div className="w-full h-4 bg-slate-800 rounded-md" />
                  <div className="w-2/3 h-4 bg-slate-800 rounded-md" />
                </div>
                <div className="w-full h-8 bg-slate-800 rounded-xl" />
              </div>
            ))}
          </div>
        ) : activeTab === 'tables' ? (
          /* Floor Map View */
          tables.length === 0 ? (
            <div className="h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl max-w-xl mx-auto my-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-indigo-400 mb-4 border border-slate-700">
                <Layers className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">No Restaurant Tables Configured</h2>
              <p className="text-xs text-slate-400 max-w-md mt-1.5 mb-6 leading-relaxed">
                To begin managing dining sessions and table orders in Captain Ops, please set up physical dining tables in the Restaurant Setup section.
              </p>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('restaurant')}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs inline-flex items-center gap-2 transition-colors min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Go to Restaurant Setup</span>
                </button>
              )}
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="h-[50vh] flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl max-w-md mx-auto my-8">
              <Inbox className="w-12 h-12 text-slate-500 mb-3" />
              <h3 className="text-base font-bold text-white">No Tables Match Filter</h3>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                No tables found matching status ("{selectedFilter}") or floor area ("{selectedArea}").
              </p>
              <button
                onClick={() => {
                  setSelectedFilter('all');
                  setSelectedArea('all');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 font-bold text-xs transition-colors"
              >
                Reset Floor Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredTables.map((table) => {
                const activeSession = sessionByTableMap.get(table.id) || null;
                const activeOrder = orderByTableMap.get(table.id) || null;
                return (
                  <TableCard
                    key={table.id}
                    table={table}
                    activeSession={activeSession}
                    activeOrder={activeOrder}
                    kots={kots}
                    onClick={() => handleTableClick(table)}
                    onViewHistory={(tbl) => setTableHistoryModalTable(tbl)}
                  />
                );
              })}
            </div>
          )
        ) : (
          /* Phase 4F: Orders & KOTs Feed View */
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* Search & Operational Controls Toolbar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-testid="input-order-kot-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Order #, KOT #, Table #, or Customer..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Order Type Filter Pills */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  data-testid="filter-type-all"
                  onClick={() => setOrderTypeFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    orderTypeFilter === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Types
                </button>
                <button
                  type="button"
                  data-testid="filter-type-dine-in"
                  onClick={() => setOrderTypeFilter('dine_in')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                    orderTypeFilter === 'dine_in'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Utensils className="w-3 h-3" />
                  <span>Dine-In</span>
                </button>
                <button
                  type="button"
                  data-testid="filter-type-takeaway"
                  onClick={() => setOrderTypeFilter('takeaway')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                    orderTypeFilter === 'takeaway'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShoppingBag className="w-3 h-3" />
                  <span>Takeaway</span>
                </button>
                <button
                  type="button"
                  data-testid="filter-type-delivery"
                  onClick={() => setOrderTypeFilter('delivery')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                    orderTypeFilter === 'delivery'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Truck className="w-3 h-3" />
                  <span>Delivery</span>
                </button>
              </div>

              {/* Status Filter Selector */}
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                <select
                  data-testid="select-order-status-filter"
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value as any)}
                  className="bg-slate-950 text-slate-200 text-xs font-bold px-3 py-2 rounded-xl border border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Orders</option>
                  <option value="preparing">In Kitchen Prep</option>
                  <option value="ready">Ready to Serve</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            {/* Orders Feed Grid */}
            {filteredOrders.length === 0 ? (
              <div className="h-[50vh] flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 border border-slate-800/80 rounded-3xl max-w-md mx-auto my-6">
                <CookingPot className="w-12 h-12 text-slate-600 mb-3" />
                <h3 className="text-base font-bold text-white">No Orders Found</h3>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  No order or KOT ticket matches your current search or filter criteria.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setOrderTypeFilter('all');
                    setOrderStatusFilter('all');
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 font-bold text-xs transition-colors"
                >
                  Reset Order Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrders.map((order) => {
                  const table = order.tableId ? tableMap.get(order.tableId) || null : null;
                  const session = order.tableId ? sessionByTableMap.get(order.tableId) || null : null;
                  return (
                    <OrderKotCard
                      key={order.id}
                      order={order}
                      kots={kots}
                      table={table}
                      session={session}
                      onClick={() => setSelectedOrderForDetail(order)}
                      onUpdateKotStatus={handleUpdateKotStatusSubmit}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Open Session Modal */}
      <OpenSessionModal
        isOpen={!!openSessionModalTable}
        table={openSessionModalTable}
        onClose={() => setOpenSessionModalTable(null)}
        onOpenSession={handleOpenSessionSubmit}
        isSubmitting={isSubmitting}
      />

      {/* Active Session Detail Modal */}
      <ActiveSessionModal
        isOpen={!!activeSessionModalTable}
        table={activeSessionModalTable}
        session={activeSessionModalTable ? sessionByTableMap.get(activeSessionModalTable.id) || null : null}
        order={activeSessionModalTable ? orderByTableMap.get(activeSessionModalTable.id) || null : null}
        kots={kots}
        onClose={() => setActiveSessionModalTable(null)}
        onSendKotToKitchen={handleSendKotToKitchen}
        onCloseSession={handleCloseSessionSubmit}
        onUpdateGuestCount={handleUpdateGuestCountSubmit}
        onUpdateKotStatus={handleUpdateKotStatusSubmit}
        onGoToPosOrder={handleGoToPosOrder}
        onGoToPosSettlement={handleGoToPosSettlement}
        isSubmitting={isSubmitting}
      />

      {/* Phase 4F: Order & KOT Detail Modal */}
      <OrderKotDetailModal
        isOpen={!!selectedOrderForDetail}
        order={selectedOrderForDetail}
        kots={kots}
        table={selectedOrderForDetail?.tableId ? tableMap.get(selectedOrderForDetail.tableId) || null : null}
        session={selectedOrderForDetail?.tableId ? sessionByTableMap.get(selectedOrderForDetail.tableId) || null : null}
        onClose={() => setSelectedOrderForDetail(null)}
        onUpdateKotStatus={handleUpdateKotStatusSubmit}
        onCancelKot={handleCancelKotSubmit}
        onCancelOrder={handleCancelOrderSubmit}
        isSubmitting={isSubmitting}
      />
      {/* Table History Modal */}
      <TableHistoryModal
        isOpen={!!tableHistoryModalTable}
        table={tableHistoryModalTable}
        activeSession={tableHistoryModalTable ? sessionByTableMap.get(tableHistoryModalTable.id) || null : null}
        onClose={() => setTableHistoryModalTable(null)}
      />
    </div>
  );
};

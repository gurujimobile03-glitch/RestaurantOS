import React, { useState, useEffect } from 'react';
import { Table, TableSession } from '../../types/table';
import { Order } from '../../types/order';
import { tableSessionService } from '../../services/tableSessionService';
import { orderService } from '../../services/orderService';
import { formatMoney } from '../../utils/money';
import { useRestaurant } from '../../context/RestaurantContext';
import { BillReceiptModal } from '../pos/BillReceiptModal';
import {
  X,
  Clock,
  Users,
  Receipt,
  RotateCw,
  Eye,
  CheckCircle2,
  Calendar,
  Layers,
  History,
  AlertCircle
} from 'lucide-react';

interface TableHistoryModalProps {
  isOpen: boolean;
  table: Table | null;
  activeSession: TableSession | null;
  onClose: () => void;
}

export const TableHistoryModal: React.FC<TableHistoryModalProps> = ({
  isOpen,
  table,
  activeSession,
  onClose
}) => {
  const { restaurant } = useRestaurant();
  const symbol = restaurant?.currencySymbol || '₹';

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [historicalSessions, setHistoricalSessions] = useState<TableSession[]>([]);
  const [sessionOrders, setSessionOrders] = useState<Record<string, Order[]>>({});
  
  // Selected order for Bill view / reprint
  const [billOrder, setBillOrder] = useState<Order | null>(null);
  const [isReprintMode, setIsReprintMode] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !table || !restaurant?.id) return;

    let isMounted = true;
    const loadTableHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const sessions = await tableSessionService.getHistoricalSessionsForTable(
          restaurant.id,
          table.id,
          20
        );
        if (!isMounted) return;
        setHistoricalSessions(sessions);

        // Fetch associated orders for all sessions
        const ordersMap: Record<string, Order[]> = {};
        await Promise.all(
          sessions.map(async (sess) => {
            try {
              const orders = await orderService.getOrdersForSession(restaurant.id, sess.id);
              ordersMap[sess.id] = orders;
            } catch (err) {
              console.warn(`[RestaurantOS] Error fetching orders for session ${sess.id}:`, err);
              ordersMap[sess.id] = [];
            }
          })
        );

        if (isMounted) {
          setSessionOrders(ordersMap);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to load table session history.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadTableHistory();

    return () => {
      isMounted = false;
    };
  }, [isOpen, table?.id, restaurant?.id]);

  if (!isOpen || !table) return null;

  return (
    <>
      <div
        data-testid="table-history-modal"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto"
      >
        <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl text-white shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight text-white">
                  Table {table.tableNumber} History
                </h3>
                <p className="text-xs text-slate-400">
                  {table.floorOrArea || 'Main Dining'} • Capacity: {table.capacity} • {historicalSessions.length} past sessions
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="btn-close-table-history"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Active Session Callout (if currently occupied) */}
            {activeSession && activeSession.status === 'open' && (
              <div
                data-testid="current-active-session-banner"
                className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-300">
                      Currently Active Session
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-200 border border-amber-500/40">
                    Open
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>{activeSession.guestCount} Current Guests</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">
                    Session ID: {activeSession.id.substring(0, 8)}...
                  </span>
                </div>
              </div>
            )}

            {/* Historical Sessions Section */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Closed Dining Sessions & Bills</span>
              </h4>

              {loading ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-3" />
                  <span>Loading table session logs...</span>
                </div>
              ) : error ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
              ) : historicalSessions.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs bg-slate-950/40 border border-slate-800 rounded-2xl">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="font-semibold text-slate-400">No previous sessions found</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Completed dining records for Table {table.tableNumber} will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4" data-testid="table-history-list">
                  {historicalSessions.map((sess) => {
                    const orders = sessionOrders[sess.id] || [];
                    const openedDate = sess.openedAt
                      ? new Date((sess.openedAt as any)?.toDate?.() || sess.openedAt)
                      : null;
                    const closedDate = sess.closedAt
                      ? new Date((sess.closedAt as any)?.toDate?.() || sess.closedAt)
                      : null;

                    const totalSessionAmount = orders.reduce(
                      (acc, o) => acc + (o.grandTotalMinor || 0),
                      0
                    );

                    return (
                      <div
                        key={sess.id}
                        data-testid={`history-session-${sess.id}`}
                        className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 hover:border-slate-700 transition-colors"
                      >
                        {/* Session Header */}
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-slate-300">
                              Session #{sess.id.substring(0, 8)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold border border-slate-700">
                              Closed
                            </span>
                            <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                              <Users className="w-3 h-3 text-slate-500" />
                              <span>{sess.guestCount} guests</span>
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {closedDate?.toLocaleString('en-IN') || openedDate?.toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* Associated Orders & Bills */}
                        {orders.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic">No orders created in this session.</p>
                        ) : (
                          <div className="space-y-2">
                            {orders.map((ord) => (
                              <div
                                key={ord.id}
                                data-testid={`history-order-row-${ord.id}`}
                                className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-xs text-indigo-300">
                                      Order #{ord.orderNumber}
                                    </span>
                                    <span className="capitalize px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold border border-slate-700">
                                      {ord.status}
                                    </span>
                                    {ord.paidAmountMinor >= ord.grandTotalMinor && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1">
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                        <span>Paid</span>
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-400">
                                    {ord.items?.length || 0} items • Grand Total:{' '}
                                    <strong className="text-white font-bold">
                                      {formatMoney(ord.grandTotalMinor, symbol)}
                                    </strong>
                                  </p>
                                </div>

                                {/* Bill Retrieval Actions */}
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    data-testid={`btn-history-view-bill-${ord.id}`}
                                    onClick={() => {
                                      setBillOrder(ord);
                                      setIsReprintMode(false);
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    <span>View Bill</span>
                                  </button>

                                  <button
                                    type="button"
                                    data-testid={`btn-history-reprint-bill-${ord.id}`}
                                    onClick={() => {
                                      setBillOrder(ord);
                                      setIsReprintMode(true);
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                                  >
                                    <RotateCw className="w-3.5 h-3.5" />
                                    <span>Reprint</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Bill Receipt Modal for Historical View / Reprint */}
      {billOrder && (
        <BillReceiptModal
          isOpen={!!billOrder}
          onClose={() => setBillOrder(null)}
          order={billOrder}
          isReprint={isReprintMode}
        />
      )}
    </>
  );
};

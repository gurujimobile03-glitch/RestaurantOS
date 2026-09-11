import React, { useState } from 'react';
import { Table, TableSession } from '../../types/table';
import { Order } from '../../types/order';
import { KOT } from '../../types/kot';
import {
  X,
  Users,
  Clock,
  Utensils,
  CookingPot,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  CreditCard,
  LogOut,
  Send
} from 'lucide-react';

interface ActiveSessionModalProps {
  isOpen: boolean;
  table: Table | null;
  session: TableSession | null;
  order: Order | null;
  kots: KOT[];
  onClose: () => void;
  onSendKotToKitchen: (orderId: string, tableId: string) => Promise<void>;
  onCloseSession: (sessionId: string) => Promise<void>;
  onUpdateGuestCount?: (sessionId: string, newGuestCount: number) => Promise<void>;
  onUpdateKotStatus?: (kotId: string, newStatus: any) => Promise<void>;
  onGoToPosOrder: (tableId: string) => void;
  onGoToPosSettlement: (tableId: string) => void;
  isSubmitting: boolean;
}

export const ActiveSessionModal: React.FC<ActiveSessionModalProps> = ({
  isOpen,
  table,
  session,
  order,
  kots,
  onClose,
  onSendKotToKitchen,
  onCloseSession,
  onUpdateGuestCount,
  onUpdateKotStatus,
  onGoToPosOrder,
  onGoToPosSettlement,
  isSubmitting
}) => {
  if (!isOpen || !table || !session) return null;

  const [actionError, setActionError] = useState<string | null>(null);

  // Filter KOTs for this table
  const tableKots = kots.filter((k) => k.tableId === table.id);

  // Calculate elapsed session time
  let elapsedMinutes = 0;
  if (session.openedAt) {
    const openedTime =
      typeof session.openedAt?.toDate === 'function'
        ? session.openedAt.toDate().getTime()
        : new Date(session.openedAt).getTime();
    if (!isNaN(openedTime)) {
      elapsedMinutes = Math.max(0, Math.floor((Date.now() - openedTime) / (1000 * 60)));
    }
  }

  const handleSendKot = async () => {
    if (!order) return;
    setActionError(null);
    try {
      await onSendKotToKitchen(order.id, table.id);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to dispatch KOT to kitchen.');
    }
  };

  const handleCloseSessionAction = async () => {
    setActionError(null);
    try {
      await onCloseSession(session.id);
      onClose();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to close table session.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Table {table.tableNumber} — Active Session
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                  Occupied
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 rounded-lg px-2 py-0.5">
                  <span className="font-semibold text-slate-300">{session.guestCount} Guests</span>
                  {onUpdateGuestCount && (
                    <div className="flex items-center gap-1 ml-1 border-l border-slate-800 pl-1">
                      <button
                        type="button"
                        data-testid="btn-decrement-guests"
                        disabled={isSubmitting || session.guestCount <= 1}
                        onClick={async () => {
                          setActionError(null);
                          try {
                            await onUpdateGuestCount(session.id, session.guestCount - 1);
                          } catch (err: any) {
                            setActionError(err?.message || 'Failed to update guest count');
                          }
                        }}
                        className="w-4 h-4 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold text-xs disabled:opacity-30"
                        title="Reduce guests"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        data-testid="btn-increment-guests"
                        disabled={isSubmitting || session.guestCount >= table.capacity}
                        onClick={async () => {
                          setActionError(null);
                          try {
                            await onUpdateGuestCount(session.id, session.guestCount + 1);
                          } catch (err: any) {
                            setActionError(err?.message || 'Failed to update guest count');
                          }
                        }}
                        className="w-4 h-4 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold text-xs disabled:opacity-30"
                        title="Increase guests"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
                <span>•</span>
                <span>Opened {elapsedMinutes}m ago</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="my-4 space-y-4 overflow-y-auto flex-1 pr-1">
          {/* Active Order Section */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">
                  {order ? `Order #${order.orderNumber}` : 'No Active Order'}
                </h3>
              </div>
              {order && (
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {order.status}
                </span>
              )}
            </div>

            {order ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-400 font-semibold">Ordered Items:</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {order.items?.map((item, idx) => (
                    <div
                      key={item.itemId + idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-slate-800 text-amber-400 font-bold flex items-center justify-center text-[11px]">
                          {item.quantity}x
                        </span>
                        <span className="font-semibold text-slate-200">{item.nameSnapshot}</span>
                      </div>
                      {item.notes && (
                        <span className="text-[10px] italic text-slate-400 truncate max-w-[150px]">
                          "{item.notes}"
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                There is currently no active order associated with this table session.
              </p>
            )}
          </div>

          {/* Kitchen KOT Progress Section */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CookingPot className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Kitchen Order Tickets (KOTs)</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">{tableKots.length} KOTs</span>
            </div>

            {tableKots.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No KOT tickets dispatched yet.</p>
            ) : (
              <div className="space-y-2">
                {tableKots.map((kot) => (
                  <div
                    key={kot.id}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-200">{kot.kotNumber}</span>
                      <span className="text-[11px] text-slate-400 ml-2">
                        ({kot.items.length} items)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          kot.status === 'sentToKitchen'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                            : kot.status === 'preparing'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : kot.status === 'ready'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 animate-pulse'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {kot.status}
                      </span>
                      {kot.status === 'ready' && onUpdateKotStatus && (
                        <button
                          type="button"
                          data-testid={`session-btn-serve-kot-${kot.id}`}
                          onClick={async () => {
                            setActionError(null);
                            try {
                              await onUpdateKotStatus(kot.id, 'served');
                            } catch (err: any) {
                              setActionError(err?.message || 'Failed to serve KOT');
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition-colors"
                        >
                          Serve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Operational Controls */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Close Session */}
          <button
            type="button"
            data-testid="btn-close-session"
            onClick={handleCloseSessionAction}
            disabled={isSubmitting}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors border border-slate-700 min-h-[40px]"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span>Close Session</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Take Order / Add Items */}
            <button
              type="button"
              data-testid="btn-captain-add-order"
              onClick={() => {
                onClose();
                onGoToPosOrder(table.id);
              }}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors min-h-[40px]"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{order ? 'Add Items' : 'Take Order'}</span>
            </button>

            {/* Send KOT if order exists */}
            {order && (
              <button
                type="button"
                data-testid="btn-captain-send-kot"
                onClick={handleSendKot}
                disabled={isSubmitting}
                className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 min-h-[40px]"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send KOT</span>
              </button>
            )}

            {/* POS Settlement Link */}
            <button
              type="button"
              data-testid="btn-captain-settlement"
              onClick={() => {
                onClose();
                onGoToPosSettlement(table.id);
              }}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors min-h-[40px]"
              title="Navigate to POS Terminal for Billing & Settlement"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>POS Billing</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

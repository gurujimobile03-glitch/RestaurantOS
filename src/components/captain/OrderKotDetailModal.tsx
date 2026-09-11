import React, { useState } from 'react';
import { Order, OrderStatus } from '../../types/order';
import { KOT, KOTStatus } from '../../types/kot';
import { Table, TableSession } from '../../types/table';
import { formatMoney } from '../../utils/money';
import {
  X,
  Utensils,
  ShoppingBag,
  Truck,
  CookingPot,
  CheckCircle2,
  Clock,
  AlertCircle,
  Check,
  Ban,
  Receipt
} from 'lucide-react';

interface OrderKotDetailModalProps {
  isOpen: boolean;
  order: Order | null;
  kots: KOT[];
  table?: Table | null;
  session?: TableSession | null;
  onClose: () => void;
  onUpdateKotStatus?: (kotId: string, newStatus: KOTStatus) => Promise<void>;
  onCancelKot?: (kotId: string, reason: string) => Promise<void>;
  onCancelOrder?: (orderId: string, reason: string) => Promise<void>;
  isSubmitting?: boolean;
}

export const OrderKotDetailModal: React.FC<OrderKotDetailModalProps> = ({
  isOpen,
  order,
  kots,
  table,
  session,
  onClose,
  onUpdateKotStatus,
  onCancelKot,
  onCancelOrder,
  isSubmitting = false
}) => {
  const [cancelKotId, setCancelKotId] = useState<string | null>(null);
  const [cancelKotReason, setCancelKotReason] = useState<string>('');
  const [showCancelOrderInput, setShowCancelOrderInput] = useState<boolean>(false);
  const [cancelOrderReason, setCancelOrderReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const orderKots = kots.filter((k) => k.orderId === order.id);

  const createdDate = order.createdAt ? new Date((order.createdAt as any)?.toDate?.() || order.createdAt) : new Date();

  const handleServeKot = async (kotId: string) => {
    setActionError(null);
    if (!onUpdateKotStatus) return;
    try {
      await onUpdateKotStatus(kotId, 'served');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update KOT status.');
    }
  };

  const handleConfirmCancelKot = async (kotId: string) => {
    setActionError(null);
    if (!cancelKotReason.trim()) {
      setActionError('Cancellation reason is required.');
      return;
    }
    if (!onCancelKot) return;
    try {
      await onCancelKot(kotId, cancelKotReason.trim());
      setCancelKotId(null);
      setCancelKotReason('');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to cancel KOT.');
    }
  };

  const handleConfirmCancelOrder = async () => {
    setActionError(null);
    if (!cancelOrderReason.trim()) {
      setActionError('Cancellation reason is required.');
      return;
    }
    if (!onCancelOrder) return;
    try {
      await onCancelOrder(order.id, cancelOrderReason.trim());
      setShowCancelOrderInput(false);
      setCancelOrderReason('');
      onClose();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to cancel order.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        data-testid="order-detail-modal"
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full text-white shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-mono font-bold">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight">
                  Order #{order.orderNumber || order.id.substring(0, 8)}
                </h3>
                <span className="capitalize px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-bold">
                  {order.orderType.replace('_', ' ')}
                </span>
                <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold">
                  {order.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Created {createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-close-modal"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-[11px] font-bold text-rose-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Context Information */}
        <div className="p-5 space-y-6">
          <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-400 font-medium">Service Context:</span>
              <p className="font-bold text-slate-200 mt-0.5">
                {order.orderType === 'dine_in'
                  ? `Table ${table?.tableNumber || 'N/A'} ${table?.floorOrArea ? `(${table.floorOrArea})` : ''}`
                  : order.orderType === 'takeaway'
                  ? 'Takeaway Counter'
                  : 'Delivery Direct'}
              </p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Customer Info:</span>
              <p className="font-bold text-slate-200 mt-0.5">
                {order.customerSnapshot?.name || 'Walk-in Guest'}{' '}
                {order.customerSnapshot?.phone ? `(${order.customerSnapshot.phone})` : ''}
              </p>
            </div>
          </div>

          {/* Itemized Order Breakdown */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Order Items ({order.items.length})
            </h4>
            <div className="bg-slate-950/60 rounded-2xl border border-slate-800 divide-y divide-slate-800/80 text-xs overflow-hidden">
              {order.items.map((item, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-200">
                      {item.quantity}x {item.nameSnapshot}
                    </div>
                    {item.notes && <div className="text-[11px] text-amber-400 italic mt-0.5">Note: {item.notes}</div>}
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Modifiers: {item.modifiers.map((m) => m.name).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-200">{formatMoney(item.lineTotalMinor)}</div>
                    <div className="text-[10px] text-slate-500">
                      @{formatMoney(item.unitPriceMinor)} each
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-xs space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-200">{formatMoney(order.subtotalMinor)}</span>
            </div>
            {order.discountTotalMinor > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount</span>
                <span className="font-semibold">-{formatMoney(order.discountTotalMinor)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>Tax Total</span>
              <span className="font-semibold text-slate-200">{formatMoney(order.taxTotalMinor)}</span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-black">
              <span>Grand Total</span>
              <span className="text-emerald-400 text-base">{formatMoney(order.grandTotalMinor)}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-400 font-medium">Payment Status</span>
              <span
                className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                  order.paymentStatus === 'paid'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {order.paymentStatus}
              </span>
            </div>
          </div>

          {/* Attached Kitchen KOT Tickets Breakdown */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Kitchen Orders (KOTs) ({orderKots.length})
            </h4>
            {orderKots.length === 0 ? (
              <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-center text-xs text-slate-400 italic">
                No KOT tickets created for this order yet.
              </div>
            ) : (
              <div className="space-y-3">
                {orderKots.map((kot) => (
                  <div key={kot.id} className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <CookingPot className="w-4 h-4 text-indigo-400" />
                        <span className="font-mono font-bold text-slate-200">
                          #{kot.kotNumber || kot.id.substring(0, 6)}
                        </span>
                        <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-indigo-300 text-[10px] font-bold border border-slate-700">
                          {kot.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {kot.status === 'ready' && onUpdateKotStatus && (
                          <button
                            type="button"
                            data-testid={`modal-btn-serve-kot-${kot.id}`}
                            disabled={isSubmitting}
                            onClick={() => handleServeKot(kot.id)}
                            className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Mark Served</span>
                          </button>
                        )}
                        {kot.status !== 'served' && kot.status !== 'cancelled' && onCancelKot && (
                          <button
                            type="button"
                            data-testid={`modal-btn-cancel-kot-${kot.id}`}
                            disabled={isSubmitting}
                            onClick={() => {
                              setCancelKotId(kot.id);
                              setCancelKotReason('');
                            }}
                            className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-rose-600/20 text-slate-400 hover:text-rose-300 font-bold text-xs flex items-center gap-1 transition-colors"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Cancel KOT Reason Inline Dialog */}
                    {cancelKotId === kot.id && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-2">
                        <p className="font-bold text-rose-300 text-xs">Reason for cancelling KOT #{kot.kotNumber || kot.id.substring(0, 6)}:</p>
                        <input
                          type="text"
                          value={cancelKotReason}
                          onChange={(e) => setCancelKotReason(e.target.value)}
                          placeholder="e.g. Customer changed mind, Out of stock..."
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setCancelKotId(null)}
                            className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-bold text-xs"
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmCancelKot(kot.id)}
                            className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                          >
                            Confirm Cancel KOT
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Items inside KOT */}
                    <div className="space-y-1 text-slate-300">
                      {kot.items.map((kItem, kIdx) => (
                        <div key={kIdx} className="flex justify-between items-center">
                          <span>
                            <strong className="text-white">{kItem.quantity}x</strong>{' '}
                            {kItem.shortNameSnapshot || kItem.nameSnapshot}
                          </span>
                          {kItem.notes && <span className="text-amber-400 text-[11px] italic">({kItem.notes})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cancel Order Action */}
          {order.status !== 'cancelled' && order.status !== 'completed' && onCancelOrder && (
            <div className="pt-4 border-t border-slate-800">
              {!showCancelOrderInput ? (
                <button
                  type="button"
                  data-testid="btn-show-cancel-order"
                  onClick={() => setShowCancelOrderInput(true)}
                  className="w-full py-2.5 rounded-xl bg-slate-950 border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" />
                  <span>Cancel Entire Order</span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-3">
                  <h5 className="font-bold text-rose-300 text-xs">Confirm Order Cancellation:</h5>
                  <input
                    type="text"
                    value={cancelOrderReason}
                    onChange={(e) => setCancelOrderReason(e.target.value)}
                    placeholder="Enter reason for cancelling order..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCancelOrderInput(false)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                    >
                      Keep Order
                    </button>
                    <button
                      type="button"
                      data-testid="btn-confirm-cancel-order"
                      disabled={isSubmitting}
                      onClick={handleConfirmCancelOrder}
                      className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors"
                    >
                      Confirm Cancel Order
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

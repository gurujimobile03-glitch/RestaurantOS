import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Building2,
  Calendar,
  Send,
  PackageCheck,
  XCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Layers,
  Phone,
  Mail,
  FileText
} from 'lucide-react';
import {
  PurchaseOrder,
  PurchaseReceiving,
  PurchaseOrderStatus
} from '../../types/purchaseOrder';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { formatMoney } from '../../utils/money';
import { ReceiveGoodsModal } from './ReceiveGoodsModal';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

interface PurchaseOrderDetailsModalProps {
  restaurantId: string;
  purchaseOrderId: string;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated: () => void;
}

export const PurchaseOrderDetailsModal: React.FC<PurchaseOrderDetailsModalProps> = ({
  restaurantId,
  purchaseOrderId,
  isOpen,
  onClose,
  onOrderUpdated
}) => {
  const { profile } = useAuth();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [receivingHistory, setReceivingHistory] = useState<PurchaseReceiving[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);

  const canManagePurchases = hasPermission(profile?.role, 'manage_purchases');
  const canReceivePurchases = hasPermission(profile?.role, 'receive_purchases');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [orderData, history] = await Promise.all([
        purchaseOrderService.getPurchaseOrder(restaurantId, purchaseOrderId),
        purchaseOrderService.getReceivingHistory(restaurantId, purchaseOrderId)
      ]);
      setPo(orderData);
      setReceivingHistory(history);
    } catch (err: any) {
      setError(err?.message || 'Failed to load purchase order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [restaurantId, purchaseOrderId, isOpen]);

  if (!isOpen) return null;

  const handleSubmitPO = async () => {
    if (!po) return;
    if (!window.confirm(`Submit purchase order ${po.orderNumber} to supplier?`)) return;

    try {
      setActionLoading(true);
      setError(null);
      const updated = await purchaseOrderService.submitPurchaseOrder(
        restaurantId,
        po.purchaseOrderId
      );
      setPo(updated);
      onOrderUpdated();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit purchase order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelPO = async () => {
    if (!po) return;
    const reason = window.prompt('Please enter a cancellation reason:');
    if (reason === null) return; // User cancelled prompt

    try {
      setActionLoading(true);
      setError(null);
      const updated = await purchaseOrderService.cancelPurchaseOrder(
        restaurantId,
        po.purchaseOrderId,
        reason
      );
      setPo(updated);
      onOrderUpdated();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel purchase order');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Draft
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60">
            <Send className="w-3.5 h-3.5" />
            Submitted
          </span>
        );
      case 'partiallyReceived':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60">
            <PackageCheck className="w-3.5 h-3.5" />
            Partially Received
          </span>
        );
      case 'received':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Received (Complete)
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
            <XCircle className="w-3.5 h-3.5" />
            Cancelled
          </span>
        );
    }
  };

  const hasReceivedAnyGoods = po ? po.items.some(i => i.receivedQuantity > 0) : false;
  const canCancel =
    canManagePurchases &&
    po &&
    (po.status === 'draft' || po.status === 'submitted') &&
    !hasReceivedAnyGoods;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {po?.orderNumber || 'Purchase Order'}
                </h2>
                {po && getStatusBadge(po.status)}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Detailed record of purchase procurement and fulfillment history
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading || !po ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              Loading purchase order details...
            </div>
          ) : (
            <>
              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supplier Card */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Supplier Information
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {po.supplierSnapshot.name}
                  </div>
                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{po.supplierSnapshot.phone}</span>
                    </div>
                    {po.supplierSnapshot.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{po.supplierSnapshot.email}</span>
                      </div>
                    )}
                    {po.supplierSnapshot.gstNumber && (
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span>GST: {po.supplierSnapshot.gstNumber}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dates & Logistics Card */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Order Timings
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block">Order Date:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {po.orderDate}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Expected Delivery:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {po.expectedDate || 'Not specified'}
                      </span>
                    </div>
                  </div>
                  {po.notes && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                      <span className="text-slate-400 block">Notes:</span>
                      <p className="text-slate-700 dark:text-slate-300 italic">{po.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Purchased Items ({po.items.length})
                </h3>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase">
                      <tr>
                        <th className="px-4 py-2.5">Item Name</th>
                        <th className="px-4 py-2.5 text-right">Ordered</th>
                        <th className="px-4 py-2.5 text-right">Received</th>
                        <th className="px-4 py-2.5 text-right">Remaining</th>
                        <th className="px-4 py-2.5 text-right">Unit Price</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {po.items.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {item.itemNameSnapshot}
                            </div>
                            {item.skuSnapshot && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                SKU: {item.skuSnapshot}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.quantityOrdered} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.receivedQuantity} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                            {item.remainingQuantity} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-300">
                            {formatMoney(item.unitPriceMinor)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {formatMoney(item.lineTotalMinor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50/80 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 font-medium">
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-right text-slate-500">
                          Subtotal:
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {formatMoney(po.subtotalMinor)}
                        </td>
                      </tr>
                      {po.taxMinor > 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-1.5 text-right text-slate-500">
                            Tax / GST:
                          </td>
                          <td className="px-4 py-1.5 text-right font-mono font-semibold text-slate-900 dark:text-white">
                            {formatMoney(po.taxMinor)}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-slate-200 dark:border-slate-700 text-sm font-bold">
                        <td colSpan={5} className="px-4 py-2.5 text-right text-slate-900 dark:text-white">
                          Grand Total:
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-indigo-600 dark:text-indigo-400 text-base">
                          {formatMoney(po.grandTotalMinor)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Receiving History Section */}
              {receivingHistory.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-emerald-500" />
                    <span>Intake History & Ledger Logs ({receivingHistory.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {receivingHistory.map((rec, idx) => (
                      <div
                        key={rec.receivingId}
                        className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Receiving #{idx + 1}
                          </span>
                          <span className="font-mono text-slate-400 text-[11px]">
                            {rec.createdAt?.toDate ? rec.createdAt.toDate().toLocaleString() : 'Just now'}
                          </span>
                        </div>

                        {rec.notes && (
                          <p className="text-slate-500 text-[11px] italic">
                            Challan/Note: {rec.notes}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {rec.items.map(it => (
                            <span
                              key={it.purchaseOrderItemId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono text-[11px]"
                            >
                              <strong>+{it.quantityReceived} {it.unit}</strong> {it.itemNameSnapshot}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions Footer */}
        {po && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
            <div>
              {canCancel && (
                <button
                  onClick={handleCancelPO}
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors"
                >
                  Cancel Order
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Close
              </button>

              {/* Submit Draft */}
              {canManagePurchases && po.status === 'draft' && (
                <button
                  onClick={handleSubmitPO}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md shadow-blue-600/20 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit to Supplier</span>
                </button>
              )}

              {/* Receive Goods */}
              {canReceivePurchases &&
                (po.status === 'submitted' || po.status === 'partiallyReceived') && (
                  <button
                    onClick={() => setReceiveModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-colors"
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>Receive Goods</span>
                  </button>
                )}
            </div>
          </div>
        )}

        {/* Receive Goods Submodal */}
        {receiveModalOpen && po && (
          <ReceiveGoodsModal
            restaurantId={restaurantId}
            purchaseOrder={po}
            isOpen={receiveModalOpen}
            onClose={() => setReceiveModalOpen(false)}
            onSuccess={updatedPO => {
              setPo(updatedPO);
              loadData();
              onOrderUpdated();
            }}
          />
        )}
      </div>
    </div>
  );
};

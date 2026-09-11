import React, { useState } from 'react';
import {
  X,
  PackageCheck,
  AlertCircle,
  Building2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import { PurchaseOrder, ReceiveGoodsDTO, ReceiveGoodsItemDTO } from '../../types/purchaseOrder';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { roundQuantity } from '../../utils/units';

interface ReceiveGoodsModalProps {
  restaurantId: string;
  purchaseOrder: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedPO: PurchaseOrder) => void;
}

export const ReceiveGoodsModal: React.FC<ReceiveGoodsModalProps> = ({
  restaurantId,
  purchaseOrder,
  isOpen,
  onClose,
  onSuccess
}) => {
  // Initialize receiving quantities with current remaining quantities
  const [receivingQuantities, setReceivingQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    purchaseOrder.items.forEach(item => {
      init[item.id] = item.remainingQuantity > 0 ? item.remainingQuantity : 0;
    });
    return init;
  });

  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQtyChange = (itemId: string, val: number) => {
    setReceivingQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, val)
    }));
  };

  const handleReceiveAllRemaining = () => {
    const full: Record<string, number> = {};
    purchaseOrder.items.forEach(item => {
      full[item.id] = item.remainingQuantity > 0 ? item.remainingQuantity : 0;
    });
    setReceivingQuantities(full);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const receiveItems: ReceiveGoodsItemDTO[] = [];
    for (const poItem of purchaseOrder.items) {
      const qty = roundQuantity(receivingQuantities[poItem.id] || 0);
      if (qty < 0) {
        setError(`Received quantity for "${poItem.itemNameSnapshot}" cannot be negative`);
        return;
      }
      if (qty > poItem.remainingQuantity) {
        setError(
          `Cannot receive ${qty} ${poItem.unit} for "${poItem.itemNameSnapshot}". Maximum remaining is ${poItem.remainingQuantity} ${poItem.unit}. Over-receiving rejected.`
        );
        return;
      }
      if (qty > 0) {
        receiveItems.push({
          purchaseOrderItemId: poItem.id,
          quantityReceived: qty
        });
      }
    }

    if (receiveItems.length === 0) {
      setError('Please enter a received quantity > 0 for at least one item');
      return;
    }

    try {
      setLoading(true);
      const res = await purchaseOrderService.receiveGoods(restaurantId, {
        purchaseOrderId: purchaseOrder.purchaseOrderId,
        items: receiveItems,
        notes: notes.trim() || undefined
      });

      onSuccess(res.purchaseOrder);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record goods receiving');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Receive Goods</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  {purchaseOrder.orderNumber}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Log goods intake, verify quantities, and update stock ledger atomically
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-start gap-2.5 text-rose-600 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* PO Metadata Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 text-xs">
            <div>
              <span className="text-slate-500 block">Supplier:</span>
              <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {purchaseOrder.supplierSnapshot.name}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Order Date:</span>
              <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {purchaseOrder.orderDate}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Current Status:</span>
              <span className="font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mt-0.5 block">
                {purchaseOrder.status}
              </span>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Items Verification ({purchaseOrder.items.length})
              </h3>
              <button
                type="button"
                onClick={handleReceiveAllRemaining}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Fill All Remaining
              </button>
            </div>

            <div className="space-y-2">
              {purchaseOrder.items.map(item => {
                const receivingVal = receivingQuantities[item.id] ?? 0;
                const isOver = receivingVal > item.remainingQuantity;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-colors ${
                      isOver
                        ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900'
                        : item.remainingQuantity === 0
                        ? 'bg-slate-50/50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-800 opacity-60'
                        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-900 dark:text-white">
                          {item.itemNameSnapshot}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                          <span>Ordered: <strong>{item.quantityOrdered}</strong> {item.unit}</span>
                          <span>Received: <strong>{item.receivedQuantity}</strong> {item.unit}</span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                            Remaining: <strong>{item.remainingQuantity}</strong> {item.unit}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Receive:
                        </label>
                        <div className="relative w-28">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            max={item.remainingQuantity}
                            value={receivingVal}
                            onChange={e =>
                              handleQtyChange(item.id, parseFloat(e.target.value) || 0)
                            }
                            disabled={item.remainingQuantity === 0}
                            className={`w-full px-2 py-1.5 text-xs text-right font-mono font-bold rounded-lg border focus:outline-none focus:ring-2 ${
                              isOver
                                ? 'border-rose-500 focus:ring-rose-500 text-rose-600 bg-rose-50'
                                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-emerald-500'
                            }`}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-500">{item.unit}</span>
                      </div>
                    </div>

                    {isOver && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">
                        Cannot receive more than remaining balance ({item.remainingQuantity} {item.unit})
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Receiving Notes / Delivery Challan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Receiving Note / Delivery Challan #
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Delivery challan DC-84920, vehicle MH04-1234, temperature verified"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Notice */}
          <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
            <PackageCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Submitting this intake will atomically create signed <strong>stock_in</strong> ledger movements and update catalog on-hand quantities immediately.
            </span>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-md shadow-emerald-600/20 transition-colors"
            >
              <PackageCheck className="w-4 h-4" />
              <span>{loading ? 'Receiving...' : 'Record Received Goods'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

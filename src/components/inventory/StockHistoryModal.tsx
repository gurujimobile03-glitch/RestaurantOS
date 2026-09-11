import React, { useState, useEffect } from 'react';
import {
  History,
  RotateCcw,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  Scale
} from 'lucide-react';
import { InventoryItem, StockMovement, StockMovementType, StockReconciliationSummary } from '../../types/inventory';
import { inventoryService } from '../../services/inventoryService';
import { formatQuantityWithUnit } from '../../utils/units';

interface StockHistoryModalProps {
  restaurantId: string;
  item: InventoryItem;
  canManage: boolean;
  onClose: () => void;
  onMovementReversed?: () => void;
}

export const StockHistoryModal: React.FC<StockHistoryModalProps> = ({
  restaurantId,
  item,
  canManage,
  onClose,
  onMovementReversed
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Reconciliation summary
  const [reconciliation, setReconciliation] = useState<StockReconciliationSummary | null>(null);
  const [reconciling, setReconciling] = useState<boolean>(false);

  // Reversal confirmation state
  const [reversalTarget, setReversalTarget] = useState<StockMovement | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [reversing, setReversing] = useState<boolean>(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const fetchHistoryAndReconcile = async () => {
    if (!restaurantId || !item) return;
    setLoading(true);
    setError(null);
    try {
      const [movs, rec] = await Promise.all([
        inventoryService.listStockMovements(restaurantId, item.id, 50),
        inventoryService.reconcileStockForItem(restaurantId, item.id)
      ]);
      setMovements(movs);
      setReconciliation(rec);
    } catch (err: any) {
      console.error('Failed to load stock movements history:', err);
      setError(err.message || 'Failed to load stock history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoryAndReconcile();
  }, [restaurantId, item.id]);

  const handleConfirmReversal = async () => {
    if (!reversalTarget) return;
    setReversing(true);
    setReversalError(null);
    try {
      await inventoryService.reverseStockMovement(
        restaurantId,
        reversalTarget.id,
        reversalReason.trim() || `Reversal of movement ${reversalTarget.id}`
      );
      setReversalTarget(null);
      setReversalReason('');
      await fetchHistoryAndReconcile();
      if (onMovementReversed) onMovementReversed();
    } catch (err: any) {
      console.error('Failed to reverse stock movement:', err);
      setReversalError(err.message || 'Failed to reverse movement');
    } finally {
      setReversing(false);
    }
  };

  const getTypeBadge = (type: StockMovementType) => {
    switch (type) {
      case 'opening':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Opening</span>;
      case 'stock_in':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">+ Stock In</span>;
      case 'stock_out':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">- Stock Out</span>;
      case 'adjustment':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">Physical Count</span>;
      case 'wastage':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">Wastage</span>;
      case 'damage':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">Damage</span>;
      case 'correction':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">Correction</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">{type}</span>;
    }
  };

  return (
    <div
      id="modal-stock-movement-history"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-800" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Stock Movement Audit History</h2>
              <p className="text-xs text-slate-500 font-medium">
                {item.name} — Current Balance: {formatQuantityWithUnit(item.currentQuantity, item.unit)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-md p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reconciliation Status Banner */}
        {reconciliation && (
          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-slate-600" />
              <span className="font-semibold text-slate-700">Ledger Invariant Check:</span>
              {reconciliation.isReconciled ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  100% Reconciled (Zero Discrepancy)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                  Discrepancy: {reconciliation.discrepancy} {item.unit}
                </span>
              )}
            </div>
            <div className="font-mono text-slate-600 text-[11px]">
              In: +{reconciliation.totalInflow} | Out: -{reconciliation.totalOutflow}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body List */}
        <div className="overflow-y-auto py-4 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mb-2" />
              <p className="text-xs text-slate-500">Loading audit history...</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium text-slate-600">No stock movements recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {movements.map(m => {
                let dateStr = 'Just now';
                if (m.createdAt) {
                  const d = typeof m.createdAt.toDate === 'function' ? m.createdAt.toDate() : new Date(m.createdAt);
                  dateStr = d.toLocaleString();
                }

                const delta = typeof m.delta === 'number'
                  ? m.delta
                  : (m.type === 'stock_out' || m.type === 'wastage' || m.type === 'damage' ? -m.quantity : m.quantity);

                const isReversed = Boolean(m.reversedByMovementId);
                const isReversalCompensating = Boolean(m.reversalOfMovementId);

                return (
                  <div
                    key={m.id}
                    id={`movement-audit-entry-${m.id}`}
                    className={`p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      isReversed ? 'opacity-60 bg-slate-100/60' : ''
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getTypeBadge(m.type)}
                        <span
                          className={`font-mono font-bold ${
                            delta > 0
                              ? 'text-emerald-700'
                              : delta < 0
                                ? 'text-rose-700'
                                : 'text-slate-700'
                          }`}
                        >
                          {delta > 0 ? `+${delta}` : delta} {m.unit}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-500 text-[11px]">{dateStr}</span>
                      </div>
                      {m.reason && (
                        <p className="text-slate-600 italic">“{m.reason}”</p>
                      )}
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span>Actor: {m.actorUid ? m.actorUid.slice(0, 8) : 'system'}</span>
                        {isReversed && (
                          <span className="text-slate-500 bg-slate-200 px-1 rounded">Reversed</span>
                        )}
                        {isReversalCompensating && (
                          <span className="text-indigo-600 bg-indigo-50 px-1 rounded">Compensating</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:border-l sm:border-slate-200 sm:pl-4">
                      <div className="text-right">
                        <div className="text-slate-400 text-[10px] uppercase font-semibold">Shift</div>
                        <div className="font-mono font-semibold text-slate-700">
                          {m.previousQuantity} →{' '}
                          <span className="text-slate-900 font-bold">{m.resultingQuantity}</span> {m.unit}
                        </div>
                      </div>

                      {canManage && !isReversed && m.type !== 'opening' && (
                        <button
                          type="button"
                          id={`btn-reverse-item-movement-${m.id}`}
                          onClick={() => setReversalTarget(m)}
                          className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded border border-rose-200 transition-colors"
                          title="Reverse this movement"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 flex justify-end shrink-0">
          <button
            id="btn-close-history"
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>

      {/* Reversal Confirmation Modal */}
      {reversalTarget && (
        <div
          id="modal-reverse-movement-inline-confirm"
          className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <RotateCcw className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Reverse Movement?</h3>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              This will create a compensating correction movement that inverts the delta of{' '}
              <strong className="text-slate-900 font-mono">
                {reversalTarget.delta > 0 ? `+${reversalTarget.delta}` : reversalTarget.delta} {reversalTarget.unit}
              </strong>
              .
            </p>

            {reversalError && (
              <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{reversalError}</span>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
                Reason for Reversal *
              </label>
              <input
                id="input-inline-reversal-reason"
                type="text"
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                placeholder="e.g. Correcting double entry"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReversalTarget(null);
                  setReversalReason('');
                  setReversalError(null);
                }}
                disabled={reversing}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-inline-reversal"
                onClick={handleConfirmReversal}
                disabled={reversing}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {reversing && <RefreshCw className="w-3 h-3 animate-spin" />}
                Confirm Reversal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

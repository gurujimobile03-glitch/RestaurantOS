import React, { useState, useEffect } from 'react';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  AlertCircle,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { InventoryItem, StockReconciliationSummary } from '../../types/inventory';
import { inventoryService } from '../../services/inventoryService';
import { formatQuantityWithUnit } from '../../utils/units';

interface StockReconciliationViewProps {
  restaurantId: string;
  items: InventoryItem[];
  canManage: boolean;
  onOpenAdjustment: (item: InventoryItem) => void;
}

export const StockReconciliationView: React.FC<StockReconciliationViewProps> = ({
  restaurantId,
  items,
  canManage,
  onOpenAdjustment
}) => {
  const [reconciliations, setReconciliations] = useState<Record<string, StockReconciliationSummary>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [reconcilingItemId, setReconcilingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reconcileAll = async () => {
    if (!restaurantId || items.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const results: Record<string, StockReconciliationSummary> = {};
      // Run batch reconciliations across items
      for (const it of items) {
        if (!it.active) continue;
        const rec = await inventoryService.reconcileStockForItem(restaurantId, it.id);
        results[it.id] = rec;
      }
      setReconciliations(results);
    } catch (err: any) {
      console.error('Failed to run stock reconciliation:', err);
      setError(err.message || 'Failed to reconcile stock');
    } finally {
      setLoading(false);
    }
  };

  const reconcileSingleItem = async (itemId: string) => {
    if (!restaurantId) return;
    setReconcilingItemId(itemId);
    try {
      const rec = await inventoryService.reconcileStockForItem(restaurantId, itemId);
      setReconciliations(prev => ({ ...prev, [itemId]: rec }));
    } catch (err: any) {
      console.error('Failed to reconcile item:', err);
      setError(err.message || 'Failed to reconcile item');
    } finally {
      setReconcilingItemId(null);
    }
  };

  useEffect(() => {
    reconcileAll();
  }, [restaurantId, items.length]);

  const totalDiscrepancies = (Object.values(reconciliations) as StockReconciliationSummary[]).filter(
    r => !r.isReconciled
  ).length;
  const totalChecked = Object.keys(reconciliations).length;

  return (
    <div id="stock-reconciliation-root" className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-5 h-5 text-slate-800" />
            Stock Reconciliation & Ledger Integrity
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Verifies that <span className="font-mono text-slate-700 font-medium">Opening Balance + Total Inflow - Total Outflow</span> strictly equals Current Stock.
          </p>
        </div>
        <button
          type="button"
          onClick={reconcileAll}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Run Full Reconciliation
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Items Evaluated</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalChecked} items</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Across active catalog</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-emerald-600">Perfect Audit Match</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {totalChecked - totalDiscrepancies} / {totalChecked}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-0.5">100% ledger balance parity</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-amber-600">Discrepancies Flagged</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{totalDiscrepancies}</div>
          <div className="text-[11px] text-amber-600/80 mt-0.5">Require physical count adjustment</div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Reconciliation Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4 text-right">Opening</th>
                <th className="py-3 px-4 text-right">Total Inflow (+)</th>
                <th className="py-3 px-4 text-right">Total Outflow (-)</th>
                <th className="py-3 px-4 text-right">Calculated Balance</th>
                <th className="py-3 px-4 text-right">Current System Stock</th>
                <th className="py-3 px-4 text-center">Audit Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.filter(i => i.active).map(it => {
                const rec = reconciliations[it.id];
                const isItemReconciling = reconcilingItemId === it.id;

                return (
                  <tr
                    key={it.id}
                    id={`reconciliation-row-${it.id}`}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{it.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {it.sku || 'No SKU'} • {rec ? `${rec.movementsCount} movements` : 'Loading...'}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      {rec ? `${rec.openingQuantity} ${it.unit}` : '—'}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-emerald-700 font-medium">
                      {rec ? `+${rec.totalInflow} ${it.unit}` : '—'}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-rose-700 font-medium">
                      {rec ? `-${rec.totalOutflow} ${it.unit}` : '—'}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                      {rec ? `${rec.calculatedQuantity} ${it.unit}` : '—'}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {formatQuantityWithUnit(it.currentQuantity, it.unit)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {!rec ? (
                        <span className="text-[10px] text-slate-400">Checking...</span>
                      ) : rec.isReconciled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Reconciled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Discrepancy ({rec.discrepancy > 0 ? `+${rec.discrepancy}` : rec.discrepancy} {it.unit})
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => reconcileSingleItem(it.id)}
                          disabled={isItemReconciling}
                          className="p-1 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 transition-colors"
                          title="Re-verify item ledger"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isItemReconciling ? 'animate-spin' : ''}`} />
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => onOpenAdjustment(it)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          >
                            <Sliders className="w-3 h-3" />
                            Stocktake
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

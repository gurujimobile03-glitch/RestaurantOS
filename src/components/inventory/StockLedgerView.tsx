import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  User,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Sliders,
  AlertTriangle,
  X
} from 'lucide-react';
import { StockMovement, StockMovementType, InventoryItem } from '../../types/inventory';
import { inventoryService } from '../../services/inventoryService';
import { formatQuantityWithUnit } from '../../utils/units';

interface StockLedgerViewProps {
  restaurantId: string;
  items: InventoryItem[];
  canManage: boolean;
  onRefreshItems?: () => void;
}

export const StockLedgerView: React.FC<StockLedgerViewProps> = ({
  restaurantId,
  items,
  canManage,
  onRefreshItems
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedItemId, setSelectedItemId] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Reversal modal state
  const [reversalTarget, setReversalTarget] = useState<StockMovement | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [reversing, setReversing] = useState<boolean>(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const itemMap = useMemo(() => {
    const map: Record<string, InventoryItem> = {};
    items.forEach(it => {
      map[it.id] = it;
    });
    return map;
  }, [items]);

  const fetchLedger = async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await inventoryService.queryStockLedger(restaurantId, {
        inventoryItemId: selectedItemId !== 'all' ? selectedItemId : undefined,
        type: selectedType !== 'all' ? (selectedType as StockMovementType) : undefined,
        startDate: startDate || undefined,
        endDate: endDate ? `${endDate}T23:59:59Z` : undefined,
        searchTerm: searchQuery || undefined,
        limit: 100
      });
      setMovements(res.movements);
    } catch (err: any) {
      console.error('Failed to load stock ledger:', err);
      setError(err.message || 'Failed to query stock ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [restaurantId, selectedItemId, selectedType, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLedger();
  };

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
      await fetchLedger();
      if (onRefreshItems) onRefreshItems();
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
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Opening
          </span>
        );
      case 'stock_in':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            + Stock In
          </span>
        );
      case 'stock_out':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            - Stock Out
          </span>
        );
      case 'adjustment':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            Physical Count
          </span>
        );
      case 'wastage':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            Wastage
          </span>
        );
      case 'damage':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Damage
          </span>
        );
      case 'correction':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Correction / Reversal
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div id="stock-ledger-view-root" className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-slate-800" />
            Stock Ledger & Movement Audit
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Authoritative, immutable transaction log tracking all physical counts, restocks, losses, and corrections.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchLedger}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Ledger
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Item Filter */}
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
              Filter by Item
            </label>
            <select
              id="select-ledger-item"
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">All Inventory Items</option>
              {items.map(it => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Movement Type Filter */}
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
              Movement Type
            </label>
            <select
              id="select-ledger-type"
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="all">All Movement Types</option>
              <option value="opening">Opening Stock</option>
              <option value="stock_in">Stock In</option>
              <option value="stock_out">Stock Out</option>
              <option value="adjustment">Physical Count / Adjustment</option>
              <option value="wastage">Wastage</option>
              <option value="damage">Damage</option>
              <option value="correction">Correction / Reversal</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
              From Date
            </label>
            <input
              id="input-ledger-start-date"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-600 mb-1">
              To Date
            </label>
            <input
              id="input-ledger-end-date"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Reason / Reference Search */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="input-ledger-search"
              type="text"
              placeholder="Search by reason, note, or movement ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Filter
          </button>
          {(selectedItemId !== 'all' || selectedType !== 'all' || startDate || endDate || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setSelectedItemId('all');
                setSelectedType('all');
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
            <p className="text-xs font-medium">Loading authoritative ledger entries...</p>
          </div>
        ) : movements.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium text-slate-600">No stock movements found matching filters.</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the date range or filters above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Item & SKU</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Delta</th>
                  <th className="py-3 px-4 text-right">Balance Shift</th>
                  <th className="py-3 px-4">Reason & Reference</th>
                  <th className="py-3 px-4">Actor</th>
                  {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map(m => {
                  const it = itemMap[m.inventoryItemId];
                  const itemName = it?.name || m.inventoryItemId;
                  const itemSku = it?.sku;
                  const delta = typeof m.delta === 'number'
                    ? m.delta
                    : (m.type === 'stock_out' || m.type === 'wastage' || m.type === 'damage' ? -m.quantity : m.quantity);

                  const isPositive = delta > 0;
                  const isNegative = delta < 0;

                  let dateStr = '—';
                  if (m.createdAt) {
                    const d = typeof m.createdAt.toDate === 'function' ? m.createdAt.toDate() : new Date(m.createdAt);
                    dateStr = d.toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  }

                  const isReversed = Boolean(m.reversedByMovementId);
                  const isReversalCompensating = Boolean(m.reversalOfMovementId);

                  return (
                    <tr
                      key={m.id}
                      id={`ledger-row-${m.id}`}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isReversed ? 'opacity-60 bg-slate-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {dateStr}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{itemName}</div>
                        {itemSku && <div className="text-[10px] text-slate-400 font-mono">{itemSku}</div>}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {getTypeBadge(m.type)}
                          {isReversed && (
                            <span className="text-[10px] text-slate-500 font-mono bg-slate-200 px-1 rounded">
                              Reversed
                            </span>
                          )}
                          {isReversalCompensating && (
                            <span className="text-[10px] text-indigo-600 font-mono bg-indigo-50 px-1 rounded border border-indigo-100">
                              Compensating
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold">
                        <span
                          className={
                            isPositive
                              ? 'text-emerald-700'
                              : isNegative
                                ? 'text-rose-700'
                                : 'text-slate-600'
                          }
                        >
                          {isPositive ? `+${delta}` : delta} {m.unit}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono text-[11px]">
                        <span className="text-slate-400">{m.previousQuantity}</span>
                        <span className="text-slate-300 mx-1">→</span>
                        <span className="font-bold text-slate-900">{m.resultingQuantity}</span>
                        <span className="text-slate-400 ml-0.5">{m.unit}</span>
                      </td>

                      <td className="py-3 px-4 max-w-xs truncate">
                        <div className="text-slate-700">{m.reason || '—'}</div>
                        {m.referenceId && (
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            Ref: {m.referenceType || 'manual'} • {m.referenceId}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 text-[11px] font-mono">
                        {m.actorUid ? m.actorUid.slice(0, 10) : 'system'}
                      </td>

                      {canManage && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {!isReversed && m.type !== 'opening' ? (
                            <button
                              type="button"
                              id={`btn-reverse-movement-${m.id}`}
                              onClick={() => setReversalTarget(m)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition-colors"
                              title="Create compensating correction reversal"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reverse
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reversal Confirmation Modal */}
      {reversalTarget && (
        <div
          id="modal-reverse-movement-confirm"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <RotateCcw className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">Reverse Stock Movement?</h3>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              This will create an authoritative compensating correction movement that inverts the original delta of{' '}
              <strong className="text-slate-900">
                {reversalTarget.delta > 0 ? `+${reversalTarget.delta}` : reversalTarget.delta} {reversalTarget.unit}
              </strong>
              . Historical ledger records remain strictly immutable.
            </p>

            {reversalError && (
              <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{reversalError}</span>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
                Reason for Correction / Reversal *
              </label>
              <input
                id="input-reversal-reason"
                type="text"
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                placeholder="e.g. Inadvertent double entry, Wrong batch counted"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                id="btn-cancel-reversal"
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
                id="btn-confirm-reversal"
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

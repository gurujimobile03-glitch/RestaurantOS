import React, { useState, useEffect, useMemo, useTransition } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  Boxes,
  Scale,
  RotateCcw,
  RefreshCw,
  ShoppingBag,
  Building2,
  PieChart,
  BarChart3,
  Calendar,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  Coins,
  Receipt,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { formatQuantityWithUnit, UNIT_CONFIG } from '../../utils/units';
import {
  inventoryAnalyticsService,
  getInventoryPresetBounds
} from '../../services/inventoryAnalyticsService';
import {
  AnalyticsDatePreset,
  InventoryAnalyticsSummary,
  MovementTypeSummary
} from '../../types/inventoryAnalytics';

export const InventoryAnalyticsDashboard: React.FC = () => {
  const { restaurant, formatPrice } = useRestaurant();
  const { profile } = useAuth();
  const [, startTransition] = useTransition();

  const restaurantId = restaurant?.restaurantId || '';
  const staffRole = profile?.role || 'owner';
  const isAuthorized =
    staffRole === 'owner' || staffRole === 'manager' || staffRole === 'accountant';

  // Date selection state
  const [datePreset, setDatePreset] = useState<AnalyticsDatePreset>('thisMonth');
  const [customStartStr, setCustomStartStr] = useState<string>('');
  const [customEndStr, setCustomEndStr] = useState<string>('');
  const [dateError, setDateError] = useState<string | null>(null);

  // Sub-tab selection within Analytics
  const [activeSection, setActiveSection] = useState<
    'overview' | 'movements' | 'consumption' | 'purchases' | 'health' | 'reconciliation'
  >('overview');

  // Data state
  const [summary, setSummary] = useState<InventoryAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Resolved date bounds
  const resolvedBounds = useMemo(() => {
    setDateError(null);

    if (datePreset !== 'custom') {
      return getInventoryPresetBounds(datePreset);
    }

    if (!customStartStr || !customEndStr) {
      return null;
    }

    const start = new Date(customStartStr);
    const end = new Date(customEndStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setDateError('Please enter valid dates.');
      return null;
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (start > end) {
      setDateError('Start date cannot be later than end date.');
      return null;
    }

    return {
      start,
      end,
      label: `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    };
  }, [datePreset, customStartStr, customEndStr]);

  // Fetch analytics data
  useEffect(() => {
    if (!restaurantId) return;
    if (!isAuthorized) return;
    if (!resolvedBounds) {
      setLoading(false);
      return;
    }

    let isCurrent = true;
    setLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const data = await inventoryAnalyticsService.fetchInventoryAnalytics(
          restaurantId,
          resolvedBounds.start,
          resolvedBounds.end
        );

        if (isCurrent) {
          startTransition(() => {
            setSummary(data);
            setLoading(false);
          });
        }
      } catch (err: any) {
        if (isCurrent) {
          console.error('[InventoryAnalyticsDashboard] Fetch failed:', err);
          setError(err?.message || 'Failed to load inventory intelligence analytics.');
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isCurrent = false;
    };
  }, [restaurantId, isAuthorized, resolvedBounds, refreshKey]);

  if (!isAuthorized) {
    return (
      <div
        id="inventory-analytics-unauthorized"
        className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md mx-auto text-center my-8 shadow-sm"
      >
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200/60">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1.5">Unauthorized Access</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Your active staff role ({staffRole}) is not authorized to view inventory analytics and valuation reports.
        </p>
      </div>
    );
  }

  return (
    <div id="inventory-analytics-root" className="space-y-6">
      {/* Top Filter & Date Selection Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900 tracking-tight font-display flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <span>Inventory Analytics & Stock Intelligence</span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Active Period: <span className="text-slate-800 font-bold font-mono">{resolvedBounds?.label || 'Custom'}</span>
          </p>
        </div>

        {/* Date Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(['today', 'yesterday', 'thisWeek', 'thisMonth', 'custom'] as const).map(preset => (
              <button
                key={preset}
                id={`btn-preset-${preset}`}
                type="button"
                onClick={() => setDatePreset(preset)}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all capitalize ${
                  datePreset === preset
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {preset === 'thisWeek' ? 'This Week' : preset === 'thisMonth' ? 'This Month' : preset}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                id="input-analytics-start-date"
                type="date"
                value={customStartStr}
                onChange={e => setCustomStartStr(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl py-1.5 px-3 font-semibold"
                aria-label="Start date"
              />
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <input
                id="input-analytics-end-date"
                type="date"
                value={customEndStr}
                onChange={e => setCustomEndStr(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl py-1.5 px-3 font-semibold"
                aria-label="End date"
              />
            </div>
          )}

          <button
            id="btn-refresh-analytics"
            type="button"
            onClick={() => setRefreshKey(prev => prev + 1)}
            title="Refresh analytics data"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Date Validation Error */}
      {dateError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="font-semibold">{dateError}</span>
        </div>
      )}

      {/* Section Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        {[
          { id: 'overview', label: 'Valuation & Catalog', icon: Coins },
          { id: 'movements', label: 'Ledger & Wastage', icon: TrendingUp },
          { id: 'consumption', label: 'Recipe & Dish Usage', icon: Sparkles },
          { id: 'purchases', label: 'Suppliers & Purchases', icon: Building2 },
          { id: 'health', label: 'Reorder & Stock Health', icon: AlertTriangle },
          { id: 'reconciliation', label: 'Audit & Reconciliation', icon: Scale }
        ].map(sec => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              id={`tab-analytics-sec-${sec.id}`}
              type="button"
              onClick={() => setActiveSection(sec.id as any)}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div id="analytics-loading-state" className="bg-white rounded-2xl border border-slate-200 p-16 text-center flex flex-col items-center justify-center min-h-[350px]">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-sm font-bold text-slate-800">Calculating Inventory Intelligence...</p>
          <p className="text-xs text-slate-400 mt-1">Auditing stock movements, recipe consumptions, and supplier orders</p>
        </div>
      ) : error ? (
        <div id="analytics-error-state" className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto flex flex-col items-center justify-center min-h-[250px]">
          <AlertCircle className="w-8 h-8 text-rose-500 mb-3" />
          <h3 className="text-base font-bold text-slate-900">Failed to Load Inventory Analytics</h3>
          <p className="text-xs text-slate-600 mt-1">{error}</p>
          <button
            type="button"
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700"
          >
            Retry Calculation
          </button>
        </div>
      ) : !summary ? null : (
        <div className="space-y-6">
          {/* SECTION 1: Valuation & Catalog Overview */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              {/* Top KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Inventory Valuation */}
                <div id="card-total-valuation" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total Stock Valuation
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Coins className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-black text-slate-900">
                      {formatPrice(summary.overview.totalValuationPaise / 100)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                    Calculated across {summary.overview.activeItems} active catalog items
                  </p>
                </div>

                {/* Healthy Stock Ratio */}
                <div id="card-stock-health" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Stock Health Score
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900">
                      {summary.health.stockHealthScorePercent}%
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">
                      ({summary.overview.healthyCount} / {summary.overview.activeItems} items)
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                    Items comfortably above minimum threshold
                  </p>
                </div>

                {/* Low Stock Alerts */}
                <div id="card-low-stock-alert" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Low Stock Alerts
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-black text-amber-600">
                      {summary.overview.lowStockCount}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                    Items at or below safety reorder level
                  </p>
                </div>

                {/* Out of Stock */}
                <div id="card-out-of-stock" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Critical Stockouts
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                      <XCircle className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-black text-rose-600">
                      {summary.overview.outOfStockCount}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                    Items completely depleted (0 stock)
                  </p>
                </div>
              </div>

              {/* Category Valuation Breakdown */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Inventory Valuation by Unit Dimension</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Distribution of stock capital across physical measurement categories</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {summary.overview.categoryDistribution.map(cat => (
                    <div key={cat.category} className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 capitalize">
                          {cat.category} ({cat.count} items)
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-900">
                          {cat.proportionPercent}%
                        </span>
                      </div>
                      <div className="text-lg font-black text-slate-900">
                        {formatPrice(cat.valuationPaise / 100)}
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all"
                          style={{ width: `${cat.proportionPercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: Stock Movements & Wastage Loss */}
          {activeSection === 'movements' && (
            <div className="space-y-6">
              {/* Movement Totals Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Stock Inflow</span>
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-2 text-xl font-black text-slate-900">
                    +{summary.movements.totalInflowQuantity} units
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Est. value: {formatPrice(summary.movements.totalInflowCostPaise / 100)}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Stock Outflow</span>
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="mt-2 text-xl font-black text-slate-900">
                    -{summary.movements.totalOutflowQuantity} units
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Est. value: {formatPrice(summary.movements.totalOutflowCostPaise / 100)}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Quantity Delta</span>
                    <Scale className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className={`mt-2 text-xl font-black ${summary.movements.netQuantityChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {summary.movements.netQuantityChange >= 0 ? '+' : ''}{summary.movements.netQuantityChange} units
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Over period ({summary.movements.totalMovementsCount} ledger events)</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Wastage & Damage</span>
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="mt-2 text-xl font-black text-rose-600">
                    {formatPrice(summary.movements.wastageDamage.totalLossCostPaise / 100)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Wastage: {summary.movements.wastageDamage.totalWastageQuantity} | Damage: {summary.movements.wastageDamage.totalDamageQuantity}
                  </p>
                </div>
              </div>

              {/* Movement Type Breakdown Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Authoritative Ledger Movement Summary</h3>
                  <span className="text-xs text-slate-500">{summary.movements.totalMovementsCount} total records</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-white">
                        <th className="py-2.5 px-4">Movement Type</th>
                        <th className="py-2.5 px-4 text-right">Transactions</th>
                        <th className="py-2.5 px-4 text-right">Total Quantity</th>
                        <th className="py-2.5 px-4 text-right">Est. Cost Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(Object.values(summary.movements.movementsByType) as MovementTypeSummary[]).map(m => (
                        <tr key={m.type} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-4 font-semibold text-slate-800 capitalize">
                            {m.type.replace('_', ' ')}
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{m.count}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-medium text-slate-900">{m.totalQuantity}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {formatPrice(m.estimatedCostPaise / 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Wastage & Damage Loss Item Breakdown */}
              {summary.movements.wastageDamage.itemBreakdown.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-rose-50/50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Itemized Wastage & Damage Loss Intelligence</span>
                    </h3>
                    <span className="text-xs font-bold text-rose-700">
                      Total Loss: {formatPrice(summary.movements.wastageDamage.totalLossCostPaise / 100)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-white">
                          <th className="py-2.5 px-4">Item Name</th>
                          <th className="py-2.5 px-4 text-right">Wastage Qty</th>
                          <th className="py-2.5 px-4 text-right">Damage Qty</th>
                          <th className="py-2.5 px-4 text-right">Total Value Lost</th>
                          <th className="py-2.5 px-4">Recorded Reasons</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.movements.wastageDamage.itemBreakdown.map(loss => (
                          <tr key={loss.itemId} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-4 font-semibold text-slate-900">{loss.itemName}</td>
                            <td className="py-2.5 px-4 text-right text-slate-600">
                              {loss.wastageQuantity > 0 ? formatQuantityWithUnit(loss.wastageQuantity, loss.unit) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-600">
                              {loss.damageQuantity > 0 ? formatQuantityWithUnit(loss.damageQuantity, loss.unit) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-rose-700 font-mono">
                              {formatPrice(loss.totalLossCostPaise / 100)}
                            </td>
                            <td className="py-2.5 px-4 text-slate-500">
                              {loss.reasons.length > 0 ? loss.reasons.join(', ') : 'Unspecified'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: Recipe & Dish Consumption Usage */}
          {activeSection === 'consumption' && (
            <div className="space-y-6">
              {/* Consumption KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Consumption Events</span>
                  <div className="mt-2 text-xl font-black text-slate-900">
                    {summary.consumption.totalConsumptionsCount} records
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Automatic recipe deductions</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Ingredient Cost</span>
                  <div className="mt-2 text-xl font-black text-indigo-600">
                    {formatPrice(summary.consumption.totalConsumedCostPaise / 100)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Derived from active inventory costs</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reversal & Return Value</span>
                  <div className="mt-2 text-xl font-black text-slate-900">
                    {formatPrice(summary.consumption.totalReversedCostPaise / 100)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{summary.consumption.totalReversedConsumptions} orders cancelled/refunded</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net COGS (Ingredients)</span>
                  <div className="mt-2 text-xl font-black text-emerald-600">
                    {formatPrice(summary.consumption.netConsumptionCostPaise / 100)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Reversal rate: {summary.consumption.reversalRatePercent}%</p>
                </div>
              </div>

              {/* Tables: Top Consumed Ingredients & Top Prepared Dishes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Consumed Ingredients */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Top Consumed Ingredients</h3>
                    <span className="text-xs text-slate-500">By ingredient cost</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-white">
                          <th className="py-2.5 px-4">Ingredient</th>
                          <th className="py-2.5 px-4 text-right">Qty Consumed</th>
                          <th className="py-2.5 px-4 text-right">Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.consumption.topConsumedItems.slice(0, 10).map(item => (
                          <tr key={item.inventoryItemId} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-slate-900">{item.itemName}</div>
                              <div className="text-[10px] text-slate-400">{item.orderCount} orders • {item.distinctRecipesCount} recipes</div>
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                              {formatQuantityWithUnit(item.totalQuantityConsumed, item.unit)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                              {formatPrice(item.estimatedCostPaise / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Prepared Dishes */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Top Menu Items by Ingredient Cost</h3>
                    <span className="text-xs text-slate-500">Dish recipe totals</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-white">
                          <th className="py-2.5 px-4">Menu Item</th>
                          <th className="py-2.5 px-4 text-right">Portions</th>
                          <th className="py-2.5 px-4 text-right">Total Cost</th>
                          <th className="py-2.5 px-4 text-right">Avg / Portion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.consumption.topDishes.slice(0, 10).map(dish => (
                          <tr key={dish.menuItemId} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-4 font-semibold text-slate-900">{dish.menuItemName}</td>
                            <td className="py-2.5 px-4 text-right text-slate-700">{dish.totalPortionsPrepared}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                              {formatPrice(dish.estimatedTotalIngredientCostPaise / 100)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                              {formatPrice(dish.averageCostPerPortionPaise / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 4: Suppliers & Purchase Orders */}
          {activeSection === 'purchases' && (
            <div className="space-y-6">
              {/* Purchase KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Purchase Orders</span>
                  <div className="mt-2 text-xl font-black text-slate-900">
                    {summary.purchases.totalPurchaseOrders} POs
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Issued in period</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Spend</span>
                  <div className="mt-2 text-xl font-black text-indigo-600">
                    {formatPrice(summary.purchases.totalSpendPaise / 100)}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Excluding cancelled POs</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fulfillment Rate</span>
                  <div className="mt-2 text-xl font-black text-emerald-600">
                    {summary.purchases.fulfillment.fulfillmentRatePercent}%
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {summary.purchases.fulfillment.totalReceivedQuantity} / {summary.purchases.fulfillment.totalOrderedQuantity} units received
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Goods Receiving</span>
                  <div className="mt-2 text-xl font-black text-amber-600">
                    {summary.purchases.fulfillment.pendingOrdersCount} POs
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Submitted or partially received</p>
                </div>
              </div>

              {/* Supplier Spend Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Supplier Procurement Volume & Spend</h3>
                  <span className="text-xs text-slate-500">{summary.purchases.supplierBreakdown.length} active vendors</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-white">
                        <th className="py-2.5 px-4">Supplier Name</th>
                        <th className="py-2.5 px-4 text-right">Orders</th>
                        <th className="py-2.5 px-4 text-right">Total Procurement Value</th>
                        <th className="py-2.5 px-4 text-right">Fulfillment Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summary.purchases.supplierBreakdown.map(sup => (
                        <tr key={sup.supplierId} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-4 font-semibold text-slate-900">{sup.supplierName}</td>
                          <td className="py-2.5 px-4 text-right text-slate-600">{sup.poCount}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {formatPrice(sup.totalSpendPaise / 100)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <span className={`font-semibold ${sup.fulfillmentRatePercent >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {sup.fulfillmentRatePercent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: Stock Health & Smart Reorder Recommendations */}
          {activeSection === 'health' && (
            <div className="space-y-6">
              {/* Recommendations Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Intelligent Reorder Recommendations</h3>
                    <p className="text-xs text-slate-500">Computed based on safety stock thresholds and active stock deficits</p>
                  </div>
                  <span className="text-xs font-bold text-indigo-600">
                    {summary.health.recommendations.length} items requiring replenishment
                  </span>
                </div>

                {summary.health.recommendations.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800">All Stock Levels Healthy</p>
                    <p className="text-xs text-slate-400 mt-1">No items are currently below minimum alert quantities.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-white">
                          <th className="py-2.5 px-4">Urgency</th>
                          <th className="py-2.5 px-4">Item Name</th>
                          <th className="py-2.5 px-4 text-right">Current Stock</th>
                          <th className="py-2.5 px-4 text-right">Safety Min</th>
                          <th className="py-2.5 px-4 text-right">Suggested Reorder</th>
                          <th className="py-2.5 px-4 text-right">Est. Replenish Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.health.recommendations.map(rec => (
                          <tr key={rec.inventoryItemId} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-4">
                              {rec.urgency === 'critical' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                  <XCircle className="w-3 h-3" />
                                  Out of Stock
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  <AlertTriangle className="w-3 h-3" />
                                  Low Stock
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-900">
                              {rec.itemName}
                              {rec.sku && <span className="text-[10px] text-slate-400 ml-1 font-mono">({rec.sku})</span>}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-600">
                              {formatQuantityWithUnit(rec.currentQuantity, rec.unit)}
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-600">
                              {formatQuantityWithUnit(rec.minimumQuantity, rec.unit)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                              {formatQuantityWithUnit(rec.suggestedQuantity, rec.unit)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-indigo-600">
                              {formatPrice(rec.estimatedCostPaise / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 6: Audit & Stock Reconciliation */}
          {activeSection === 'reconciliation' && (
            <div className="space-y-6">
              {/* Reconciliation KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Audited Items</span>
                  <div className="mt-2 text-xl font-black text-slate-900">
                    {summary.reconciliation.totalAuditedItems} items
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Audited against movement ledger</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ledger Accuracy Rate</span>
                  <div className="mt-2 text-xl font-black text-emerald-600">
                    {summary.reconciliation.accuracyRatePercent}%
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {summary.reconciliation.perfectlyReconciledCount} perfectly matched
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Discrepancies Detected</span>
                  <div className="mt-2 text-xl font-black text-amber-600">
                    {summary.reconciliation.discrepantCount} items
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Variance between ledger and stock</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit Status</span>
                  <div className="mt-2 text-xl font-black text-indigo-600">
                    {summary.reconciliation.discrepantCount === 0 ? 'Fully Reconciled' : 'Review Needed'}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Deterministic ledger verification</p>
                </div>
              </div>

              {/* Discrepancies Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Stock Discrepancy Breakdown</h3>
                  <span className="text-xs text-slate-500">Formula: Opening + Inflow - Outflow vs Current</span>
                </div>

                {summary.reconciliation.discrepancies.length === 0 ? (
                  <div className="p-12 text-center text-slate-500">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800">100% Ledger Consistency</p>
                    <p className="text-xs text-slate-400 mt-1">
                      All item stock counts match the sum of immutable ledger transactions.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-white">
                          <th className="py-2.5 px-4">Item Name</th>
                          <th className="py-2.5 px-4 text-right">Opening Qty</th>
                          <th className="py-2.5 px-4 text-right">Inflow</th>
                          <th className="py-2.5 px-4 text-right">Outflow</th>
                          <th className="py-2.5 px-4 text-right">Calculated</th>
                          <th className="py-2.5 px-4 text-right">Current Stock</th>
                          <th className="py-2.5 px-4 text-right">Variance</th>
                          <th className="py-2.5 px-4 text-right">Cost Variance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summary.reconciliation.discrepancies.map(item => (
                          <tr key={item.inventoryItemId} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-4 font-semibold text-slate-900">{item.itemName}</td>
                            <td className="py-2.5 px-4 text-right text-slate-600">{item.openingQuantity}</td>
                            <td className="py-2.5 px-4 text-right text-emerald-600">+{item.totalInflow}</td>
                            <td className="py-2.5 px-4 text-right text-rose-600">-{item.totalOutflow}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-slate-800">{item.calculatedQuantity}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">{item.currentQuantity}</td>
                            <td className={`py-2.5 px-4 text-right font-mono font-bold ${item.discrepancy > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {item.discrepancy > 0 ? '+' : ''}{item.discrepancy} {item.unit}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                              {formatPrice(item.discrepancyCostPaise / 100)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import {
  analyticsService,
  AnalyticsSummary,
  getPresetDateBounds,
  parseToDate
} from '../../services/analyticsService';
import { subscribeToCategories, subscribeToMenuItems } from '../../services/menuService';
import { PopularItemsTable } from './PopularItemsTable';
import { TaxRevenueTable } from './TaxRevenueTable';
import { CategoryPerformanceTable } from './CategoryPerformanceTable';
import { Category, MenuItem } from '../../types/menu';
import {
  Calendar,
  AlertTriangle,
  RotateCcw,
  Wifi,
  WifiOff,
  TrendingUp,
  ShoppingBag,
  FileSpreadsheet,
  Ban,
  Percent,
  Coins,
  Receipt,
  Layers,
  Sparkles,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export const ReportsDashboard: React.FC = () => {
  const { restaurant, formatPrice } = useRestaurant();
  const { profile } = useAuth();
  const [, startTransition] = useTransition();

  // Date Selection States
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'custom'>('thisMonth');
  const [customStartStr, setCustomStartStr] = useState<string>('');
  const [customEndStr, setCustomEndStr] = useState<string>('');
  const [dateError, setDateError] = useState<string | null>(null);

  // Firestore Mappings States
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Load / State metrics
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  // Network Connectivity State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Listen to network status
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Subscribe to Categories & Menu Items (Realtime)
  useEffect(() => {
    if (!restaurant?.restaurantId) return;

    const unsubCats = subscribeToCategories(restaurant.restaurantId, (cats) => {
      setCategories(cats);
    }, (err) => {
      console.error('[ReportsDashboard] Error subscribing to categories:', err);
    });

    const unsubItems = subscribeToMenuItems(restaurant.restaurantId, (items) => {
      setMenuItems(items);
    }, (err) => {
      console.error('[ReportsDashboard] Error subscribing to menu items:', err);
    });

    return () => {
      unsubCats();
      unsubItems();
    };
  }, [restaurant?.restaurantId]);

  // Map Category Helpers
  const { itemCategoryMap, categoryNamesMap } = useMemo(() => {
    const itemMap: Record<string, string> = {};
    const catMap: Record<string, string> = {};

    categories.forEach((cat) => {
      catMap[cat.categoryId] = cat.name;
    });

    menuItems.forEach((item) => {
      itemMap[item.itemId] = item.categoryId;
    });

    return { itemCategoryMap: itemMap, categoryNamesMap: catMap };
  }, [categories, menuItems]);

  // Compute boundaries based on preset or custom inputs
  const resolvedBounds = useMemo(() => {
    setDateError(null);

    if (datePreset !== 'custom') {
      const bounds = getPresetDateBounds(datePreset);
      return { start: bounds.start, end: bounds.end };
    }

    // Custom date validation
    if (!customStartStr || !customEndStr) {
      return null;
    }

    const startParsed = parseToDate(customStartStr);
    const endParsed = parseToDate(customEndStr);

    if (!startParsed || isNaN(startParsed.getTime())) {
      setDateError('Start date must be a valid calendar date.');
      return null;
    }

    if (!endParsed || isNaN(endParsed.getTime())) {
      setDateError('End date must be a valid calendar date.');
      return null;
    }

    // Ensure strict start of day for start, and end of day for end
    const startObj = new Date(startParsed);
    startObj.setHours(0, 0, 0, 0);

    const endObj = new Date(endParsed);
    endObj.setHours(23, 59, 59, 999);

    if (startObj > endObj) {
      setDateError('Start date cannot fall after the end date.');
      return null;
    }

    return { start: startObj, end: endObj };
  }, [datePreset, customStartStr, customEndStr]);

  // Fetch Report Data
  useEffect(() => {
    if (!restaurant?.restaurantId) return;
    if (!resolvedBounds) {
      setIsLoading(false);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setError(null);

    const loadData = async () => {
      try {
        const stats = await analyticsService.fetchAnalyticsForRange(
          restaurant.restaurantId,
          resolvedBounds.start,
          resolvedBounds.end,
          itemCategoryMap,
          categoryNamesMap
        );

        if (isCurrent) {
          startTransition(() => {
            setSummary(stats);
            setIsLoading(false);
          });
        }
      } catch (err: any) {
        if (isCurrent) {
          const isPerm = err?.code === 'permission-denied' || (err?.message && err.message.includes('permission'));
          if (isPerm) {
            console.warn('[ReportsDashboard] Report query restricted by backend security rules.');
            setError('Report data is restricted by backend security rules. Ensure firestore.rules are deployed in Firebase Console.');
          } else {
            console.error('[ReportsDashboard] Failed to fetch analytics summary:', err);
            setError(err?.message || 'Unauthorized or failed to connect to report database.');
          }
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isCurrent = false;
    };
  }, [restaurant?.restaurantId, resolvedBounds, itemCategoryMap, categoryNamesMap, retryTrigger]);

  const handleRetry = () => {
    setRetryTrigger((prev) => prev + 1);
  };

  // Helper to format date label
  const dateRangeLabel = useMemo(() => {
    if (!resolvedBounds) return 'Select a valid date range';
    const opt: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
    return `${resolvedBounds.start.toLocaleDateString(undefined, opt)} – ${resolvedBounds.end.toLocaleDateString(undefined, opt)}`;
  }, [resolvedBounds]);

  if (!restaurant) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-4">
        <p className="text-sm font-semibold text-slate-500 animate-pulse">Loading restaurant context...</p>
      </div>
    );
  }

  // Permission Closed Fallback
  const isFinanceAuthorized = profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'cashier' || profile?.role === 'accountant';
  if (!isFinanceAuthorized) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md mx-auto text-center my-12 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200/60">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1.5">Unauthorized Access</h2>
        <p className="text-xs text-slate-600 mb-0 leading-relaxed">
          Your active staff role ({profile?.role || 'Guest'}) does not have view_financial_info authorization.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Controls: Preset selector, validation bounds, status indicator */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-black text-slate-900 tracking-tight font-display">Financial & Performance Reports</h1>
            
            {/* Live Network Sync Badge */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
              isOnline 
                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              {isOnline ? 'Live Connected' : 'Offline Mode (Stale Data)'}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium truncate">
            Report Bounds: <span className="text-slate-800 font-bold font-mono">{dateRangeLabel}</span>
          </p>
        </div>

        {/* Range Select Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(['today', 'yesterday', 'thisWeek', 'thisMonth', 'custom'] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => setDatePreset(preset)}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-bold transition-all capitalize ${
                  datePreset === preset
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {preset === 'thisWeek' ? 'this week' : preset === 'thisMonth' ? 'this month' : preset}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {datePreset === 'custom' && (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative">
                <input
                  type="date"
                  value={customStartStr}
                  onChange={(e) => setCustomStartStr(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden py-1.5 pl-3 pr-8 font-semibold w-full sm:w-36"
                  placeholder="YYYY-MM-DD"
                  aria-label="Start date"
                />
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden sm:block shrink-0" />
              <div className="relative">
                <input
                  type="date"
                  value={customEndStr}
                  onChange={(e) => setCustomEndStr(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden py-1.5 pl-3 pr-8 font-semibold w-full sm:w-36"
                  placeholder="YYYY-MM-DD"
                  aria-label="End date"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Date validation error alert */}
      {dateError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="font-semibold">{dateError}</span>
        </div>
      )}

      {/* Loading view */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="relative w-10 h-10 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-slate-100" />
            <div className="absolute inset-0 rounded-full border-2 border-t-indigo-600 animate-spin" />
          </div>
          <p className="text-sm font-bold text-slate-800">Calculating analytics summary...</p>
          <p className="text-xs text-slate-400 mt-1">Aggregating historical order and tax ledger databases</p>
        </div>
      ) : error ? (
        /* Error & Retry View */
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-lg mx-auto flex flex-col items-center justify-center min-h-[300px]">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Failed to Load Performance Analytics</h3>
          <p className="text-xs text-slate-600 mt-2 max-w-sm leading-relaxed">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-6 inline-flex items-center gap-2 text-xs font-bold px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      ) : !summary || summary.orderCount === 0 ? (
        /* Proper Empty State */
        <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center max-w-xl mx-auto flex flex-col items-center justify-center min-h-[350px]">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-900 tracking-tight">No Financial Transactions Found</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-md leading-relaxed">
            There are no finalized orders or payment collections recorded within the selected range (<span className="font-semibold font-mono text-slate-700">{dateRangeLabel}</span>).
          </p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-md">
            Unsynchronized local drafts, hold carts, and active ongoing kitchen KOTs are strictly omitted from reporting sales.
          </p>
        </div>
      ) : (
        /* Loaded Dashboard Content */
        <div className="space-y-6">
          {/* Metrics Grid Cards: Strictly using values returned by the calculation engine */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Gross Revenue Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross Sales (Subtotal)</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Coins className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-xl font-black text-slate-900">{formatPrice(summary.grossSalesMinor / 100)}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Excludes taxes and applied discounts</p>
            </div>

            {/* Discounts Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Discounts Conceded</span>
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Percent className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-xl font-black text-slate-900">
                  {summary.discountsMinor > 0 ? `-${formatPrice(summary.discountsMinor / 100)}` : '—'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Total coupon & menu discounts</p>
            </div>

            {/* Accrued GST */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total GST collected</span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-xl font-black text-slate-900">{formatPrice(summary.totalTaxMinor / 100)}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 font-medium">CGST + SGST + IGST liability</p>
            </div>

            {/* Grand Revenue Total */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grand Total (Net sales)</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-xl font-black text-indigo-600">{formatPrice(summary.grandTotalMinor / 100)}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Completed inclusive of tax & discounts</p>
            </div>
          </div>

          {/* Core Analytics Details Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Ticket Frequency */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 text-xs">
              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Completed Tickets</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <p className="text-lg font-black text-slate-800">{summary.orderCount}</p>
                <span className="text-[10px] text-slate-400">orders</span>
              </div>
            </div>

            {/* Average order amount */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 text-xs">
              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Average Order Value</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <p className="text-lg font-black text-slate-800">{formatPrice(summary.averageOrderValueMinor / 100)}</p>
                <span className="text-[10px] text-slate-400">AOV</span>
              </div>
            </div>

            {/* Unsettled/Outstanding balance */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 text-xs">
              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Outstanding due balances</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <p className="text-lg font-black text-amber-700">{formatPrice(summary.dueAmountMinor / 100)}</p>
                <span className="text-[10px] text-slate-400">outstanding</span>
              </div>
            </div>

            {/* Realized/Collected magnitude */}
            <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 text-xs">
              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Total Collections Realized</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <p className="text-lg font-black text-emerald-700">{formatPrice(summary.collectedAmountMinor / 100)}</p>
                <span className="text-[10px] text-slate-400">realized cash flow</span>
              </div>
            </div>
          </div>

          {/* Operational Separators: Realized Sales vs Cancelled vs Unsettled */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unsettled active orders</p>
                <p className="text-sm font-black text-slate-800">{summary.activeOrderCount} Tickets</p>
                <p className="text-[10px] text-slate-500 font-medium">Potential pipeline: {formatPrice(summary.activeGrandTotalMinor / 100)}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 text-slate-400 shrink-0">
                <ShoppingBag className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cancelled orders</p>
                <p className="text-sm font-black text-slate-800">{summary.cancelledOrderCount} Tickets</p>
                <p className="text-[10px] text-slate-500 font-medium">Lost Sales: {formatPrice(summary.cancelledTotalMinor / 100)}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 text-slate-400 shrink-0">
                <Ban className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Refunded ledger magnitude</p>
                <p className="text-sm font-black text-rose-700">{formatPrice(summary.refundedAmountMinor / 100)}</p>
                <p className="text-[10px] text-slate-500 font-medium">Total refunds processed</p>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50/50 text-rose-500 shrink-0 border border-rose-100">
                <RotateCcw className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* 📊 Beautiful SVG Performance Visualization Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales vs Collections vs Outstanding Bar Chart (SVG-based) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Accounts & Ledger Flow Analysis</h3>
                <p className="text-xs text-slate-500 mt-0.5">Authoritative comparison of total sales vs cash flow realization</p>
              </div>

              {/* Pure SVG Bar visualization */}
              <div className="relative w-full h-56 bg-slate-50/50 rounded-xl border border-slate-200/60 p-4 flex flex-col justify-between">
                <div className="flex-1 flex items-end justify-around gap-6 pt-4 pb-2">
                  {/* Total sales column */}
                  <div className="flex flex-col items-center flex-1 max-w-[80px]">
                    <span className="text-[10px] font-bold text-slate-800 mb-1 font-mono">
                      {formatPrice(summary.grandTotalMinor / 100)}
                    </span>
                    <div className="w-full bg-indigo-600 rounded-t-lg shadow-sm" style={{ height: '120px' }} />
                    <span className="text-[10px] font-bold text-slate-500 mt-2 text-center">Net Sales</span>
                  </div>

                  {/* Collected flow column */}
                  <div className="flex flex-col items-center flex-1 max-w-[80px]">
                    <span className="text-[10px] font-bold text-emerald-600 mb-1 font-mono">
                      {formatPrice(summary.collectedAmountMinor / 100)}
                    </span>
                    <div 
                      className="w-full bg-emerald-500 rounded-t-lg shadow-sm transition-all duration-300" 
                      style={{ 
                        height: summary.grandTotalMinor > 0 
                          ? `${Math.max(12, Math.round((summary.collectedAmountMinor / summary.grandTotalMinor) * 120))}px`
                          : '12px'
                      }} 
                    />
                    <span className="text-[10px] font-bold text-slate-500 mt-2 text-center">Collected</span>
                  </div>

                  {/* Outstanding column */}
                  <div className="flex flex-col items-center flex-1 max-w-[80px]">
                    <span className="text-[10px] font-bold text-amber-700 mb-1 font-mono">
                      {formatPrice(summary.dueAmountMinor / 100)}
                    </span>
                    <div 
                      className="w-full bg-amber-500 rounded-t-lg shadow-sm transition-all duration-300" 
                      style={{ 
                        height: summary.grandTotalMinor > 0 
                          ? `${Math.max(12, Math.round((summary.dueAmountMinor / summary.grandTotalMinor) * 120))}px`
                          : '12px'
                      }} 
                    />
                    <span className="text-[10px] font-bold text-slate-500 mt-2 text-center">Outstanding</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tax Component Liability Column Chart (SVG-based) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">GST Component Liability Breakdown</h3>
                <p className="text-xs text-slate-500 mt-0.5">Authoritative share breakdown of CGST, SGST, and IGST</p>
              </div>

              {/* Pure SVG Horizontal Row visualization */}
              <div className="relative w-full h-56 bg-slate-50/50 rounded-xl border border-slate-200/60 p-5 flex flex-col justify-center space-y-4">
                {/* CGST row */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-700">Central GST (CGST)</span>
                    <span className="font-bold font-mono text-slate-900">{formatPrice(summary.cgstMinor / 100)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all" 
                      style={{ 
                        width: summary.totalTaxMinor > 0 
                          ? `${Math.round((summary.cgstMinor / summary.totalTaxMinor) * 100)}%`
                          : '0%'
                      }} 
                    />
                  </div>
                </div>

                {/* SGST row */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-700">State GST (SGST)</span>
                    <span className="font-bold font-mono text-slate-900">{formatPrice(summary.sgstMinor / 100)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all" 
                      style={{ 
                        width: summary.totalTaxMinor > 0 
                          ? `${Math.round((summary.sgstMinor / summary.totalTaxMinor) * 100)}%`
                          : '0%'
                      }} 
                    />
                  </div>
                </div>

                {/* IGST row */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-700">Integrated GST (IGST)</span>
                    <span className="font-bold font-mono text-slate-900">{formatPrice(summary.igstMinor / 100)}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-amber-500 h-full rounded-full transition-all" 
                      style={{ 
                        width: summary.totalTaxMinor > 0 
                          ? `${Math.round((summary.igstMinor / summary.totalTaxMinor) * 100)}%`
                          : '0%'
                      }} 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tables Row: Visual Breakdown lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PopularItemsTable items={summary.items} />
            <CategoryPerformanceTable categories={summary.categories} />
          </div>

          {/* GST Tax reference form */}
          <div>
            <TaxRevenueTable summary={summary} />
          </div>
        </div>
      )}
    </div>
  );
};

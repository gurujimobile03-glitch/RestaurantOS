import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderType, OrderStatus } from '../types/order';
import { Table } from '../types/table';
import { orderService, OrderHistoryFilterOptions } from '../services/orderService';
import { tableService } from '../services/tableService';
import { paymentService } from '../services/paymentService';
import { useRestaurant } from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../utils/money';
import { hasPermission } from '../utils/permissions';
import { BillReceiptModal } from '../components/pos/BillReceiptModal';
import {
  History,
  Search,
  Filter,
  Calendar,
  Receipt,
  RotateCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Utensils,
  CreditCard,
  RefreshCw,
  ArrowUpDown,
  ShoppingBag,
  Truck,
  Building2,
  X,
  FileText,
  DollarSign,
  ChevronDown
} from 'lucide-react';

export const OrdersPage: React.FC = () => {
  const { restaurant } = useRestaurant();
  const { user, profile } = useAuth();
  const symbol = restaurant?.currencySymbol || '₹';
  const role = profile?.role || 'owner';

  // Filters State
  const [dateRangePreset, setDateRangePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [selectedTableId, setSelectedTableId] = useState<string>('all');

  // Data State
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selected Order for Bill / Details
  const [selectedBillOrder, setSelectedBillOrder] = useState<Order | null>(null);
  const [isReprintMode, setIsReprintMode] = useState<boolean>(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reopen confirmation dialog
  const [reopenOrderId, setReopenOrderId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [isActionSubmitting, setIsActionSubmitting] = useState<boolean>(false);

  // Compute actual date filters based on preset
  const dateBounds = useMemo(() => {
    const now = new Date();
    if (dateRangePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { start, end: null };
    }
    if (dateRangePreset === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { start, end };
    }
    if (dateRangePreset === 'week') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end: null };
    }
    if (dateRangePreset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end: null };
    }
    if (dateRangePreset === 'custom') {
      const start = customStartDate ? new Date(customStartDate) : null;
      const end = customEndDate ? new Date(customEndDate + 'T23:59:59') : null;
      return { start, end };
    }
    return { start: null, end: null };
  }, [dateRangePreset, customStartDate, customEndDate]);

  // Load Tables for dropdown filter
  useEffect(() => {
    if (!restaurant?.id) return;
    tableService.getTables(restaurant.id).then(setTables).catch(() => {});
  }, [restaurant?.id]);

  // Fetch Order History
  const fetchOrderHistory = async (isManualRefresh: boolean = false) => {
    if (!restaurant?.id) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const filterOptions: OrderHistoryFilterOptions = {
        startDate: dateBounds.start,
        endDate: dateBounds.end,
        orderType: selectedOrderType,
        orderStatus: selectedStatus,
        paymentStatus: selectedPaymentStatus,
        tableId: selectedTableId !== 'all' ? selectedTableId : undefined,
        searchQuery: searchQuery.trim() || undefined,
        limitCount: 100
      };

      const result = await orderService.queryOrderHistory(restaurant.id, filterOptions);
      setOrders(result.orders);
    } catch (err: any) {
      setError(err?.message || 'Failed to retrieve historical order records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrderHistory();
  }, [
    restaurant?.id,
    dateBounds.start?.getTime(),
    dateBounds.end?.getTime(),
    selectedOrderType,
    selectedStatus,
    selectedPaymentStatus,
    selectedTableId,
    searchQuery
  ]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const count = orders.length;
    let totalBilled = 0;
    let totalPaid = 0;
    let totalDue = 0;

    orders.forEach((o) => {
      if (o.status !== 'cancelled') {
        totalBilled += o.grandTotalMinor || 0;
        totalPaid += o.paidAmountMinor || 0;
        totalDue += o.dueAmountMinor || 0;
      }
    });

    return { count, totalBilled, totalPaid, totalDue };
  }, [orders]);

  // Handle Safe Reopen
  const handleReopenOrder = async (orderId: string) => {
    if (!restaurant?.id || !user?.uid) return;
    setIsActionSubmitting(true);
    setError(null);
    try {
      await orderService.reopenOrder(
        restaurant.id,
        orderId,
        user.uid,
        reopenReason || 'Reopened for staff correction'
      );
      setReopenOrderId(null);
      setReopenReason('');
      setActionSuccess(`Order #${orderId} successfully reopened for adjustments.`);
      setTimeout(() => setActionSuccess(null), 4000);
      await fetchOrderHistory(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to reopen order.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  return (
    <div data-testid="orders-history-page" className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              <History className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                Order History & Previous Bills
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative transaction archive, GST invoices, and historical bill retrieval.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          data-testid="btn-refresh-orders"
          onClick={() => fetchOrderHistory(true)}
          disabled={loading || refreshing}
          className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Success Banner */}
      {actionSuccess && (
        <div
          data-testid="order-action-success-banner"
          className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          data-testid="order-error-banner"
          className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Filtered Orders</p>
          <p data-testid="metric-order-count" className="text-2xl font-black text-slate-900 mt-1">
            {summaryMetrics.count}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Billed</p>
          <p data-testid="metric-total-billed" className="text-2xl font-black text-slate-900 mt-1">
            {formatMoney(summaryMetrics.totalBilled, symbol)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Collected</p>
          <p data-testid="metric-total-collected" className="text-2xl font-black text-emerald-600 mt-1">
            {formatMoney(summaryMetrics.totalPaid, symbol)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Outstanding Due</p>
          <p data-testid="metric-total-due" className="text-2xl font-black text-rose-600 mt-1">
            {formatMoney(summaryMetrics.totalDue, symbol)}
          </p>
        </div>
      </div>

      {/* Comprehensive Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              data-testid="input-search-orders"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Order #, Customer, Phone..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Date Presets */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
            {(['today', 'yesterday', 'week', 'month', 'all', 'custom'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                data-testid={`filter-date-${preset}`}
                onClick={() => setDateRangePreset(preset)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                  dateRangePreset === preset
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                {preset === 'week' ? 'Last 7 Days' : preset === 'month' ? 'This Month' : preset}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Pickers (if custom selected) */}
        {dateRangePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">From:</span>
              <input
                type="date"
                data-testid="input-custom-start-date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">To:</span>
              <input
                type="date"
                data-testid="input-custom-end-date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Multi-Attribute Dropdown Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Order Type */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
              Order Type
            </label>
            <select
              data-testid="select-filter-order-type"
              value={selectedOrderType}
              onChange={(e) => setSelectedOrderType(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="dineIn">Dine-In</option>
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          {/* Order Status */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              data-testid="select-filter-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 capitalize"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="preparing">Preparing</option>
              <option value="ready">Ready</option>
              <option value="served">Served</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Payment Status */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
              Payment Status
            </label>
            <select
              data-testid="select-filter-payment-status"
              value={selectedPaymentStatus}
              onChange={(e) => setSelectedPaymentStatus(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Payments</option>
              <option value="paid">Fully Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid / Due</option>
            </select>
          </div>

          {/* Table */}
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
              Table
            </label>
            <select
              data-testid="select-filter-table"
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All Tables</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  Table {t.tableNumber} {t.name ? `(${t.name})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table / List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto mb-3" />
            <span>Loading historical orders from Firestore...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-xs">
            <History className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">No orders match the selected filters</p>
            <p className="text-slate-400 mt-1">Try broadening your date range or clearing search criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Type & Table</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-right">Paid / Due</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {orders.map((ord) => {
                  const createdDate = ord.createdAt
                    ? new Date((ord.createdAt as any)?.toDate?.() || ord.createdAt)
                    : new Date();

                  const isFullyPaid = (ord.paidAmountMinor || 0) >= (ord.grandTotalMinor || 0) && (ord.grandTotalMinor || 0) > 0;
                  const isPartiallyPaid = (ord.paidAmountMinor || 0) > 0 && (ord.paidAmountMinor || 0) < (ord.grandTotalMinor || 0);

                  return (
                    <tr
                      key={ord.id}
                      data-testid={`order-row-${ord.id}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Order Number */}
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-600">
                        #{ord.orderNumber || ord.id.substring(0, 8)}
                      </td>

                      {/* Date / Time */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div>{createdDate.toLocaleDateString('en-IN')}</div>
                        <div className="text-[10px] text-slate-400">
                          {createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      {/* Type & Table */}
                      <td className="py-3.5 px-4">
                        <div className="capitalize font-bold text-slate-800 flex items-center gap-1.5">
                          {ord.orderType === 'dineIn' && <Utensils className="w-3.5 h-3.5 text-amber-500" />}
                          {ord.orderType === 'takeaway' && <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />}
                          {ord.orderType === 'delivery' && <Truck className="w-3.5 h-3.5 text-emerald-500" />}
                          <span>{ord.orderType}</span>
                        </div>
                        {ord.tableId && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            Table {ord.tableId}
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {ord.customerSnapshot?.name ? (
                          <div>
                            <div className="font-bold text-slate-800">{ord.customerSnapshot.name}</div>
                            {ord.customerSnapshot.phone && (
                              <div className="text-[10px] text-slate-400 font-mono">{ord.customerSnapshot.phone}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Walk-in</span>
                        )}
                      </td>

                      {/* Order Status Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border capitalize ${
                            ord.status === 'completed'
                              ? 'bg-slate-100 border-slate-300 text-slate-700'
                              : ord.status === 'served'
                              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                              : ord.status === 'ready'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : ord.status === 'cancelled'
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : 'bg-amber-50 border-amber-200 text-amber-700'
                          }`}
                        >
                          {ord.status}
                        </span>
                      </td>

                      {/* Payment Status Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                            isFullyPaid
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : isPartiallyPaid
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-rose-50 border-rose-200 text-rose-700'
                          }`}
                        >
                          {isFullyPaid ? 'Paid' : isPartiallyPaid ? 'Partial' : 'Unpaid'}
                        </span>
                      </td>

                      {/* Grand Total */}
                      <td className="py-3.5 px-4 text-right font-black text-slate-900 font-mono">
                        {formatMoney(ord.grandTotalMinor, symbol)}
                      </td>

                      {/* Paid / Due Breakdown */}
                      <td className="py-3.5 px-4 text-right text-[11px] font-mono">
                        <div className="text-emerald-700 font-bold">
                          Paid: {formatMoney(ord.paidAmountMinor || 0, symbol)}
                        </div>
                        {ord.dueAmountMinor > 0 && (
                          <div className="text-rose-600 font-bold">
                            Due: {formatMoney(ord.dueAmountMinor, symbol)}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View Bill */}
                          <button
                            type="button"
                            data-testid={`btn-order-view-bill-${ord.id}`}
                            onClick={() => {
                              setSelectedBillOrder(ord);
                              setIsReprintMode(false);
                            }}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
                            title="View GST Bill Receipt"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>

                          {/* Reprint Bill */}
                          <button
                            type="button"
                            data-testid={`btn-order-reprint-${ord.id}`}
                            onClick={() => {
                              setSelectedBillOrder(ord);
                              setIsReprintMode(true);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="Reprint Bill (Duplicate)"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>

                          {/* Order Details */}
                          <button
                            type="button"
                            data-testid={`btn-order-details-${ord.id}`}
                            onClick={() => setDetailOrder(ord)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="View Items & Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Reopen Action (for managers/owners on completed/served orders) */}
                          {hasPermission(role, 'modify_orders') && ord.status === 'completed' && (
                            <button
                              type="button"
                              data-testid={`btn-order-reopen-${ord.id}`}
                              onClick={() => {
                                setReopenOrderId(ord.id);
                                setReopenReason('');
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200 transition-colors"
                              title="Reopen Order for Adjustment"
                            >
                              Reopen
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
        )}
      </div>

      {/* Reopen Order Dialog */}
      {reopenOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-black text-slate-900">Reopen Order #{reopenOrderId}</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Reopening will transition this completed order back to <strong>served</strong> to allow operational adjustments. Existing payments and historical logs will remain safely intact.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Reason for Reopening:</label>
              <input
                type="text"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="e.g. Added item after bill, Customer dispute..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReopenOrderId(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-reopen-order"
                disabled={isActionSubmitting}
                onClick={() => handleReopenOrder(reopenOrderId)}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors"
              >
                Confirm Reopen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bill Receipt Modal */}
      {selectedBillOrder && (
        <BillReceiptModal
          isOpen={!!selectedBillOrder}
          onClose={() => setSelectedBillOrder(null)}
          order={selectedBillOrder}
          isReprint={isReprintMode}
        />
      )}

      {/* Order Item Details Modal */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full text-white shadow-2xl overflow-hidden my-8">
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    Order #{detailOrder.orderNumber || detailOrder.id.substring(0, 8)}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Type: <span className="capitalize font-bold text-slate-200">{detailOrder.orderType}</span> • Status:{' '}
                    <span className="capitalize font-bold text-slate-200">{detailOrder.status}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
              {/* Items Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Historical Item Snapshots</h4>
                <div className="space-y-2">
                  {detailOrder.items.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex justify-between items-center text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">
                          {it.quantity}x {it.nameSnapshot}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Unit: {formatMoney(it.unitPriceMinor, symbol)} • Tax: {it.taxRate}%
                          {it.taxInclusive ? ' (incl)' : ' (excl)'}
                        </div>
                        {it.notes && <div className="text-[10px] text-amber-400 italic">Note: {it.notes}</div>}
                      </div>
                      <div className="text-right font-mono font-bold text-indigo-300">
                        {formatMoney(it.lineTotalMinor, symbol)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Snapshot Breakdown */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono text-white">{formatMoney(detailOrder.subtotalMinor, symbol)}</span>
                </div>
                {detailOrder.discountMinor > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount:</span>
                    <span className="font-mono">-{formatMoney(detailOrder.discountMinor, symbol)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400">
                  <span>Taxable:</span>
                  <span className="font-mono text-white">{formatMoney(detailOrder.taxableAmountMinor, symbol)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total Tax (CGST+SGST+IGST):</span>
                  <span className="font-mono text-white">{formatMoney(detailOrder.totalTaxMinor, symbol)}</span>
                </div>
                <div className="flex justify-between font-black text-sm text-white pt-2 border-t border-slate-800">
                  <span>Grand Total:</span>
                  <span className="font-mono text-indigo-400">{formatMoney(detailOrder.grandTotalMinor, symbol)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 pt-1 border-t border-slate-800/60 font-bold">
                  <span>Paid Amount:</span>
                  <span className="font-mono">{formatMoney(detailOrder.paidAmountMinor || 0, symbol)}</span>
                </div>
                {detailOrder.dueAmountMinor > 0 && (
                  <div className="flex justify-between text-rose-400 font-bold">
                    <span>Due Amount:</span>
                    <span className="font-mono">{formatMoney(detailOrder.dueAmountMinor, symbol)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedBillOrder(detailOrder);
                  setIsReprintMode(false);
                  setDetailOrder(null);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>View Full Bill</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Building2,
  Calendar,
  Send,
  PackageCheck,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  Filter
} from 'lucide-react';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  CreatePurchaseOrderDTO
} from '../../types/purchaseOrder';
import { Supplier } from '../../types/supplier';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { supplierService } from '../../services/supplierService';
import { formatMoney } from '../../utils/money';
import { CreatePurchaseOrderModal } from './CreatePurchaseOrderModal';
import { PurchaseOrderDetailsModal } from './PurchaseOrderDetailsModal';
import { ReceiveGoodsModal } from './ReceiveGoodsModal';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

interface PurchaseOrderListViewProps {
  restaurantId: string;
}

export const PurchaseOrderListView: React.FC<PurchaseOrderListViewProps> = ({ restaurantId }) => {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [quickReceiveOrder, setQuickReceiveOrder] = useState<PurchaseOrder | null>(null);

  const canManagePurchases = hasPermission(profile?.role, 'manage_purchases');
  const canReceivePurchases = hasPermission(profile?.role, 'receive_purchases');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [allOrders, allSups] = await Promise.all([
        purchaseOrderService.getPurchaseOrders(restaurantId, {
          status: statusFilter === 'all' ? undefined : statusFilter,
          supplierId: selectedSupplierId === 'all' ? undefined : selectedSupplierId,
          search: search.trim() || undefined
        }),
        supplierService.getSuppliers(restaurantId)
      ]);
      setOrders(allOrders);
      setSuppliers(allSups);
    } catch (err: any) {
      setError(err?.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to realtime updates
    const unsubscribe = purchaseOrderService.listenToPurchaseOrders(
      restaurantId,
      updated => {
        let filtered = updated;
        if (statusFilter !== 'all') {
          filtered = filtered.filter(po => po.status === statusFilter);
        }
        if (selectedSupplierId !== 'all') {
          filtered = filtered.filter(po => po.supplierId === selectedSupplierId);
        }
        if (search.trim()) {
          const term = search.trim().toLowerCase();
          filtered = filtered.filter(
            po =>
              po.orderNumber.toLowerCase().includes(term) ||
              po.supplierSnapshot.name.toLowerCase().includes(term) ||
              po.items.some(it => it.itemNameSnapshot.toLowerCase().includes(term))
          );
        }
        setOrders(filtered);
      },
      err => {
        console.error('Purchase orders subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [restaurantId, statusFilter, selectedSupplierId, search]);

  const handleCreateOrder = async (dto: CreatePurchaseOrderDTO) => {
    await purchaseOrderService.createPurchaseOrder(restaurantId, dto);
    loadData();
  };

  const getStatusBadge = (status: PurchaseOrderStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" />
            Draft
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60">
            <Send className="w-3 h-3" />
            Submitted
          </span>
        );
      case 'partiallyReceived':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60">
            <PackageCheck className="w-3 h-3" />
            Partially Received
          </span>
        );
      case 'received':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
            <CheckCircle2 className="w-3 h-3" />
            Received
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
            <XCircle className="w-3 h-3" />
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search PO #, supplier, or item..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="partiallyReceived">Partially Received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Supplier Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedSupplierId}
              onChange={e => setSelectedSupplierId(e.target.value)}
              className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[180px]"
            >
              <option value="all">All Suppliers</option>
              {suppliers.map(s => (
                <option key={s.supplierId} value={s.supplierId}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
            title="Refresh Purchase Orders"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canManagePurchases && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-600/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Purchase Order</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Purchase Orders Table */}
      {loading && orders.length === 0 ? (
        <div className="py-16 text-center text-slate-500 dark:text-slate-400">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3 text-indigo-500" />
          <p className="text-sm">Loading purchase orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            No Purchase Orders Found
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search || statusFilter !== 'all' || selectedSupplierId !== 'all'
              ? 'No purchase orders match your current filters.'
              : 'Create your first purchase order to procure ingredients and supplies from vendors.'}
          </p>
          {canManagePurchases && !search && statusFilter === 'all' && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl"
            >
              <Plus className="w-4 h-4" />
              <span>Create Purchase Order</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3.5">PO Number</th>
                  <th className="px-6 py-3.5">Supplier</th>
                  <th className="px-6 py-3.5">Order Date</th>
                  <th className="px-6 py-3.5 text-right">Items</th>
                  <th className="px-6 py-3.5 text-right">Grand Total</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map(po => {
                  const itemsCount = po.items.length;
                  const canReceive =
                    canReceivePurchases &&
                    (po.status === 'submitted' || po.status === 'partiallyReceived');

                  return (
                    <tr
                      key={po.purchaseOrderId}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelectedOrderId(po.purchaseOrderId)}
                          className="font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5"
                        >
                          <span>{po.orderNumber}</span>
                        </button>
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{po.supplierSnapshot.name}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {po.supplierSnapshot.phone}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{po.orderDate}</span>
                        </div>
                        {po.expectedDate && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Due: {po.expectedDate}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                        {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                      </td>

                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatMoney(po.grandTotalMinor)}
                      </td>

                      <td className="px-6 py-4 text-center">
                        {getStatusBadge(po.status)}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {/* Quick Receive Button */}
                          {canReceive && (
                            <button
                              onClick={() => setQuickReceiveOrder(po)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors"
                              title="Receive Goods"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              <span>Receive</span>
                            </button>
                          )}

                          {/* View Details Button */}
                          <button
                            onClick={() => setSelectedOrderId(po.purchaseOrderId)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="View PO Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Purchase Order Modal */}
      {createModalOpen && (
        <CreatePurchaseOrderModal
          restaurantId={restaurantId}
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={handleCreateOrder}
        />
      )}

      {/* Purchase Order Details Modal */}
      {selectedOrderId && (
        <PurchaseOrderDetailsModal
          restaurantId={restaurantId}
          purchaseOrderId={selectedOrderId}
          isOpen={Boolean(selectedOrderId)}
          onClose={() => setSelectedOrderId(null)}
          onOrderUpdated={loadData}
        />
      )}

      {/* Quick Receive Goods Modal */}
      {quickReceiveOrder && (
        <ReceiveGoodsModal
          restaurantId={restaurantId}
          purchaseOrder={quickReceiveOrder}
          isOpen={Boolean(quickReceiveOrder)}
          onClose={() => setQuickReceiveOrder(null)}
          onSuccess={() => {
            setQuickReceiveOrder(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

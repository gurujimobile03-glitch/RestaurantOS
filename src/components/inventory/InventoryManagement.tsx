import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  History,
  Sliders,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  Boxes,
  Scale,
  Building2,
  FileSpreadsheet,
  BarChart3
} from 'lucide-react';
import {
  InventoryItem,
  StockMovement,
  InventoryUnit,
  StockMovementType,
  CreateInventoryItemDTO,
  UpdateInventoryItemDTO,
  RecordStockMovementDTO
} from '../../types/inventory';
import { inventoryService } from '../../services/inventoryService';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import {
  SUPPORTED_UNITS,
  UNIT_CONFIG,
  isLowStock,
  formatQuantityWithUnit,
  roundQuantity,
  areUnitsCompatible
} from '../../utils/units';
import { StockLedgerView } from './StockLedgerView';
import { StockReconciliationView } from './StockReconciliationView';
import { RecordMovementModal } from './RecordMovementModal';
import { StockHistoryModal } from './StockHistoryModal';
import { SupplierListView } from './SupplierListView';
import { PurchaseOrderListView } from './PurchaseOrderListView';
import { InventoryAnalyticsDashboard } from './InventoryAnalyticsDashboard';

export const InventoryManagement: React.FC = () => {
  const { restaurant } = useRestaurant();
  const { profile } = useAuth();

  const staffRole = profile?.role || 'owner';
  const canManage = hasPermission(staffRole, 'manage_inventory');
  const canAccessSuppliers = hasPermission(staffRole, 'access_suppliers');
  const canAccessPurchases = hasPermission(staffRole, 'access_purchases');
  const canAccessAnalytics = staffRole === 'owner' || staffRole === 'manager' || staffRole === 'accountant';
  const restaurantId = restaurant?.restaurantId || '';

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'items' | 'ledger' | 'reconciliation' | 'analytics' | 'suppliers' | 'purchases'>('items');

  // State
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'low_stock' | 'inactive'>('all');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deactivatingItem, setDeactivatingItem] = useState<InventoryItem | null>(null);
  const [itemForStockAction, setItemForStockAction] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  // Subscribe to real-time inventory updates
  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);

    const unsubscribe = inventoryService.subscribeToInventoryItems(
      restaurantId,
      updatedItems => {
        setItems(updatedItems);
        setLoading(false);
      },
      err => {
        console.error('Inventory subscription error:', err);
        setError(err.message || 'Failed to load inventory items');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [restaurantId]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Status filter
      if (statusFilter === 'active' && (!item.active || item.status !== 'active')) return false;
      if (statusFilter === 'inactive' && item.active && item.status === 'active') return false;
      if (statusFilter === 'low_stock' && (!item.active || !isLowStock(item.currentQuantity, item.minimumQuantity))) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesSku = item.sku ? item.sku.toLowerCase().includes(query) : false;
        if (!matchesName && !matchesSku) return false;
      }

      return true;
    });
  }, [items, statusFilter, searchQuery]);

  // Low stock summary count
  const lowStockCount = useMemo(() => {
    return items.filter(i => i.active && isLowStock(i.currentQuantity, i.minimumQuantity)).length;
  }, [items]);

  return (
    <div id="inventory-management-root" className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory Items</h1>
            <span
              id="inventory-total-badge"
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800"
            >
              {items.length} items
            </span>
            {lowStockCount > 0 && (
              <span
                id="inventory-low-stock-alert-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {lowStockCount} low stock
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Authoritative inventory stock tracking, unit management, and immutable movement audits.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              id="btn-open-add-inventory-modal"
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Inventory Item</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          id="tab-inventory-items"
          onClick={() => setActiveTab('items')}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'items'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Catalog & Stock</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 font-mono">
            {items.length}
          </span>
        </button>

        <button
          type="button"
          id="tab-stock-ledger"
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'ledger'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Stock Movement Ledger</span>
        </button>

        <button
          type="button"
          id="tab-stock-reconciliation"
          onClick={() => setActiveTab('reconciliation')}
          className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'reconciliation'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Reconciliation</span>
        </button>

        {canAccessAnalytics && (
          <button
            type="button"
            id="tab-inventory-analytics"
            onClick={() => setActiveTab('analytics')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'analytics'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Stock Analytics</span>
          </button>
        )}

        {canAccessSuppliers && (
          <button
            type="button"
            id="tab-suppliers"
            onClick={() => setActiveTab('suppliers')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'suppliers'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Suppliers</span>
          </button>
        )}

        {canAccessPurchases && (
          <button
            type="button"
            id="tab-purchase-orders"
            onClick={() => setActiveTab('purchases')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'purchases'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Purchase Orders</span>
          </button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div
          id="inventory-error-banner"
          className="rounded-lg bg-rose-50 border border-rose-200 p-4 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-rose-800">Inventory Service Alert</h3>
            <p className="text-sm text-rose-700 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Tab View */}
      {activeTab === 'suppliers' && canAccessSuppliers && (
        <SupplierListView restaurantId={restaurantId} />
      )}

      {activeTab === 'purchases' && canAccessPurchases && (
        <PurchaseOrderListView restaurantId={restaurantId} />
      )}

      {activeTab === 'ledger' && (
        <StockLedgerView
          restaurantId={restaurantId}
          items={items}
          canManage={canManage}
        />
      )}

      {activeTab === 'reconciliation' && (
        <StockReconciliationView
          restaurantId={restaurantId}
          items={items}
          canManage={canManage}
          onOpenAdjustment={item => setItemForStockAction(item)}
        />
      )}

      {activeTab === 'analytics' && canAccessAnalytics && (
        <InventoryAnalyticsDashboard />
      )}

      {activeTab === 'items' && (
        <>
      {/* Filter and Search Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Search Bar */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="inventory-search-input"
            type="text"
            placeholder="Search items by name or SKU..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Filter Dropdown */}
        <div className="relative">
          <select
            id="inventory-status-filter"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            aria-label="Filter items by status"
            className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-colors"
          >
            <option value="all">All Items</option>
            <option value="active">Active Only</option>
            <option value="low_stock">Low Stock Alerts ({lowStockCount})</option>
            <option value="inactive">Inactive / Archived</option>
          </select>
        </div>
      </div>

      {/* Main Items Table / Cards */}
      {loading ? (
        <div id="inventory-loading-state" className="py-20 flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mb-3" />
          <p className="text-sm text-slate-500 font-medium">Loading authoritative inventory...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          id="inventory-empty-state"
          className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-16 px-4 text-center"
        >
          <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Inventory Items Found</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
            {searchQuery || statusFilter !== 'all'
              ? 'No items match your active filters or search terms. Try clearing search.'
              : 'Track raw materials, produce, beverages, and supplies by adding your first inventory item.'}
          </p>
          {canManage && (
            <button
              id="btn-empty-add-item"
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              <Plus className="w-4 h-4" />
              <span>Add Item Now</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table id="inventory-items-table" className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4 text-right">Current Stock</th>
                  <th className="py-3 px-4 text-right">Min Stock</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.map(item => {
                  const isLow = item.active && isLowStock(item.currentQuantity, item.minimumQuantity);
                  const isInactive = !item.active || item.status === 'inactive';

                  return (
                    <tr
                      key={item.id}
                      id={`inventory-row-${item.id}`}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isInactive ? 'opacity-60 bg-slate-50/30' : ''
                      }`}
                    >
                      {/* Name */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        {item.costPerUnitPaise !== undefined && (
                          <div className="text-xs text-slate-500">
                            Cost: ₹{(item.costPerUnitPaise / 100).toFixed(2)} / {item.unit}
                          </div>
                        )}
                      </td>

                      {/* SKU */}
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                        {item.sku || '—'}
                      </td>

                      {/* Unit */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                          {UNIT_CONFIG[item.unit]?.name || item.unit} ({UNIT_CONFIG[item.unit]?.symbol || item.unit})
                        </span>
                      </td>

                      {/* Current Stock */}
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`font-semibold ${
                            isLow ? 'text-amber-700 font-bold' : 'text-slate-900'
                          }`}
                        >
                          {formatQuantityWithUnit(item.currentQuantity, item.unit)}
                        </span>
                      </td>

                      {/* Min Stock */}
                      <td className="py-3.5 px-4 text-right text-slate-600">
                        {formatQuantityWithUnit(item.minimumQuantity, item.unit)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        {isInactive ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                            Inactive
                          </span>
                        ) : isLow ? (
                          <span
                            id={`low-stock-badge-${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300"
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-700" />
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Movement History */}
                          <button
                            id={`btn-view-history-${item.id}`}
                            type="button"
                            title="View Stock Movement Audit History"
                            onClick={() => setHistoryItem(item)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <History className="w-4 h-4" />
                          </button>

                          {canManage && !isInactive && (
                            <>
                              {/* Stock Movement Action */}
                              <button
                                id={`btn-stock-action-${item.id}`}
                                type="button"
                                title="Adjust Stock / Record Movement"
                                onClick={() => setItemForStockAction(item)}
                                className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors"
                              >
                                <Sliders className="w-4 h-4" />
                              </button>

                              {/* Edit Item */}
                              <button
                                id={`btn-edit-item-${item.id}`}
                                type="button"
                                title="Edit Item Details"
                                onClick={() => setEditingItem(item)}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {/* Deactivate */}
                              <button
                                id={`btn-deactivate-item-${item.id}`}
                                type="button"
                                title="Deactivate Item"
                                onClick={() => setDeactivatingItem(item)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
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
      )}
      </>
      )}

      {/* MODALS */}
      {/* 1. Add Inventory Item Modal */}
      {isAddModalOpen && (
        <AddInventoryItemModal
          restaurantId={restaurantId}
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={() => setIsAddModalOpen(false)}
        />
      )}

      {/* 2. Edit Inventory Item Modal */}
      {editingItem && (
        <EditInventoryItemModal
          restaurantId={restaurantId}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSuccess={() => setEditingItem(null)}
        />
      )}

      {/* 3. Record Stock Movement Modal */}
      {itemForStockAction && (
        <RecordMovementModal
          restaurantId={restaurantId}
          item={itemForStockAction}
          onClose={() => setItemForStockAction(null)}
          onSuccess={() => setItemForStockAction(null)}
        />
      )}

      {/* 4. Movement History Drawer/Modal */}
      {historyItem && (
        <StockHistoryModal
          restaurantId={restaurantId}
          item={historyItem}
          canManage={canManage}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {/* 5. Deactivate Item Modal */}
      {deactivatingItem && (
        <DeactivateConfirmModal
          restaurantId={restaurantId}
          item={deactivatingItem}
          onClose={() => setDeactivatingItem(null)}
          onSuccess={() => setDeactivatingItem(null)}
        />
      )}
    </div>
  );
};

// =========================================================================
// SUBCOMPONENT: Add Inventory Item Modal
// =========================================================================
interface AddModalProps {
  restaurantId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddInventoryItemModal: React.FC<AddModalProps> = ({ restaurantId, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState<InventoryUnit>('kg');
  const [minimumQuantity, setMinimumQuantity] = useState<string>('5');
  const [reorderQuantity, setReorderQuantity] = useState<string>('');
  const [costPerUnit, setCostPerUnit] = useState<string>('');
  const [openingQuantity, setOpeningQuantity] = useState<string>('0');
  const [openingReason, setOpeningReason] = useState<string>('Initial opening inventory');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!name.trim()) {
      setModalError('Item name is required.');
      return;
    }

    const minQty = parseFloat(minimumQuantity);
    if (isNaN(minQty) || minQty < 0) {
      setModalError('Minimum quantity must be a non-negative number.');
      return;
    }

    const openQty = openingQuantity.trim() ? parseFloat(openingQuantity) : 0;
    if (isNaN(openQty) || openQty < 0) {
      setModalError('Opening stock must be a non-negative number.');
      return;
    }

    let reorderQty: number | undefined;
    if (reorderQuantity.trim()) {
      reorderQty = parseFloat(reorderQuantity);
      if (isNaN(reorderQty) || reorderQty < 0) {
        setModalError('Reorder quantity must be non-negative.');
        return;
      }
    }

    let costPaise: number | undefined;
    if (costPerUnit.trim()) {
      const costRupees = parseFloat(costPerUnit);
      if (isNaN(costRupees) || costRupees < 0) {
        setModalError('Cost per unit must be non-negative.');
        return;
      }
      costPaise = Math.round(costRupees * 100);
    }

    setSubmitting(true);
    try {
      const dto: CreateInventoryItemDTO = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit,
        minimumQuantity: minQty,
        reorderQuantity: reorderQty,
        costPerUnitPaise: costPaise,
        openingQuantity: openQty,
        openingReason: openQty > 0 ? openingReason.trim() : undefined
      };

      await inventoryService.createInventoryItem(restaurantId, dto);
      onSuccess();
    } catch (err: any) {
      console.error('Failed to create inventory item:', err);
      setModalError(err.message || 'Failed to create inventory item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="modal-add-inventory-item"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-800" />
            <h2 className="text-lg font-bold text-slate-900">Add Inventory Item</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-md p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {modalError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{modalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Item Name *
            </label>
            <input
              id="input-add-item-name"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Basmati Rice, Whole Milk, Chicken Breast"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                SKU / Item Code
              </label>
              <input
                id="input-add-item-sku"
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="e.g. RAW-RIC-001"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Unit of Measure *
              </label>
              <select
                id="select-add-item-unit"
                value={unit}
                onChange={e => setUnit(e.target.value as InventoryUnit)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                {SUPPORTED_UNITS.map(u => (
                  <option key={u} value={u}>
                    {UNIT_CONFIG[u].name} ({UNIT_CONFIG[u].symbol}) — {UNIT_CONFIG[u].category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Minimum Alert Stock *
              </label>
              <input
                id="input-add-item-min-qty"
                type="number"
                step="any"
                min="0"
                required
                value={minimumQuantity}
                onChange={e => setMinimumQuantity(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Reorder Quantity
              </label>
              <input
                id="input-add-item-reorder-qty"
                type="number"
                step="any"
                min="0"
                value={reorderQuantity}
                onChange={e => setReorderQuantity(e.target.value)}
                placeholder="Optional"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Unit Cost (₹)
            </label>
            <input
              id="input-add-item-cost"
              type="number"
              step="0.01"
              min="0"
              value={costPerUnit}
              onChange={e => setCostPerUnit(e.target.value)}
              placeholder="e.g. 85.50"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Opening stock section */}
          <div className="border-t border-slate-200 pt-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
              Initial Stock Record (Optional)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Opening Stock Quantity</label>
                <input
                  id="input-add-item-opening-qty"
                  type="number"
                  step="any"
                  min="0"
                  value={openingQuantity}
                  onChange={e => setOpeningQuantity(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">Stock Record Reason</label>
                <input
                  id="input-add-item-opening-reason"
                  type="text"
                  value={openingReason}
                  onChange={e => setOpeningReason(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              id="btn-cancel-add-item"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              id="btn-submit-add-item"
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Item</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// SUBCOMPONENT: Edit Inventory Item Modal
// =========================================================================
interface EditModalProps {
  restaurantId: string;
  item: InventoryItem;
  onClose: () => void;
  onSuccess: () => void;
}

const EditInventoryItemModal: React.FC<EditModalProps> = ({
  restaurantId,
  item,
  onClose,
  onSuccess
}) => {
  const [name, setName] = useState(item.name);
  const [sku, setSku] = useState(item.sku || '');
  const [unit, setUnit] = useState<InventoryUnit>(item.unit);
  const [minimumQuantity, setMinimumQuantity] = useState<string>(String(item.minimumQuantity));
  const [reorderQuantity, setReorderQuantity] = useState<string>(
    item.reorderQuantity !== undefined ? String(item.reorderQuantity) : ''
  );
  const [costPerUnit, setCostPerUnit] = useState<string>(
    item.costPerUnitPaise !== undefined ? (item.costPerUnitPaise / 100).toFixed(2) : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!name.trim()) {
      setModalError('Item name cannot be empty.');
      return;
    }

    const minQty = parseFloat(minimumQuantity);
    if (isNaN(minQty) || minQty < 0) {
      setModalError('Minimum quantity must be non-negative.');
      return;
    }

    let reorderQty: number | undefined;
    if (reorderQuantity.trim()) {
      reorderQty = parseFloat(reorderQuantity);
      if (isNaN(reorderQty) || reorderQty < 0) {
        setModalError('Reorder quantity must be non-negative.');
        return;
      }
    }

    let costPaise: number | undefined;
    if (costPerUnit.trim()) {
      const costRupees = parseFloat(costPerUnit);
      if (isNaN(costRupees) || costRupees < 0) {
        setModalError('Cost per unit must be non-negative.');
        return;
      }
      costPaise = Math.round(costRupees * 100);
    }

    setSubmitting(true);
    try {
      const dto: UpdateInventoryItemDTO = {
        name: name.trim(),
        sku: sku.trim() || undefined,
        unit,
        minimumQuantity: minQty,
        reorderQuantity: reorderQty,
        costPerUnitPaise: costPaise
      };

      await inventoryService.updateInventoryItem(restaurantId, item.id, dto);
      onSuccess();
    } catch (err: any) {
      console.error('Failed to update inventory item:', err);
      setModalError(err.message || 'Failed to update inventory item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="modal-edit-inventory-item"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit Inventory Item</h2>
            <p className="text-xs text-slate-500">Current Stock: {formatQuantityWithUnit(item.currentQuantity, item.unit)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-md p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {modalError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{modalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Item Name *
            </label>
            <input
              id="input-edit-item-name"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                SKU
              </label>
              <input
                id="input-edit-item-sku"
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Unit of Measure
              </label>
              <select
                id="select-edit-item-unit"
                value={unit}
                onChange={e => setUnit(e.target.value as InventoryUnit)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                {SUPPORTED_UNITS.map(u => {
                  const isComp = areUnitsCompatible(item.unit, u);
                  return (
                    <option key={u} value={u} disabled={item.currentQuantity > 0 && !isComp}>
                      {UNIT_CONFIG[u].name} ({UNIT_CONFIG[u].symbol}) {!isComp && item.currentQuantity > 0 ? '(Incompatible)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Minimum Alert Stock *
              </label>
              <input
                id="input-edit-item-min-qty"
                type="number"
                step="any"
                min="0"
                required
                value={minimumQuantity}
                onChange={e => setMinimumQuantity(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Reorder Quantity
              </label>
              <input
                id="input-edit-item-reorder-qty"
                type="number"
                step="any"
                min="0"
                value={reorderQuantity}
                onChange={e => setReorderQuantity(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
              Unit Cost (₹)
            </label>
            <input
              id="input-edit-item-cost"
              type="number"
              step="0.01"
              min="0"
              value={costPerUnit}
              onChange={e => setCostPerUnit(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              id="btn-cancel-edit-item"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              id="btn-submit-edit-item"
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            >
              {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// =========================================================================
// SUBCOMPONENT: Deactivate Item Modal (Soft Delete)
// =========================================================================
interface DeactivateModalProps {
  restaurantId: string;
  item: InventoryItem;
  onClose: () => void;
  onSuccess: () => void;
}

const DeactivateConfirmModal: React.FC<DeactivateModalProps> = ({
  restaurantId,
  item,
  onClose,
  onSuccess
}) => {
  const [reason, setReason] = useState('Discontinued');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const handleDeactivate = async () => {
    setSubmitting(true);
    setModalError(null);
    try {
      await inventoryService.deactivateInventoryItem(restaurantId, item.id, reason);
      onSuccess();
    } catch (err: any) {
      console.error('Failed to deactivate inventory item:', err);
      setModalError(err.message || 'Failed to deactivate item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="modal-deactivate-inventory-item"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center gap-3 text-rose-600 mb-3">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="text-lg font-bold text-slate-900">Deactivate Inventory Item?</h3>
        </div>

        <p className="text-sm text-slate-600 mb-3">
          Are you sure you want to deactivate <strong className="text-slate-900">{item.name}</strong>?
        </p>

        <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4">
          ℹ️ Historical stock movements and audit records for this item will remain strictly preserved. Deactivated items can no longer receive new stock movements.
        </p>

        {modalError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{modalError}</span>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
            Reason for Deactivation
          </label>
          <input
            id="input-deactivate-reason"
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            id="btn-cancel-deactivate"
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            id="btn-confirm-deactivate"
            type="button"
            onClick={handleDeactivate}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>Confirm Deactivation</span>
          </button>
        </div>
      </div>
    </div>
  );
};

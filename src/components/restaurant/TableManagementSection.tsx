import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Plus,
  Users,
  Edit2,
  Power,
  PowerOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  WifiOff,
  MapPin,
  Check
} from 'lucide-react';
import { Table, TableFormData } from '../../types/table';
import { tableService } from '../../services/tableService';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { validateTable } from '../../utils/transactionValidation';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';

export const TableManagementSection: React.FC = () => {
  const { restaurant } = useRestaurant();
  const { user, profile } = useAuth();
  const restaurantId = restaurant?.restaurantId || '';

  // Authorization check: Owner or Manager only
  const userRole = profile?.role;
  const canManageTables = userRole === 'owner' || userRole === 'manager';

  // Data states
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState<number>(0);

  // Modal & Form states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [formData, setFormData] = useState<TableFormData>({
    name: '',
    tableNumber: '',
    floorOrArea: 'Main Dining',
    capacity: 4,
    isActive: true,
    sortOrder: 0
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formGeneralError, setFormGeneralError] = useState<string | null>(null);

  // Status and feedback banners
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deactivatingTableId, setDeactivatingTableId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');

  // Network state
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Realtime subscription via tableService
  useEffect(() => {
    if (!restaurantId) {
      setTables([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = tableService.subscribeToTables(
      restaurantId,
      (fetchedTables) => {
        setTables(fetchedTables);
        setLoading(false);
        setError(null);
      },
      (err: any) => {
        console.error('[TableManagement] Subscription error:', err);
        setError(err.message || 'Failed to load restaurant tables.');
        setLoading(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [restaurantId, retryTrigger]);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryTrigger((prev) => prev + 1);
  }, []);

  // Distinct floor/area list
  const availableAreas = useMemo(() => {
    const areas = new Set<string>();
    tables.forEach((t) => {
      if (t.floorOrArea && t.floorOrArea.trim()) {
        areas.add(t.floorOrArea.trim());
      }
    });
    return Array.from(areas);
  }, [tables]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        t.tableNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.floorOrArea && t.floorOrArea.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && t.isActive !== false) ||
        (statusFilter === 'inactive' && t.isActive === false);

      const matchesArea =
        areaFilter === 'all' || (t.floorOrArea && t.floorOrArea.trim() === areaFilter);

      return matchesSearch && matchesStatus && matchesArea;
    });
  }, [tables, searchQuery, statusFilter, areaFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = tables.length;
    const active = tables.filter((t) => t.isActive !== false).length;
    const inactive = tables.filter((t) => t.isActive === false).length;
    const occupied = tables.filter((t) => !!t.activeSessionId).length;
    return { total, active, inactive, occupied };
  }, [tables]);

  // Add Table Modal opener
  const handleOpenAddModal = () => {
    if (!canManageTables) return;
    setEditingTable(null);
    setFormData({
      name: `Table ${tables.length + 1}`,
      tableNumber: `${tables.length + 1}`,
      floorOrArea: availableAreas[0] || 'Main Dining',
      capacity: 4,
      isActive: true,
      sortOrder: tables.length + 1
    });
    setFieldErrors({});
    setFormGeneralError(null);
    setIsModalOpen(true);
  };

  // Edit Table Modal opener
  const handleOpenEditModal = (table: Table) => {
    if (!canManageTables) return;
    setEditingTable(table);
    setFormData({
      name: table.name || '',
      tableNumber: table.tableNumber || '',
      floorOrArea: table.floorOrArea || 'Main Dining',
      capacity: table.capacity || 4,
      isActive: table.isActive !== false,
      sortOrder: typeof table.sortOrder === 'number' ? table.sortOrder : 0
    });
    setFieldErrors({});
    setFormGeneralError(null);
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTable(null);
    setFieldErrors({});
    setFormGeneralError(null);
  };

  // Submit Add / Edit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTables) {
      setFormGeneralError('You do not have permission to modify tables.');
      return;
    }
    if (!restaurantId) {
      setFormGeneralError('No active restaurant selected.');
      return;
    }

    setFieldErrors({});
    setFormGeneralError(null);

    // Validate using domain validator
    const validation = validateTable(formData);
    if (!validation.isValid) {
      if (validation.errors) {
        setFieldErrors(validation.errors);
      }
      setFormGeneralError(validation.error || 'Please correct the validation errors below.');
      return;
    }

    setIsSaving(true);
    try {
      const actorUid = user?.uid || 'user';
      if (editingTable) {
        await tableService.updateTable(restaurantId, editingTable.id, formData, actorUid);
        setFeedback({
          type: 'success',
          message: `Table "${formData.tableNumber}" updated successfully.`
        });
      } else {
        await tableService.createTable(restaurantId, formData, actorUid);
        setFeedback({
          type: 'success',
          message: `Table "${formData.tableNumber}" created and ready for floor orders.`
        });
      }

      handleCloseModal();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      console.error('[TableManagement] Save failed:', err);
      setFormGeneralError(err.message || 'Failed to save table.');
    } finally {
      setIsSaving(false);
    }
  };

  // Safe Deactivation / Reactivation Handler
  const handleToggleActive = async (table: Table) => {
    if (!canManageTables) return;
    if (!restaurantId) return;

    // Invariant: Do NOT deactivate table when an active session is running
    if (table.isActive !== false && table.activeSessionId) {
      setFeedback({
        type: 'error',
        message: `Cannot deactivate Table ${table.tableNumber} while an active dining session is in progress. Close or settle the session first.`
      });
      setTimeout(() => setFeedback(null), 5000);
      return;
    }

    const nextActiveState = table.isActive === false ? true : false;
    setDeactivatingTableId(table.id);

    try {
      const actorUid = user?.uid || 'user';
      await tableService.updateTable(
        restaurantId,
        table.id,
        { isActive: nextActiveState },
        actorUid
      );

      setFeedback({
        type: 'success',
        message: `Table ${table.tableNumber} ${nextActiveState ? 'reactivated' : 'safely deactivated'}.`
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      console.error('[TableManagement] Toggle active error:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to update table active status.'
      });
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      setDeactivatingTableId(null);
    }
  };

  return (
    <div id="table-management-section" className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Table & Floor Plan Management</span>
              {!isOnline && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                  <WifiOff className="w-3 h-3" /> Offline Mode
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure dining tables, floor areas, and seating capacities. Configured tables immediately appear in POS Terminal & Captain Ops.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={loading}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            id="table-management-refresh-btn"
          >
            Refresh
          </Button>

          {canManageTables && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleOpenAddModal}
              leftIcon={<Plus className="w-4 h-4" />}
              id="add-table-btn"
            >
              Add Table
            </Button>
          )}
        </div>
      </div>

      {/* Permission Warning if role is not owner or manager */}
      {!canManageTables && (
        <div
          id="table-management-permission-banner"
          className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5"
        >
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Read-only access:</strong> You are signed in as <strong>{userRole || 'staff'}</strong>. Only Restaurant Owners and Managers have permission to add, edit, or deactivate physical dining tables.
          </span>
        </div>
      )}

      {/* Operation Feedback Toast/Banner */}
      {feedback && (
        <div
          id="table-management-feedback-banner"
          className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="font-semibold">{feedback.message}</span>
        </div>
      )}

      {/* Stats Badges */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
        <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-700 font-semibold flex items-center gap-1.5">
          <span className="text-slate-400">Total Tables:</span>
          <span className="text-slate-900 font-bold">{stats.total}</span>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 text-emerald-800 font-semibold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Active:</span>
          <span className="font-bold">{stats.active}</span>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-amber-800 font-semibold flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Occupied (Session):</span>
          <span className="font-bold">{stats.occupied}</span>
        </div>
        {stats.inactive > 0 && (
          <div className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Deactivated:</span>
            <span className="font-bold">{stats.inactive}</span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="table-search-input"
            type="text"
            placeholder="Search table number, name, floor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="table-status-filter" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
            Status:
          </label>
          <select
            id="table-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full text-xs rounded-xl border border-slate-200 bg-white py-2 px-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
          >
            <option value="all">All Tables ({tables.length})</option>
            <option value="active">Active Only ({stats.active})</option>
            <option value="inactive">Deactivated Only ({stats.inactive})</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="table-area-filter" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
            Area:
          </label>
          <select
            id="table-area-filter"
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 bg-white py-2 px-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
          >
            <option value="all">All Floor Areas</option>
            {availableAreas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Area: Loading, Error, Empty, or Table Grid */}
      {loading ? (
        <div
          id="table-management-loading"
          className="py-16 text-center border border-slate-100 rounded-2xl bg-slate-50/40"
        >
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-slate-600">Loading dining tables...</p>
          <p className="text-[11px] text-slate-400 mt-1">Connecting to live floor plan subscription</p>
        </div>
      ) : error ? (
        <div
          id="table-management-error"
          className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs text-center space-y-3"
        >
          <AlertCircle className="w-6 h-6 text-rose-600 mx-auto" />
          <div>
            <p className="font-bold text-sm text-rose-900">Failed to load tables</p>
            <p className="text-rose-700 mt-1">{error}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetry}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Retry Connection
          </Button>
        </div>
      ) : tables.length === 0 ? (
        <div
          id="table-management-empty"
          className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center flex flex-col items-center justify-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-900 mb-1">No Dining Tables Configured Yet</h4>
          <p className="text-xs text-slate-500 max-w-md mb-5 leading-relaxed">
            Your restaurant setup does not have any physical dining tables. Add your first table below to enable Dine-in floor ordering in POS Terminal and Captain Ops.
          </p>
          {canManageTables && (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleOpenAddModal}
              leftIcon={<Plus className="w-4 h-4" />}
              id="empty-add-table-btn"
            >
              Add First Table
            </Button>
          )}
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs border border-slate-100 rounded-2xl bg-slate-50/30">
          No tables match your search or filter criteria.
        </div>
      ) : (
        <div
          id="table-cards-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filteredTables.map((tbl) => {
            const isDeactivated = tbl.isActive === false;
            const isOccupied = !!tbl.activeSessionId;
            const isBusy = deactivatingTableId === tbl.id;

            return (
              <div
                key={tbl.id}
                id={`table-card-${tbl.id}`}
                className={`rounded-2xl border p-4 flex flex-col justify-between transition-all ${
                  isDeactivated
                    ? 'border-slate-200 bg-slate-50/60 opacity-75'
                    : isOccupied
                    ? 'border-amber-300 bg-amber-50/30 shadow-xs'
                    : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                {/* Card Top: Number, Floor, Status Badges */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 tracking-tight">
                          Table {tbl.tableNumber}
                        </span>
                        {isDeactivated ? (
                          <Badge variant="neutral" size="sm">
                            Deactivated
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm" dot>
                            Active
                          </Badge>
                        )}
                      </div>
                      <h5 className="text-xs font-medium text-slate-600 mt-0.5 truncate max-w-[200px]">
                        {tbl.name || `Table ${tbl.tableNumber}`}
                      </h5>
                    </div>

                    {/* Session status pill */}
                    <div className="shrink-0">
                      {isOccupied ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Occupied
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                          Vacant
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Attributes: Capacity & Area */}
                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{tbl.capacity} {tbl.capacity === 1 ? 'Guest' : 'Guests'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 font-medium truncate text-right justify-end">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{tbl.floorOrArea || 'Main Dining'}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer (Owner / Manager Only) */}
                {canManageTables && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(tbl)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors p-1.5 -ml-1 rounded-lg hover:bg-slate-100"
                      title="Edit Table Configuration"
                      id={`edit-table-btn-${tbl.id}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(tbl)}
                      disabled={isBusy}
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg transition-colors ${
                        isDeactivated
                          ? 'text-emerald-700 hover:bg-emerald-50'
                          : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                      title={
                        isDeactivated
                          ? 'Reactivate table for orders'
                          : 'Deactivate table (preserve order history)'
                      }
                      id={`toggle-table-btn-${tbl.id}`}
                    >
                      {isDeactivated ? (
                        <>
                          <Power className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Reactivate</span>
                        </>
                      ) : (
                        <>
                          <PowerOff className="w-3.5 h-3.5 text-slate-400" />
                          <span>Deactivate</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Table Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTable ? `Edit Table: ${editingTable.tableNumber}` : 'Add New Dining Table'}
        subtitle="Configure physical table number, capacity, and floor location for dine-in operations."
        maxWidth="md"
      >
        <form onSubmit={handleSubmitForm} className="space-y-4">
          {formGeneralError && (
            <div
              id="table-form-error"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formGeneralError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="table-number-input"
              label="Table Number / Code"
              placeholder="e.g. 1, 12, T-01, VIP-1"
              value={formData.tableNumber}
              onChange={(e) => setFormData({ ...formData, tableNumber: e.target.value })}
              error={fieldErrors.tableNumber}
              required
              helperText="Unique identifier shown on KOTs and POS"
            />

            <Input
              id="table-name-input"
              label="Display Name / Label"
              placeholder="e.g. Window Booth, Corner Table"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={fieldErrors.name}
              required
              helperText="Descriptive label for staff navigation"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                id="table-capacity-input"
                label="Seating Capacity"
                type="number"
                min="1"
                max="100"
                step="1"
                placeholder="4"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value, 10) || 0 })}
                error={fieldErrors.capacity}
                required
                helperText="Max standard guest seats (1-100)"
              />
            </div>

            <div>
              <label
                htmlFor="table-floor-area-input"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Floor / Area
              </label>
              <input
                id="table-floor-area-input"
                type="text"
                list="floor-areas-datalist"
                placeholder="e.g. Main Dining, AC Hall, Rooftop"
                value={formData.floorOrArea}
                onChange={(e) => setFormData({ ...formData, floorOrArea: e.target.value })}
                className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              />
              <datalist id="floor-areas-datalist">
                <option value="Main Dining" />
                <option value="First Floor" />
                <option value="AC Banquet" />
                <option value="Outdoor Patio" />
                <option value="Bar & Lounge" />
                <option value="Rooftop" />
              </datalist>
              <p className="mt-1 text-xs text-slate-400">Physical floor zone for kitchen routing</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center pt-2">
            <Input
              id="table-sort-order-input"
              label="Display Sort Order"
              type="number"
              min="0"
              step="1"
              value={formData.sortOrder}
              onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value, 10) || 0 })}
              error={fieldErrors.sortOrder}
              helperText="Lower numbers appear first on POS grid"
            />

            <div className="pt-2 sm:pt-0">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700">
                <input
                  id="table-is-active-checkbox"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <span>Table is active and available for orders</span>
              </label>
              <p className="text-[11px] text-slate-400 pl-6.5 mt-0.5">
                Inactive tables are hidden from POS order taking
              </p>
            </div>
          </div>

          {/* Modal Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleCloseModal}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSaving}
              leftIcon={<Check className="w-4 h-4" />}
              id="save-table-submit-btn"
            >
              {isSaving ? 'Saving...' : editingTable ? 'Update Table' : 'Create Table'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

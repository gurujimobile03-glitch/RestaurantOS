import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Phone,
  Mail,
  FileText,
  User,
  Edit2,
  PowerOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Supplier, CreateSupplierDTO, UpdateSupplierDTO } from '../../types/supplier';
import { supplierService } from '../../services/supplierService';
import { SupplierModal } from './SupplierModal';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

interface SupplierListViewProps {
  restaurantId: string;
}

export const SupplierListView: React.FC<SupplierListViewProps> = ({ restaurantId }) => {
  const { profile } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const canManageSuppliers = hasPermission(profile?.role, 'manage_suppliers');

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await supplierService.getSuppliers(restaurantId, {
        activeOnly: activeFilter === 'active' ? true : undefined,
        search: search.trim() || undefined
      });
      setSuppliers(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();

    // Subscribe to realtime updates
    const unsubscribe = supplierService.listenToSuppliers(
      restaurantId,
      updated => {
        let filtered = updated;
        if (activeFilter === 'active') {
          filtered = filtered.filter(s => s.active);
        } else if (activeFilter === 'inactive') {
          filtered = filtered.filter(s => !s.active);
        }
        if (search.trim()) {
          const term = search.trim().toLowerCase();
          filtered = filtered.filter(
            s =>
              s.name.toLowerCase().includes(term) ||
              s.phone.toLowerCase().includes(term) ||
              (s.contactPerson && s.contactPerson.toLowerCase().includes(term))
          );
        }
        setSuppliers(filtered);
      },
      err => {
        console.error('Supplier subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [restaurantId, activeFilter, search]);

  const handleSaveSupplier = async (data: CreateSupplierDTO | UpdateSupplierDTO) => {
    if (selectedSupplier) {
      await supplierService.updateSupplier(restaurantId, selectedSupplier.supplierId, data);
    } else {
      await supplierService.createSupplier(restaurantId, data as CreateSupplierDTO);
    }
  };

  const handleDeactivate = async (supplier: Supplier) => {
    if (!window.confirm(`Are you sure you want to deactivate "${supplier.name}"? Active purchase orders will still be preserved.`)) {
      return;
    }
    try {
      setActionLoading(true);
      await supplierService.deactivateSupplier(restaurantId, supplier.supplierId);
    } catch (err: any) {
      alert(err?.message || 'Failed to deactivate supplier');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by supplier name, phone, contact..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveFilter('active')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeFilter === 'active'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeFilter === 'all'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveFilter('inactive')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeFilter === 'inactive'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSuppliers}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
            title="Refresh Suppliers"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canManageSuppliers && (
            <button
              onClick={() => {
                setSelectedSupplier(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-600/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Supplier</span>
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

      {/* Suppliers Table/Grid */}
      {loading && suppliers.length === 0 ? (
        <div className="py-16 text-center text-slate-500 dark:text-slate-400">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3 text-indigo-500" />
          <p className="text-sm">Loading registered suppliers...</p>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <Building2 className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Suppliers Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? 'No suppliers match your search query.'
              : 'Add your vendors and suppliers to begin creating purchase orders.'}
          </p>
          {canManageSuppliers && !search && (
            <button
              onClick={() => {
                setSelectedSupplier(null);
                setModalOpen(true);
              }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl"
            >
              <Plus className="w-4 h-4" />
              <span>Register First Supplier</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3.5">Supplier Name</th>
                  <th className="px-6 py-3.5">Contact Info</th>
                  <th className="px-6 py-3.5">Tax / GST</th>
                  <th className="px-6 py-3.5">Status</th>
                  {canManageSuppliers && <th className="px-6 py-3.5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {suppliers.map(s => (
                  <tr
                    key={s.supplierId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{s.name}</span>
                      </div>
                      {s.contactPerson && (
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{s.contactPerson}</span>
                        </div>
                      )}
                      {s.address && (
                        <div className="text-xs text-slate-400 truncate max-w-xs mt-0.5">
                          {s.address}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{s.phone}</span>
                      </div>
                      {s.email && (
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate max-w-[180px]">{s.email}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {s.gstNumber ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          <FileText className="w-3 h-3 text-slate-400" />
                          {s.gstNumber}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not registered</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {s.active ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <PowerOff className="w-3.5 h-3.5" />
                          Inactive
                        </span>
                      )}
                    </td>

                    {canManageSuppliers && (
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedSupplier(s);
                              setModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Supplier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {s.active && (
                            <button
                              onClick={() => handleDeactivate(s)}
                              disabled={actionLoading}
                              className="p-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title="Deactivate Supplier"
                            >
                              <PowerOff className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Supplier Create/Edit Modal */}
      {modalOpen && (
        <SupplierModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSaveSupplier}
          supplier={selectedSupplier}
        />
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { Search, Calendar, RefreshCw, X } from 'lucide-react';

export interface AuditFiltersState {
  action: string;
  entityType: string;
  actorUid: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

interface AuditLogFiltersProps {
  filters: AuditFiltersState;
  onFilterChange: (filters: AuditFiltersState) => void;
  onReset: () => void;
  isLoading: boolean;
}

export const AuditLogFilters: React.FC<AuditLogFiltersProps> = ({
  filters,
  onFilterChange,
  onReset,
  isLoading
}) => {
  const [dateError, setDateError] = useState<string | null>(null);

  const entityTypes = [
    { value: '', label: 'All Entity Types' },
    { value: 'order', label: 'Order' },
    { value: 'table', label: 'Table' },
    { value: 'tableSession', label: 'Table Session' },
    { value: 'payment', label: 'Payment' },
    { value: 'kot', label: 'Kitchen Ticket (KOT)' },
    { value: 'restaurant', label: 'Restaurant' },
    { value: 'menuItem', label: 'Menu Item' },
    { value: 'category', label: 'Category' }
  ];

  const actions = [
    { value: '', label: 'All Actions' },
    { value: 'order_created', label: 'Order Created' },
    { value: 'order_updated', label: 'Order Updated' },
    { value: 'order_cancelled', label: 'Order Cancelled' },
    { value: 'discount_applied', label: 'Discount Applied' },
    { value: 'payment_created', label: 'Payment Created' },
    { value: 'payment_refunded', label: 'Payment Refunded' },
    { value: 'kot_created', label: 'KOT Created' },
    { value: 'kot_status_changed', label: 'KOT Status Changed' },
    { value: 'table_created', label: 'Table Created' },
    { value: 'table_updated', label: 'Table Updated' },
    { value: 'session_opened', label: 'Session Opened' },
    { value: 'session_closed', label: 'Session Closed' }
  ];

  const handleFieldChange = (field: keyof AuditFiltersState, value: string) => {
    const updatedFilters = { ...filters, [field]: value };

    // Validate date order if both are filled
    if (field === 'startDate' || field === 'endDate') {
      const start = updatedFilters.startDate;
      const end = updatedFilters.endDate;

      if (start && end && new Date(start) > new Date(end)) {
        setDateError('Start date cannot be after end date.');
        return; // Don't trigger search if invalid
      } else {
        setDateError(null);
      }
    }

    onFilterChange(updatedFilters);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs mb-6" id="audit-filters-container">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Entity Type Filter */}
        <div>
          <label htmlFor="filter-entity-type" className="block text-xs font-semibold text-slate-500 mb-1">Entity Type</label>
          <select
            id="filter-entity-type"
            value={filters.entityType}
            onChange={(e) => handleFieldChange('entityType', e.target.value)}
            disabled={isLoading}
            className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {entityTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action Filter */}
        <div>
          <label htmlFor="filter-action" className="block text-xs font-semibold text-slate-500 mb-1">Action Type</label>
          <select
            id="filter-action"
            value={filters.action}
            onChange={(e) => handleFieldChange('action', e.target.value)}
            disabled={isLoading}
            className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {actions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        {/* Actor Uid Filter */}
        <div>
          <label htmlFor="filter-actor-uid" className="block text-xs font-semibold text-slate-500 mb-1">Actor Uid</label>
          <div className="relative">
            <input
              id="filter-actor-uid"
              type="text"
              placeholder="Filter by Actor Uid"
              value={filters.actorUid}
              onChange={(e) => handleFieldChange('actorUid', e.target.value)}
              disabled={isLoading}
              className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        {/* Start Date */}
        <div>
          <label htmlFor="filter-start-date" className="block text-xs font-semibold text-slate-500 mb-1">Start Date</label>
          <div className="relative">
            <input
              id="filter-start-date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFieldChange('startDate', e.target.value)}
              disabled={isLoading}
              className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <Calendar className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        {/* End Date */}
        <div>
          <label htmlFor="filter-end-date" className="block text-xs font-semibold text-slate-500 mb-1">End Date</label>
          <div className="relative">
            <input
              id="filter-end-date"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFieldChange('endDate', e.target.value)}
              disabled={isLoading}
              className="w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <Calendar className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {dateError && (
        <p className="text-red-500 text-[11px] font-semibold mt-2" id="date-validation-error">
          {dateError}
        </p>
      )}

      {/* Quick helper controls */}
      {(filters.action || filters.entityType || filters.actorUid || filters.startDate || filters.endDate) && (
        <div className="flex items-center justify-end mt-3 pt-3 border-t border-slate-100 gap-2">
          <button
            onClick={onReset}
            disabled={isLoading}
            id="btn-clear-filters"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear Active Filters
          </button>
        </div>
      )}
    </div>
  );
};

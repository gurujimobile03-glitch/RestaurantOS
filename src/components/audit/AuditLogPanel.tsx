import React, { useState, useEffect, useCallback } from 'react';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { isViewAllowed, hasPermission } from '../../utils/permissions';
import { auditService } from '../../services/auditService';
import { AuditLog } from '../../types/audit';
import { AuditLogFilters, AuditFiltersState } from './AuditLogFilters';
import {
  ShieldAlert,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  FileText,
  User,
  Clock,
  Briefcase
} from 'lucide-react';
import { DocumentSnapshot } from 'firebase/firestore';

const PAGE_SIZE = 50;

export const AuditLogPanel: React.FC = () => {
  const { restaurant } = useRestaurant();
  const { profile, user } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination states
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [cursors, setCursors] = useState<(DocumentSnapshot | null)[]>([null]);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [nextPageDoc, setNextPageDoc] = useState<DocumentSnapshot | null>(null);

  // Detail modal state
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filter state
  const [filters, setFilters] = useState<AuditFiltersState>({
    action: '',
    entityType: '',
    actorUid: '',
    startDate: '',
    endDate: ''
  });

  const userRole = profile?.role || 'owner';
  const isAuthorized = isViewAllowed(userRole, 'audit');

  const fetchLogs = useCallback(async (cursorDoc: DocumentSnapshot | null, isNext = false) => {
    if (!restaurant?.restaurantId) return;
    setIsLoading(true);
    setError(null);

    try {
      // Parse dates safely for Firestore queries
      const startDate = filters.startDate ? new Date(filters.startDate) : undefined;
      let endDate = filters.endDate ? new Date(filters.endDate) : undefined;

      // Force end of day for the endDate filter
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
      }

      if (startDate && endDate && startDate > endDate) {
        throw new Error('Start date cannot be after end date.');
      }

      const { logs: fetchedLogs, lastVisible } = await auditService.getPaginatedLogs(
        restaurant.restaurantId,
        {
          action: filters.action || undefined,
          entityType: filters.entityType || undefined,
          actorUid: filters.actorUid?.trim() || undefined,
          startDate,
          endDate
        },
        PAGE_SIZE,
        cursorDoc || undefined
      );

      setLogs(fetchedLogs);
      setNextPageDoc(lastVisible);

      // Determine if more records could exist (if we returned a full page)
      setHasMore(fetchedLogs.length === PAGE_SIZE);

      if (isNext && lastVisible) {
        setCursors(prev => [...prev, lastVisible]);
      }
    } catch (err: any) {
      const isPerm = err?.code === 'permission-denied' || (err?.message && err.message.includes('permission'));
      if (isPerm) {
        console.warn('[AuditLogPanel] Audit log query restricted by backend security rules.');
        setError('Audit logs require administrator security rules deployed in Firebase Console.');
      } else {
        console.error('Failed to load audit logs:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching audit logs.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [restaurant?.restaurantId, filters]);

  // Initial load or filter change
  useEffect(() => {
    if (isAuthorized && restaurant?.restaurantId) {
      setPageIndex(0);
      setCursors([null]);
      fetchLogs(null, false);
    }
  }, [isAuthorized, restaurant?.restaurantId, filters, fetchLogs]);

  const handleNextPage = () => {
    if (hasMore && nextPageDoc) {
      const nextIndex = pageIndex + 1;
      setPageIndex(nextIndex);
      fetchLogs(nextPageDoc, true);
    }
  };

  const handlePrevPage = () => {
    if (pageIndex > 0) {
      const prevIndex = pageIndex - 1;
      setPageIndex(prevIndex);
      // Fetch using the cursor of the previous page start
      fetchLogs(cursors[prevIndex], false);
      // Slice off the forward cursor history beyond this point
      setCursors(prev => prev.slice(0, prevIndex + 1));
    }
  };

  const handleResetFilters = () => {
    setFilters({
      action: '',
      entityType: '',
      actorUid: '',
      startDate: '',
      endDate: ''
    });
  };

  // Helper to format timestamps gracefully
  const formatTimestamp = (ts: any) => {
    if (!ts) return 'N/A';
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  };

  // Helper to safely clean and render metadata without sensitive fields
  const getCleanMetadata = (meta: any) => {
    if (!meta) return null;
    const clean: Record<string, any> = {};
    const sensitiveWords = ['password', 'secret', 'token', 'cvv', 'card', 'key', 'auth'];

    Object.keys(meta).forEach(key => {
      const isSensitive = sensitiveWords.some(word => key.toLowerCase().includes(word));
      if (!isSensitive) {
        clean[key] = meta[key];
      }
    });

    return Object.keys(clean).length > 0 ? clean : null;
  };

  if (!isAuthorized) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-lg mx-auto my-12 shadow-xs" id="audit-permission-denied">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-200/60">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1.5">Permission Denied</h2>
        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          Your staff role ({userRole}) does not have permission to access the immutable audit log viewer. Only Owners, Managers, and Accountants can view administrative logs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="audit-log-panel-root">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 font-display">
            Operational Audit Logs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable log of state modifications and business operations.
          </p>
        </div>
        <button
          onClick={() => fetchLogs(cursors[pageIndex], false)}
          disabled={isLoading}
          id="btn-refresh-audit"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Log
        </button>
      </div>

      {/* Filters Component */}
      <AuditLogFilters
        filters={filters}
        onFilterChange={setFilters}
        onReset={handleResetFilters}
        isLoading={isLoading}
      />

      {/* Main List Box */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
        {isLoading && logs.length === 0 ? (
          /* Loading State */
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]" id="audit-loading-state">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
            <span className="text-xs font-bold text-slate-900">Loading operational logs...</span>
            <span className="text-[11px] text-slate-500 mt-1">Grounded in immutable chronological order</span>
          </div>
        ) : error ? (
          /* Error State with Retry */
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]" id="audit-error-state">
            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Failed to Retrieve Audit Log</h3>
            <p className="text-xs text-slate-600 mt-1.5 max-w-md mx-auto leading-relaxed">{error}</p>
            <button
              onClick={() => fetchLogs(cursors[pageIndex], false)}
              id="btn-retry-audit"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Query
            </button>
          </div>
        ) : logs.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]" id="audit-empty-state">
            <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-4">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">No Audit Events</h3>
            <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto leading-relaxed">
              No audit logs were found matching the active filters for this period. Try clearing the filters or selecting a wider date range.
            </p>
          </div>
        ) : (
          /* Table Layout */
          <div className="divide-y divide-slate-100" id="audit-table-view">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Entity Type</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatTimestamp(log.createdAt)}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[10px] font-bold border border-slate-200">
                          {log.entityType}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-semibold text-slate-900">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="flex items-center gap-1.5 font-mono text-slate-600">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {log.actorUid === user?.uid ? 'You' : log.actorUid.substring(0, 8) + '...'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3 h-3" />
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination panel */}
            <div className="px-4 py-3 bg-slate-50 flex items-center justify-between border-t border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500">
                Page {pageIndex + 1} • Showing {logs.length} logs
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevPage}
                  disabled={pageIndex === 0 || isLoading}
                  id="btn-prev-page"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={!hasMore || isLoading}
                  id="btn-next-page"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Audit Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs" id="audit-log-modal">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Audit Log Record</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Event Metadata Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Action</span>
                  <span className="text-xs font-bold text-slate-900 block mt-0.5">{selectedLog.action}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Timestamp</span>
                  <span className="text-xs font-bold text-slate-900 block mt-0.5">{formatTimestamp(selectedLog.createdAt)}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Entity Type</span>
                  <span className="text-xs font-bold text-slate-900 block mt-0.5">{selectedLog.entityType}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Entity ID</span>
                  <span className="text-xs font-bold font-mono text-slate-900 block mt-0.5 truncate" title={selectedLog.entityId}>
                    {selectedLog.entityId}
                  </span>
                </div>
              </div>

              {/* Actor Identity Detail */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Authorized Actor Uid</span>
                <span className="text-xs font-mono text-slate-800 block mt-1 select-all">{selectedLog.actorUid}</span>
              </div>

              {/* Cleaned Safe Metadata Objects */}
              {selectedLog.metadata && getCleanMetadata(selectedLog.metadata) ? (
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Safe Metadata Payload</span>
                  <pre className="text-[11px] font-mono bg-slate-900 text-slate-300 p-3 rounded-xl overflow-x-auto max-h-48 border border-slate-850">
                    {JSON.stringify(getCleanMetadata(selectedLog.metadata), null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center">
                  <span className="text-[11px] text-slate-500 font-semibold">No safe descriptive metadata attached to this record.</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end bg-slate-50">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

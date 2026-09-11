import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert, Clock } from 'lucide-react';
import { offlineSyncService } from '../services/offlineSyncService';
import { SyncStats, OfflineQueueItem } from '../types/offlineQueue';

export const OfflineSyncIndicator: React.FC = () => {
  const [stats, setStats] = useState<SyncStats>({
    total: 0,
    queued: 0,
    syncing: 0,
    completed: 0,
    failed: 0,
    deadLetter: 0,
    conflict: 0,
    stale: 0
  });
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = offlineSyncService.subscribe((newStats, newQueue) => {
      setStats(newStats);
      setQueue(newQueue);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const pendingCount = stats.queued + stats.syncing + stats.failed;
  const conflictCount = stats.conflict + stats.stale;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 ${
          !isOnline
            ? 'bg-amber-500/10 text-amber-700 border-amber-300'
            : conflictCount > 0
            ? 'bg-purple-50 text-purple-700 border-purple-300'
            : stats.deadLetter > 0
            ? 'bg-rose-50 text-rose-700 border-rose-300'
            : pendingCount > 0
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}
        title="Sync Status & Offline Queue"
      >
        {!isOnline ? (
          <>
            <WifiOff className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Offline</span>
          </>
        ) : (
          <>
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Online</span>
          </>
        )}

        {pendingCount > 0 && (
          <span className="flex items-center gap-1 bg-indigo-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
            {pendingCount}
          </span>
        )}

        {conflictCount > 0 && (
          <span className="flex items-center gap-0.5 bg-purple-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            <ShieldAlert className="w-2.5 h-2.5" />
            {conflictCount}
          </span>
        )}

        {stats.deadLetter > 0 && (
          <span className="flex items-center gap-0.5 bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
            <AlertCircle className="w-2.5 h-2.5" />
            {stats.deadLetter}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-88 rounded-2xl bg-white shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  !isOnline
                    ? 'bg-amber-500'
                    : conflictCount > 0
                    ? 'bg-purple-500'
                    : 'bg-emerald-500'
                }`}
              />
              <h4 className="text-xs font-bold text-slate-800">
                {!isOnline
                  ? 'Offline Mode (Local Storage)'
                  : conflictCount > 0
                  ? 'Conflict Detected (Server-Authoritative)'
                  : 'Cloud Sync Active'}
              </h4>
            </div>
            {isOnline && pendingCount > 0 && (
              <button
                onClick={() => offlineSyncService.processQueue()}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Sync Now
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5 py-3 border-b border-slate-100 text-center">
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
              <p className="text-[9px] text-slate-500 font-medium">Pending</p>
              <p className="text-xs font-bold text-slate-800">{pendingCount}</p>
            </div>
            <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
              <p className="text-[9px] text-emerald-600 font-medium">Synced</p>
              <p className="text-xs font-bold text-emerald-700">{stats.completed}</p>
            </div>
            <div className="bg-purple-50 p-2 rounded-xl border border-purple-100">
              <p className="text-[9px] text-purple-600 font-medium">Conflict</p>
              <p className="text-xs font-bold text-purple-700">{conflictCount}</p>
            </div>
            <div className="bg-rose-50 p-2 rounded-xl border border-rose-100">
              <p className="text-[9px] text-rose-600 font-medium">Failed</p>
              <p className="text-xs font-bold text-rose-700">{stats.deadLetter}</p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-slate-700">Recent Queue Items</p>
              {stats.completed > 0 && (
                <button
                  onClick={() => offlineSyncService.clearCompleted()}
                  className="text-[10px] text-slate-400 hover:text-slate-600"
                >
                  Clear Finished
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No queued operations</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {queue.slice(-6).reverse().map(item => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border text-xs flex flex-col gap-1 ${
                      item.status === 'conflict' || item.status === 'stale'
                        ? 'bg-purple-50/50 border-purple-200'
                        : item.status === 'dead_letter'
                        ? 'bg-rose-50/50 border-rose-200'
                        : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-800 truncate capitalize text-[11px]">
                        {item.operation.replace(/_/g, ' ')}
                      </p>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded capitalize shrink-0 ${
                          item.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.status === 'syncing'
                            ? 'bg-indigo-100 text-indigo-700'
                            : item.status === 'conflict' || item.status === 'stale'
                            ? 'bg-purple-100 text-purple-700'
                            : item.status === 'dead_letter'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    {item.conflictReason && (
                      <p className="text-[10px] text-purple-700 font-medium">
                        Conflict: {item.conflictReason}
                      </p>
                    )}

                    {item.lastError && !item.conflictReason && (
                      <p className="text-[10px] text-rose-600 truncate">
                        Error: {item.lastError}
                      </p>
                    )}

                    {(item.status === 'conflict' || item.status === 'stale') && (
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={() => offlineSyncService.resolveConflict(item.id, 'server_wins')}
                          className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-semibold hover:bg-purple-700"
                        >
                          Accept Server State
                        </button>
                        <button
                          onClick={() => offlineSyncService.retryItem(item.id)}
                          className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold hover:bg-slate-300"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {item.status === 'dead_letter' && (
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={() => offlineSyncService.retryItem(item.id)}
                          className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-semibold hover:bg-rose-700"
                        >
                          Retry Op
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

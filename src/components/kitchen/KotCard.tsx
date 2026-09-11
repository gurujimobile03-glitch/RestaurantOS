import React, { useState, useEffect } from 'react';
import {
  Clock,
  Utensils,
  ShoppingBag,
  Truck,
  CheckCircle2,
  CookingPot,
  XCircle,
  FileText,
  CloudOff,
  RefreshCw,
  ChevronRight,
  Printer
} from 'lucide-react';
import { KOT, KOTStatus } from '../../types/kot';
import { OrderType } from '../../types/order';
import { OfflineQueueItem } from '../../types/offlineQueue';
import { useRestaurant } from '../../context/RestaurantContext';
import { printerService } from '../../services/printer/PrinterService';
import {
  calculateKOTElapsedTimeMinutes,
  formatElapsedTime,
  getNextValidKOTAction
} from '../../utils/kotQueueHelpers';

interface KotCardProps {
  kot: KOT;
  tableName?: string | null;
  orderType?: OrderType | null;
  orderNumber?: string | null;
  onStatusChange: (kotId: string, nextStatus: KOTStatus) => void;
  onCancel: (kotId: string) => void;
  isUpdating?: boolean;
  queuedItem?: OfflineQueueItem | null;
  onRetrySync?: (queueItemId: string) => void;
}

export const KotCard: React.FC<KotCardProps> = ({
  kot,
  tableName,
  orderType,
  orderNumber,
  onStatusChange,
  onCancel,
  isUpdating = false,
  queuedItem,
  onRetrySync
}) => {
  const { restaurant } = useRestaurant();
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(() =>
    calculateKOTElapsedTimeMinutes(kot)
  );
  const [isPrintingKot, setIsPrintingKot] = useState(false);

  const handlePrintKot = async () => {
    const restId = restaurant?.restaurantId || restaurant?.id || kot.restaurantId;
    if (!restId) return;
    setIsPrintingKot(true);
    try {
      await printerService.printKOT(restId, kot, {
        restaurantName: restaurant?.name,
        orderNumber: orderNumber || undefined,
        tableName: tableName || undefined,
        orderType: orderType || undefined
      });
    } catch (err) {
      console.warn('KOT Print dispatch failed:', err);
    } finally {
      setIsPrintingKot(false);
    }
  };

  // Live timer for elapsed minutes
  useEffect(() => {
    const updateTimer = () => {
      setElapsedMinutes(calculateKOTElapsedTimeMinutes(kot));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [kot]);

  const isOverdue = elapsedMinutes >= 20;
  const isWarning = elapsedMinutes >= 10 && elapsedMinutes < 20;

  // Determine valid next action
  const nextAction = getNextValidKOTAction(kot.status);
  const isPendingSync = queuedItem?.status === 'queued' || queuedItem?.status === 'syncing';
  const isDisabled = isUpdating || isPendingSync;

  // Render Order Type Badge (Dine-In with Table Name, Takeaway, Delivery)
  const renderOrderTypeBadge = () => {
    const resolvedType = orderType || (kot.tableId ? 'dineIn' : 'takeaway');

    switch (resolvedType) {
      case 'dineIn':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold">
            <Utensils className="w-3.5 h-3.5 text-indigo-400" />
            <span>{tableName ? tableName : 'Dine-In'}</span>
          </span>
        );
      case 'takeaway':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold">
            <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
            <span>Takeaway</span>
          </span>
        );
      case 'delivery':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold">
            <Truck className="w-3.5 h-3.5 text-purple-400" />
            <span>Delivery</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold">
            <Utensils className="w-3.5 h-3.5" />
            <span>{resolvedType}</span>
          </span>
        );
    }
  };

  // Status Badge
  const renderStatusBadge = () => {
    switch (kot.status) {
      case 'confirmed':
      case 'sentToKitchen':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold">
            <Clock className="w-3 h-3 text-indigo-400 animate-pulse" />
            <span>Waiting</span>
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
            <CookingPot className="w-3 h-3 text-amber-400 animate-bounce" />
            <span>Preparing</span>
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Ready</span>
          </span>
        );
      case 'served':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-bold">
            <span>Served</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-testid={`kot-card-${kot.id}`}
      className={`rounded-2xl bg-slate-900 border text-white flex flex-col shadow-lg transition-all duration-200 overflow-hidden relative ${
        isOverdue
          ? 'border-rose-500/60 shadow-rose-950/30 ring-1 ring-rose-500/40'
          : isWarning
          ? 'border-amber-500/50 shadow-amber-950/20'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Header Bar */}
      <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black font-mono text-white tracking-wider">
              {kot.kotNumber}
            </h2>
            <button
              type="button"
              data-testid={`print-kot-${kot.id}`}
              onClick={handlePrintKot}
              disabled={isPrintingKot}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
              title="Print KOT"
            >
              <Printer className={`w-3.5 h-3.5 ${isPrintingKot ? 'animate-pulse text-indigo-400' : ''}`} />
            </button>
            {renderStatusBadge()}
          </div>
          {orderNumber && (
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
              Ref: {orderNumber}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          {renderOrderTypeBadge()}
          {/* Elapsed Timer Badge */}
          <div
            className={`flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded-md border ${
              isOverdue
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                : isWarning
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{formatElapsedTime(elapsedMinutes)} ago</span>
          </div>
        </div>
      </div>

      {/* Offline Sync Banner */}
      {queuedItem && (
        <div
          className={`px-4 py-2 border-b text-xs font-semibold flex items-center justify-between gap-2 ${
            queuedItem.status === 'queued'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
              : queuedItem.status === 'syncing'
              ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200 animate-pulse'
              : queuedItem.status === 'failed' || queuedItem.status === 'dead_letter'
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <CloudOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span>
              {queuedItem.status === 'queued' && `Queued Offline (${queuedItem.operation})`}
              {queuedItem.status === 'syncing' && `Syncing update...`}
              {(queuedItem.status === 'failed' || queuedItem.status === 'dead_letter') &&
                `Sync Failed: ${queuedItem.lastError || 'Network Error'}`}
            </span>
          </div>
          {(queuedItem.status === 'failed' || queuedItem.status === 'dead_letter') && onRetrySync && (
            <button
              type="button"
              onClick={() => onRetrySync(queuedItem.id)}
              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 transition-colors min-h-[32px]"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Ticket Level Notes */}
      {kot.notes && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-xs font-medium flex items-start gap-2">
          <FileText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span className="leading-tight">{kot.notes}</span>
        </div>
      )}

      {/* Item List optimized for production readability */}
      <div className="p-4 flex-1 space-y-3.5 overflow-y-auto max-h-[340px]">
        {kot.items.map((item, index) => (
          <div
            key={`${item.itemId}_${index}`}
            className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80 last:border-0 last:pb-0"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center min-w-[32px] h-8 px-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-black text-sm shrink-0 shadow-xs">
                {item.quantity}x
              </span>
              <div>
                <p className="text-base font-extrabold text-white leading-snug tracking-wide">
                  {item.shortNameSnapshot || item.nameSnapshot}
                </p>
                {/* Modifiers */}
                {item.modifiers && item.modifiers.length > 0 && (
                  <p className="text-xs font-medium text-slate-300 mt-0.5 leading-tight">
                    + {item.modifiers.map((m) => m.name).join(', ')}
                  </p>
                )}
                {/* Item Notes */}
                {item.notes && (
                  <p className="text-xs font-semibold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-lg border border-amber-500/30 mt-1 inline-block">
                    📝 {item.notes}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Actions — Touch Friendly & Valid Next Actions Only */}
      <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-2">
        {/* Cancel Button */}
        {kot.status !== 'served' && kot.status !== 'cancelled' && (
          <button
            type="button"
            data-testid={`cancel-kot-${kot.id}`}
            onClick={() => onCancel(kot.id)}
            disabled={isDisabled}
            className="px-3 py-2.5 rounded-xl bg-slate-800/80 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-700/80 transition-colors text-xs font-bold flex items-center gap-1.5 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            title="Cancel KOT"
          >
            <XCircle className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Cancel</span>
          </button>
        )}

        {/* Valid Primary Next Action Button */}
        {nextAction && (
          <button
            type="button"
            data-testid={`action-kot-${kot.id}`}
            onClick={() => onStatusChange(kot.id, nextAction.actionStatus)}
            disabled={isDisabled}
            className={`flex-1 px-4 py-2.5 rounded-xl font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed ${
              nextAction.actionStatus === 'preparing'
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/40'
                : nextAction.actionStatus === 'ready'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/40'
            }`}
          >
            {nextAction.actionStatus === 'preparing' && <CookingPot className="w-4 h-4 shrink-0" />}
            {nextAction.actionStatus === 'ready' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {nextAction.actionStatus === 'served' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{nextAction.label}</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-70" />
          </button>
        )}
      </div>
    </div>
  );
};

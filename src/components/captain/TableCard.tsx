import React from 'react';
import { Table, TableSession } from '../../types/table';
import { Order } from '../../types/order';
import { KOT } from '../../types/kot';
import { Users, Clock, Utensils, CheckCircle2, CookingPot, AlertCircle, ArrowRight, History } from 'lucide-react';

interface TableCardProps {
  table: Table;
  activeSession: TableSession | null;
  activeOrder: Order | null;
  kots: KOT[];
  onClick: () => void;
  onViewHistory?: (table: Table) => void;
}

export const TableCard: React.FC<TableCardProps> = ({
  table,
  activeSession,
  activeOrder,
  kots,
  onClick,
  onViewHistory
}) => {
  const isOccupied = !!activeSession && activeSession.status === 'open';

  // Find latest active KOT status
  const activeKots = kots.filter((k) => k.tableId === table.id && k.status !== 'cancelled');
  const latestKot = activeKots.length > 0 ? activeKots[activeKots.length - 1] : null;

  // Calculate session elapsed minutes if active
  let elapsedMinutes = 0;
  if (isOccupied && activeSession?.openedAt) {
    const openedTime =
      typeof activeSession.openedAt?.toDate === 'function'
        ? activeSession.openedAt.toDate().getTime()
        : new Date(activeSession.openedAt).getTime();
    if (!isNaN(openedTime)) {
      elapsedMinutes = Math.max(0, Math.floor((Date.now() - openedTime) / (1000 * 60)));
    }
  }

  return (
    <div
      data-testid={`table-card-${table.id}`}
      onClick={onClick}
      className={`group relative rounded-2xl border transition-all duration-200 cursor-pointer p-4 flex flex-col justify-between shadow-xs hover:shadow-md min-h-[170px] ${
        isOccupied
          ? 'bg-slate-900/90 border-amber-500/40 hover:border-amber-400'
          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
      }`}
    >
      {/* Top Header: Table Number/Name & Floor Area */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-white tracking-tight">
              Table {table.tableNumber}
            </h3>
            {table.name && table.name !== `Table ${table.tableNumber}` && (
              <span className="text-xs font-semibold text-slate-400 truncate max-w-[100px]">
                ({table.name})
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-slate-400 mt-0.5">
            {table.floorOrArea || 'Main Area'} • Cap: {table.capacity}
          </p>
        </div>

        {/* Status Badge & History Icon */}
        <div className="flex items-center gap-1.5">
          {onViewHistory && (
            <button
              type="button"
              data-testid={`btn-table-history-${table.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onViewHistory(table);
              }}
              title={`View Table ${table.tableNumber} History`}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <History className="w-3.5 h-3.5" />
            </button>
          )}

          <span
            data-testid={`table-status-${table.id}`}
            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide border flex items-center gap-1.5 ${
              isOccupied
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOccupied ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            {isOccupied ? 'Occupied' : 'Available'}
          </span>
        </div>
      </div>

      {/* Middle Body: Active Session & Order Information */}
      {isOccupied ? (
        <div className="my-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-400 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>{activeSession.guestCount} Guests</span>
            </span>
            <span className="text-slate-400 flex items-center gap-1 font-mono text-[11px]">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{elapsedMinutes}m ago</span>
            </span>
          </div>

          {activeOrder ? (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-xs font-bold text-indigo-300 truncate">
                #{activeOrder.orderNumber} ({activeOrder.items?.length || 0} items)
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                {activeOrder.status}
              </span>
            </div>
          ) : (
            <div className="pt-1 border-t border-slate-800/60 text-[11px] text-amber-400/90 font-medium">
              No active order started
            </div>
          )}
        </div>
      ) : (
        <div className="my-3 text-xs text-slate-500 flex items-center gap-1.5 italic">
          <span>Tap to open table session</span>
        </div>
      )}

      {/* Footer: KOT Status Indicator or Action Target */}
      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
        {latestKot ? (
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            {latestKot.status === 'sentToKitchen' && (
              <span className="text-indigo-400 flex items-center gap-1 text-[11px]">
                <Clock className="w-3 h-3" />
                <span>KOT Waiting</span>
              </span>
            )}
            {latestKot.status === 'preparing' && (
              <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                <CookingPot className="w-3 h-3" />
                <span>KOT Preparing</span>
              </span>
            )}
            {latestKot.status === 'ready' && (
              <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-bold animate-pulse">
                <CheckCircle2 className="w-3 h-3" />
                <span>KOT Ready!</span>
              </span>
            )}
            {latestKot.status === 'served' && (
              <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                <CheckCircle2 className="w-3 h-3 text-slate-500" />
                <span>KOT Served</span>
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-500">
            {isOccupied ? 'Ready for KOT' : 'Capacity ' + table.capacity}
          </span>
        )}

        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};

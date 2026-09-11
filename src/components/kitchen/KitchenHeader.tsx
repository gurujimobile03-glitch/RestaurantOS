import React from 'react';
import { CookingPot, User, RefreshCw, Layers, Clock, AlertTriangle, LayoutGrid, Columns } from 'lucide-react';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { OfflineSyncIndicator } from '../OfflineSyncIndicator';

export type KitchenFilterOption = 'all' | 'waiting' | 'preparing' | 'ready';
export type KitchenViewMode = 'lanes' | 'grid';

interface KitchenHeaderProps {
  totalActiveCount: number;
  waitingCount: number;
  preparingCount: number;
  readyCount: number;
  overdueCount: number;
  selectedFilter: KitchenFilterOption;
  onFilterChange: (filter: KitchenFilterOption) => void;
  viewMode: KitchenViewMode;
  onViewModeChange: (mode: KitchenViewMode) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const KitchenHeader: React.FC<KitchenHeaderProps> = ({
  totalActiveCount,
  waitingCount,
  preparingCount,
  readyCount,
  overdueCount,
  selectedFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  isRefreshing = false
}) => {
  const { restaurant } = useRestaurant();
  const { profile, user } = useAuth();

  return (
    <header className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 text-white px-4 py-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Outlet & Kitchen Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-amber-900/40 shrink-0">
            <CookingPot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight truncate max-w-[180px] sm:max-w-xs">
                {restaurant?.name || 'RestaurantOS'} — Kitchen KOT
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-semibold border border-slate-700">
                KDS v1
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <User className="w-3 h-3 text-slate-500" />
              <span>{profile?.displayName || user?.email?.split('@')[0] || 'Kitchen Staff'}</span>
              <span className="text-slate-600">•</span>
              <span className="capitalize text-amber-400/90 font-medium">{profile?.role || 'kitchen'}</span>
            </p>
          </div>
        </div>

        {/* Center: Live Operational Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
          <button
            type="button"
            data-testid="filter-all"
            onClick={() => onFilterChange('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedFilter === 'all'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All ({totalActiveCount})</span>
          </button>

          <button
            type="button"
            data-testid="filter-waiting"
            onClick={() => onFilterChange('waiting')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedFilter === 'waiting'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Waiting ({waitingCount})</span>
          </button>

          <button
            type="button"
            data-testid="filter-preparing"
            onClick={() => onFilterChange('preparing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedFilter === 'preparing'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <CookingPot className="w-3.5 h-3.5 text-amber-400" />
            <span>Preparing ({preparingCount})</span>
          </button>

          <button
            type="button"
            data-testid="filter-ready"
            onClick={() => onFilterChange('ready')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedFilter === 'ready'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Ready ({readyCount})</span>
          </button>

          {overdueCount > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold animate-pulse ml-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>{overdueCount} Overdue</span>
            </span>
          )}
        </div>

        {/* Right: View Mode Toggle, Offline Indicator & Refresh */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              data-testid="view-lanes"
              onClick={() => onViewModeChange('lanes')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                viewMode === 'lanes'
                  ? 'bg-slate-700 text-amber-400 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="3-Lane Operational Columns View"
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              type="button"
              data-testid="view-grid"
              onClick={() => onViewModeChange('grid')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                viewMode === 'grid'
                  ? 'bg-slate-700 text-amber-400 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Responsive Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          <OfflineSyncIndicator />

          <button
            type="button"
            data-testid="refresh-kitchen"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 text-xs font-bold transition-colors disabled:opacity-50 min-h-[36px]"
            title="Refresh KOT Queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
};

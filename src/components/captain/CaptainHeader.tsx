import React from 'react';
import { Layers, User, RefreshCw, CheckCircle2, Clock, CookingPot, Utensils, AlertTriangle } from 'lucide-react';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { OfflineSyncIndicator } from '../OfflineSyncIndicator';

export type TableFilterStatus = 'all' | 'available' | 'occupied';

interface CaptainHeaderProps {
  totalTables: number;
  availableTables: number;
  occupiedTables: number;
  activeOrdersCount: number;
  kotWaitingCount: number;
  kotPreparingCount: number;
  kotReadyCount: number;
  selectedFilter: TableFilterStatus;
  onFilterChange: (filter: TableFilterStatus) => void;
  selectedArea: string;
  onAreaChange: (area: string) => void;
  availableAreas: string[];
  activeTab?: 'tables' | 'orders';
  onTabChange?: (tab: 'tables' | 'orders') => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const CaptainHeader: React.FC<CaptainHeaderProps> = ({
  totalTables,
  availableTables,
  occupiedTables,
  activeOrdersCount,
  kotWaitingCount,
  kotPreparingCount,
  kotReadyCount,
  selectedFilter,
  onFilterChange,
  selectedArea,
  onAreaChange,
  availableAreas,
  activeTab = 'tables',
  onTabChange,
  onRefresh,
  isRefreshing = false
}) => {
  const { restaurant } = useRestaurant();
  const { profile, user } = useAuth();

  return (
    <header className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 text-white px-4 py-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Floor Staff Info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-900/40 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight truncate max-w-[180px] sm:max-w-xs">
                {restaurant?.name || 'RestaurantOS'} — Captain Ops
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 font-semibold border border-slate-700">
                Floor v1
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <User className="w-3 h-3 text-slate-500" />
              <span>{profile?.displayName || user?.email?.split('@')[0] || 'Captain'}</span>
              <span className="text-slate-600">•</span>
              <span className="capitalize text-indigo-400/90 font-medium">{profile?.role || 'captain'}</span>
            </p>
          </div>
        </div>

        {/* View Mode Navigation Tabs & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {onTabChange && (
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                data-testid="tab-floor-tables"
                onClick={() => onTabChange('tables')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'tables'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>Floor Map</span>
              </button>

              <button
                type="button"
                data-testid="tab-orders-kots"
                onClick={() => onTabChange('orders')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'orders'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CookingPot className="w-3.5 h-3.5" />
                <span>Orders & KOTs ({activeOrdersCount})</span>
              </button>
            </div>
          )}

          {/* Table Filters (Shown when Floor Map tab is active) */}
          {activeTab === 'tables' && (
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
              <button
                type="button"
                data-testid="captain-filter-all"
                onClick={() => onFilterChange('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <span>All Tables ({totalTables})</span>
              </button>

              <button
                type="button"
                data-testid="captain-filter-available"
                onClick={() => onFilterChange('available')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedFilter === 'available'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Available ({availableTables})</span>
              </button>

              <button
                type="button"
                data-testid="captain-filter-occupied"
                onClick={() => onFilterChange('occupied')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedFilter === 'occupied'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Occupied ({occupiedTables})</span>
              </button>

              {/* Area Selector dropdown if areas exist */}
              {availableAreas.length > 0 && (
                <select
                  data-testid="captain-area-select"
                  value={selectedArea}
                  onChange={(e) => onAreaChange(e.target.value)}
                  className="bg-slate-900 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">All Floor Areas</option>
                  {availableAreas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Live Kitchen Order Badges */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-medium bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
          <span className="text-slate-400 text-[11px] font-bold">KOT Status:</span>
          {kotWaitingCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
              <Clock className="w-3 h-3 text-indigo-400" />
              <span>{kotWaitingCount} Waiting</span>
            </span>
          )}
          {kotPreparingCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              <CookingPot className="w-3 h-3 text-amber-400" />
              <span>{kotPreparingCount} Prep</span>
            </span>
          )}
          {kotReadyCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 animate-pulse">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>{kotReadyCount} Ready</span>
            </span>
          )}
          {kotWaitingCount === 0 && kotPreparingCount === 0 && kotReadyCount === 0 && (
            <span className="text-slate-500 text-[11px]">All clear</span>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          <OfflineSyncIndicator />

          <button
            type="button"
            data-testid="captain-refresh"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 text-xs font-bold transition-colors disabled:opacity-50 min-h-[36px]"
            title="Refresh Captain Floor View"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
};

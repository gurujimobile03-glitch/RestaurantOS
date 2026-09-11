import React from 'react';
import {
  Store,
  User,
  Utensils,
  ShoppingBag,
  Truck,
  Layers,
  PauseCircle,
  Receipt,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { OfflineSyncIndicator } from '../OfflineSyncIndicator';
import { OrderType } from '../../types/order';
import { Table, TableSession } from '../../types/table';

interface PosHeaderProps {
  orderType: OrderType;
  onOrderTypeChange: (type: OrderType) => void;
  selectedTable: Table | null;
  activeSession: TableSession | null;
  onOpenTableModal: () => void;
  heldOrdersCount: number;
  onOpenHeldOrders: () => void;
  onOpenRecentOrders: () => void;
}

export const PosHeader: React.FC<PosHeaderProps> = ({
  orderType,
  onOrderTypeChange,
  selectedTable,
  activeSession,
  onOpenTableModal,
  heldOrdersCount,
  onOpenHeldOrders,
  onOpenRecentOrders
}) => {
  const { restaurant } = useRestaurant();
  const { profile, user } = useAuth();

  return (
    <header className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800 text-white px-4 py-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Outlet & User Badge */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-sm shrink-0">
            {restaurant?.logoUrl ? (
              <img
                src={restaurant.logoUrl}
                alt={restaurant.name}
                className="w-full h-full object-cover rounded-xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Store className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-tight truncate max-w-[160px] sm:max-w-xs">
                {restaurant?.name || 'RestaurantOS POS'}
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 font-semibold border border-slate-700">
                POS v1
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <User className="w-3 h-3 text-slate-500" />
              <span>{profile?.displayName || user?.email?.split('@')[0] || 'Staff User'}</span>
              <span className="text-slate-600">•</span>
              <span className="capitalize text-slate-400 font-medium">{profile?.role || 'owner'}</span>
            </p>
          </div>
        </div>

        {/* Center: Order Type Selector + Table Selector */}
        <div className="flex items-center gap-2 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
          <button
            type="button"
            onClick={() => onOrderTypeChange('dineIn')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              orderType === 'dineIn'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Dine In</span>
          </button>

          <button
            type="button"
            onClick={() => onOrderTypeChange('takeaway')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              orderType === 'takeaway'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Takeaway</span>
          </button>

          <button
            type="button"
            onClick={() => onOrderTypeChange('delivery')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              orderType === 'delivery'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Delivery</span>
          </button>

          {/* Dine-In Table selector badge */}
          {orderType === 'dineIn' && (
            <button
              type="button"
              onClick={onOpenTableModal}
              className={`flex items-center gap-1.5 ml-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                selectedTable
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 animate-pulse'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                {selectedTable
                  ? `Table ${selectedTable.tableNumber}${selectedTable.name ? ` (${selectedTable.name})` : ''}`
                  : 'Select Table *'}
              </span>
            </button>
          )}
        </div>

        {/* Right: Offline Indicator & Quick Action Modals */}
        <div className="flex items-center gap-2">
          {/* Offline Sync Status Component */}
          <OfflineSyncIndicator />

          {/* Held Orders Button */}
          <button
            type="button"
            onClick={onOpenHeldOrders}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 text-xs font-bold transition-colors"
            title="View Held Carts / Drafts"
          >
            <PauseCircle className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Held</span>
            {heldOrdersCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 text-[10px] bg-amber-500 text-slate-950 font-black rounded-full">
                {heldOrdersCount}
              </span>
            )}
          </button>

          {/* Recent Orders / Receipts */}
          <button
            type="button"
            onClick={onOpenRecentOrders}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 text-xs font-bold transition-colors"
            title="Recent Orders & Bills"
          >
            <Receipt className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Orders</span>
          </button>
        </div>
      </div>
    </header>
  );
};

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Store,
  FolderTree,
  UtensilsCrossed,
  Layers,
  MonitorCheck,
  CookingPot,
  Boxes,
  BarChart3,
  Settings,
  Sparkles,
  ShieldCheck,
  Receipt,
  Users,
  X,
  ChevronDown,
  Check
} from 'lucide-react';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { isViewAllowed } from '../../utils/permissions';

export type AdminView = 'pos' | 'kitchen' | 'captain' | 'dashboard' | 'restaurant' | 'categories' | 'items' | 'settings' | 'reports' | 'audit' | 'orders' | 'staff' | 'inventory';

interface SidebarProps {
  currentView: AdminView;
  onNavigate: (view: AdminView) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isOpenMobile,
  onCloseMobile
}) => {
  const { restaurant, availableRestaurants, switchRestaurant, isSwitching } = useRestaurant();
  const { user, profile } = useAuth();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  const mainNavigation: { id: AdminView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'pos', label: 'POS Terminal', icon: MonitorCheck },
    { id: 'captain', label: 'Captain / Staff', icon: Layers },
    { id: 'kitchen', label: 'Kitchen / KOT', icon: CookingPot },
    { id: 'orders', label: 'Order History & Bills', icon: Receipt },
    { id: 'inventory', label: 'Inventory & Stock', icon: Boxes },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'audit', label: 'Audit Logs', icon: ShieldCheck },
    { id: 'staff', label: 'Staff & Roles', icon: Users },
    { id: 'restaurant', label: 'Restaurant Setup', icon: Store },
    { id: 'categories', label: 'Categories', icon: FolderTree },
    { id: 'items', label: 'Menu Items', icon: UtensilsCrossed }
  ];

  const userRole = profile?.role || 'owner';
  const allowedNavigation = mainNavigation.filter((item) => isViewAllowed(userRole, item.id));

  const futureModules: { label: string; icon: React.ComponentType<{ className?: string }>; milestone: string }[] = [];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-18 px-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-900/50">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-black tracking-tight font-display text-white">
                Restaurant<span className="text-indigo-400">OS</span>
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Web Admin • M1
              </p>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Restaurant Badge with Interactive Switcher */}
        <div className="px-4 pt-4 pb-2">
          <div className="rounded-xl bg-slate-800/80 border border-slate-700/60 p-3 transition-all duration-150">
            <div 
              onClick={() => {
                if (availableRestaurants.length > 1) {
                  setIsSwitcherOpen(!isSwitcherOpen);
                }
              }}
              className={`flex items-center justify-between ${
                availableRestaurants.length > 1 ? 'cursor-pointer group' : 'cursor-default'
              }`}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-indigo-400 transition-colors">
                  {availableRestaurants.length > 1 ? 'Switch Outlet' : 'Active Outlet'}
                </p>
                <p className="text-sm font-bold text-white truncate mt-0.5 max-w-[160px]" title={restaurant?.name || 'RestaurantOS'}>
                  {restaurant?.name || 'Loading restaurant...'}
                </p>
              </div>
              {availableRestaurants.length > 1 && (
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                  isSwitcherOpen ? 'rotate-180 text-white' : 'group-hover:text-white'
                }`} />
              )}
            </div>

            {/* Expanded list of other outlets inside the sidebar */}
            {isSwitcherOpen && availableRestaurants.length > 1 && (
              <div className="mt-3 pt-2.5 border-t border-slate-700/50 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {availableRestaurants.map((res) => {
                  const isActive = res.restaurantId === restaurant?.restaurantId;
                  const isOwner = res.ownerId === user?.uid;
                  return (
                    <button
                      key={res.restaurantId}
                      disabled={isSwitching}
                      onClick={async () => {
                        if (isActive) return;
                        try {
                          await switchRestaurant(res.restaurantId);
                        } catch (err: any) {
                          alert(`Error switching restaurant: ${err.message || err}`);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                          : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold">{res.name}</p>
                        <p className="text-[9px] text-slate-400 font-medium truncate mt-0.5">
                          {isOwner ? 'Owner' : 'Staff'} • {res.city || 'Outlet'}
                        </p>
                      </div>
                      {isActive && (
                        <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2 pt-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Live Admin
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {restaurant?.currencySymbol || '₹'} • GST: {restaurant?.defaultTaxRate || 5}%
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-6">
          {/* Active Navigation */}
          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Core Management
            </div>
            <nav className="space-y-1">
              {allowedNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavigate(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30'
                        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Planned / Future Modules */}
          <div>
            <div className="px-3 pb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Next Milestones</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                Roadmap
              </span>
            </div>
            <div className="space-y-1">
              {futureModules.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-slate-500 text-sm cursor-not-allowed group hover:bg-slate-800/30"
                    title={`Scheduled for future ${item.milestone} release`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-slate-600 group-hover:text-slate-500" />
                      <span className="text-slate-400 text-xs font-medium">{item.label}</span>
                    </div>
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">
                      {item.milestone}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 text-center">
          <div className="px-3 py-2 rounded-xl bg-slate-800/50 text-[11px] text-slate-400 flex items-center justify-between">
            <span className="font-mono">v0.1.0</span>
            <span className="inline-flex items-center gap-1 text-indigo-400 font-semibold">
              <Sparkles className="w-3 h-3" />
              Production Ready
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};

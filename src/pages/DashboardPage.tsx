import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  ShoppingBag,
  Clock,
  Utensils,
  FolderTree,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Plus
} from 'lucide-react';
import { useRestaurant } from '../context/RestaurantContext';
import { subscribeToCategories, subscribeToMenuItems } from '../services/menuService';
import { Category, MenuItem } from '../types/menu';
import { Button } from '../components/common/Button';
import { AdminView } from '../components/layout/Sidebar';
import { FoodTypeBadge } from '../components/common/FoodTypeBadge';

interface DashboardPageProps {
  onNavigate: (view: AdminView) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { restaurant, formatPrice } = useRestaurant();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!restaurant) return;

    let isMounted = true;
    console.log('[RestaurantOS Debug] DashboardPage subscribing for restaurantId:', restaurant.restaurantId);
    const unsubCategories = subscribeToCategories(restaurant.restaurantId, (cats) => {
      if (!isMounted) return;
      console.log('[RestaurantOS Debug] DashboardPage categories count:', cats.length);
      setCategories(cats);
    });

    const unsubItems = subscribeToMenuItems(restaurant.restaurantId, (menuItems) => {
      if (!isMounted) return;
      console.log('[RestaurantOS Debug] DashboardPage menu items count:', menuItems.length);
      setItems(menuItems);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsubCategories();
      unsubItems();
    };
  }, [restaurant?.restaurantId]);

  const activeItems = items.filter((item) => item.isAvailable);
  const activeCategories = categories.filter((cat) => cat.isActive);

  // In Milestone 1, orders module is not active yet. Respect spec: No fabricated metrics!
  const todaySales = 0;
  const todayOrders = 0;
  const pendingOrders = 0;

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-400/30">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Milestone 1 • Web Admin Foundation Active</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {restaurant?.name || 'Welcome to RestaurantOS'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Your digital menu, categories, GST configurations, and outlet settings are synchronized live with Cloud Firestore.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="md"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 shadow-none"
              onClick={() => onNavigate('categories')}
              leftIcon={<FolderTree className="w-4 h-4" />}
            >
              Categories ({categories.length})
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => onNavigate('items')}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Food Item
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Today's Sales Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Today's Sales
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {formatPrice(todaySales)}
            </span>
          </div>
          <div className="mt-2 flex items-center text-xs text-slate-400">
            <span>Awaiting POS terminal orders</span>
          </div>
        </div>

        {/* Today's Orders Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Today's Orders
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {todayOrders}
            </span>
          </div>
          <div className="mt-2 flex items-center text-xs text-slate-400">
            <span>0 completed today</span>
          </div>
        </div>

        {/* Pending Orders Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Pending Orders
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {pendingOrders}
            </span>
          </div>
          <div className="mt-2 flex items-center text-xs text-slate-400">
            <span>Kitchen queue clear</span>
          </div>
        </div>

        {/* Active Menu Items Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Items
            </span>
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Utensils className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900">
              {activeItems.length}
            </span>
            <span className="text-xs text-slate-500">
              / {items.length} total
            </span>
          </div>
          <div className="mt-2 flex items-center text-xs text-slate-400">
            <span>In {activeCategories.length} categories</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Menu Highlights & Operational Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Menu Snapshot */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Configured Menu Items</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Food dishes available for order creation and POS billing
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('items')}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              View Full Menu
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200">
              <Utensils className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No menu items created yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Get started by creating categories and adding your signature dishes, starters, and beverages.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => onNavigate('items')}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Add First Menu Item
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.slice(0, 5).map((item) => {
                const category = categories.find((c) => c.categoryId === item.categoryId);
                return (
                  <div key={item.itemId} className="py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Utensils className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FoodTypeBadge type={item.foodType} showLabel={false} />
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {item.name}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {category?.name || 'Unassigned Category'} {item.sku && `• SKU: ${item.sku}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900">{formatPrice(item.price)}</p>
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                        item.isAvailable
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {item.isAvailable ? 'Available' : 'Out of Stock'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Outlet & Tax Snapshot */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Outlet Profile</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('restaurant')}
              >
                Edit
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Legal Entity</span>
                <span className="font-semibold text-slate-800 text-right truncate max-w-[160px]">
                  {restaurant?.legalName || 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">GST / Tax ID</span>
                <span className="font-mono font-semibold text-slate-800">
                  {restaurant?.gstNumber || 'Unregistered'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Tax Mode</span>
                <span className="font-semibold capitalize text-slate-800">
                  {restaurant?.taxMode || 'exclusive'} ({restaurant?.defaultTaxRate ?? 5}% GST)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Currency</span>
                <span className="font-semibold text-slate-800">
                  {restaurant?.currency || 'INR'} ({restaurant?.currencySymbol || '₹'})
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Contact</span>
                <span className="font-semibold text-slate-800 text-right">
                  {restaurant?.phone || 'No phone'}
                </span>
              </div>
            </div>
          </div>

          {/* POS & KOT Readiness Notice */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles className="w-4 h-4" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Future POS Architecture</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every category, item, and tax rule defined here in Milestone 1 directly maps to the real-time offline-capable billing database for Milestone 2.
            </p>
            <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800">
              <span>Status: Ready for Tablet Sync</span>
              <span className="text-emerald-400 font-semibold">Online</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { MenuItem } from '../../types/menu';
import { formatMoney, toMoneyMinor } from '../../utils/money';
import { useRestaurant } from '../../context/RestaurantContext';
import { Utensils, Plus, AlertCircle, RefreshCw, Ban, Dot } from 'lucide-react';

interface MenuGridProps {
  items: MenuItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAddToCart: (item: MenuItem) => void;
}

export const MenuGrid: React.FC<MenuGridProps> = ({
  items,
  loading,
  error,
  onRetry,
  onAddToCart
}) => {
  const { restaurant } = useRestaurant();
  const symbol = restaurant?.currencySymbol || '₹';

  if (loading) {
    return (
      <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-slate-200/80 rounded-2xl h-44 flex flex-col justify-between p-4" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">Failed to load menu items</h3>
        <p className="text-xs text-slate-500 max-w-xs mt-1 mb-4">{error}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 shadow-xs transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
          <Utensils className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900">No items found</h3>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          Try clearing your search query or selecting a different category.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
      {items.map((item) => {
        const minorPrice = toMoneyMinor(item.price);
        const formattedPrice = formatMoney(minorPrice, symbol);
        const isVeg = item.foodType === 'veg';
        const isNonVeg = item.foodType === 'non-veg';
        const isEgg = item.foodType === 'egg';

        return (
          <div
            key={item.itemId}
            onClick={() => {
              if (item.isAvailable) {
                onAddToCart(item);
              }
            }}
            className={`group relative bg-white border rounded-2xl p-3 flex flex-col justify-between transition-all duration-150 shadow-2xs select-none ${
              item.isAvailable
                ? 'border-slate-200/90 hover:border-indigo-400 hover:shadow-md cursor-pointer'
                : 'border-slate-200/60 bg-slate-50/70 opacity-60 cursor-not-allowed'
            }`}
          >
            {/* Top Badge Row */}
            <div className="flex items-center justify-between gap-2 mb-2">
              {/* Veg / Non-Veg Indicator Dot */}
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  isVeg
                    ? 'border-emerald-600 bg-emerald-50'
                    : isEgg
                    ? 'border-amber-600 bg-amber-50'
                    : 'border-rose-600 bg-rose-50'
                }`}
                title={item.foodType}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isVeg ? 'bg-emerald-600' : isEgg ? 'bg-amber-600' : 'bg-rose-600'
                  }`}
                />
              </div>

              {/* Tax or Availability Tag */}
              {item.isAvailable ? (
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                  {item.taxInclusive ? 'Tax Incl.' : `+${item.taxRate}% Tax`}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md">
                  <Ban className="w-2.5 h-2.5" />
                  Unavailable
                </span>
              )}
            </div>

            {/* Image (if available) or Compact Banner */}
            {item.imageUrl && (
              <div className="w-full h-24 mb-2 rounded-xl overflow-hidden bg-slate-100 border border-slate-100">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            {/* Title & Short Name */}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
                {item.name}
              </h4>
              {item.shortName && item.shortName !== item.name && (
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                  [{item.shortName}]
                </p>
              )}
            </div>

            {/* Price & Add Button Row */}
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                  {formattedPrice}
                </span>
              </div>

              <button
                type="button"
                disabled={!item.isAvailable}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.isAvailable) onAddToCart(item);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  item.isAvailable
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs group-hover:scale-105'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

import React from 'react';
import { Category } from '../../types/menu';
import { Search, Sparkles, Filter, X } from 'lucide-react';

interface CategoryBarProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalItemsCount: number;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  categories,
  selectedCategoryId,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  totalItemsCount
}) => {
  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2.5 shadow-2xs space-y-2.5">
      {/* Top Search and Item Count Row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search items by name, code, or description..."
            className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 placeholder-slate-400 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold shrink-0">
          <Filter className="w-3.5 h-3.5 text-indigo-600" />
          <span>{totalItemsCount} items</span>
        </div>
      </div>

      {/* Category Pills horizontal scroll */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        <button
          type="button"
          onClick={() => onSelectCategory(null)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150 shrink-0 ${
            selectedCategoryId === null
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>All Items</span>
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategoryId === cat.categoryId;
          return (
            <button
              key={cat.categoryId}
              type="button"
              onClick={() => onSelectCategory(cat.categoryId)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150 shrink-0 ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <span>{cat.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

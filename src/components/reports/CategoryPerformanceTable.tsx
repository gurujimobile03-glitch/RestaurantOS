import React from 'react';
import { useRestaurant } from '../../context/RestaurantContext';
import { CategorySalesSummary } from '../../services/analyticsService';
import { Layers, FolderHeart } from 'lucide-react';

interface CategoryPerformanceTableProps {
  categories: CategorySalesSummary[];
}

export const CategoryPerformanceTable: React.FC<CategoryPerformanceTableProps> = ({ categories }) => {
  const { formatPrice } = useRestaurant();

  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
          <Layers className="w-5 h-5" />
        </div>
        <p className="text-sm font-semibold text-slate-700">No Category Sales Recorded</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          Categories will appear once items with valid groupings record sales.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Category Sales breakdown</h3>
          <p className="text-xs text-slate-500 mt-0.5">Authoritative performance metrics sorted by category sales</p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100">
          <FolderHeart className="w-3.5 h-3.5" />
          <span>Section Share</span>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Category</th>
              <th className="py-3 px-4 font-semibold text-right">Items Sold</th>
              <th className="py-3 px-4 font-semibold text-right">Subtotal</th>
              <th className="py-3 px-4 font-semibold text-right">Discounts</th>
              <th className="py-3 px-4 font-semibold text-right">Grand Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((cat) => (
              <tr key={cat.categoryId} className="hover:bg-slate-50/30 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-800 truncate max-w-[200px]" title={cat.name}>
                  {cat.name}
                </td>
                <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                  {cat.quantity}
                </td>
                <td className="py-3.5 px-4 text-right text-slate-600">
                  {formatPrice(cat.totalSubtotalMinor / 100)}
                </td>
                <td className="py-3.5 px-4 text-right text-rose-600 font-medium">
                  {cat.totalDiscountMinor > 0 ? `-${formatPrice(cat.totalDiscountMinor / 100)}` : '—'}
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                  {formatPrice(cat.totalGrandTotalMinor / 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

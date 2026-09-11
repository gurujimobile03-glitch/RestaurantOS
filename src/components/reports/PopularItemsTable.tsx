import React from 'react';
import { useRestaurant } from '../../context/RestaurantContext';
import { ItemSalesSummary } from '../../services/analyticsService';
import { Sparkles, ShoppingBag } from 'lucide-react';

interface PopularItemsTableProps {
  items: ItemSalesSummary[];
}

export const PopularItemsTable: React.FC<PopularItemsTableProps> = ({ items }) => {
  const { formatPrice } = useRestaurant();

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-3">
          <ShoppingBag className="w-5 h-5" />
        </div>
        <p className="text-sm font-semibold text-slate-700">No Item Sales Recorded</p>
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
          Items will appear once completed orders are recorded in the selected date range.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Food Item Performance</h3>
          <p className="text-xs text-slate-500 mt-0.5">Authoritative performance metrics sorted by volume</p>
        </div>
        <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
          <Sparkles className="w-3 h-3" />
          <span>Best Sellers</span>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Item Name</th>
              <th className="py-3 px-4 font-semibold text-right">Quantity Sold</th>
              <th className="py-3 px-4 font-semibold text-right">Subtotal</th>
              <th className="py-3 px-4 font-semibold text-right">Discounts</th>
              <th className="py-3 px-4 font-semibold text-right">Grand Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.itemId} className="hover:bg-slate-50/30 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-800 truncate max-w-[200px]" title={item.name}>
                  {item.name}
                </td>
                <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                  {item.quantity}
                </td>
                <td className="py-3.5 px-4 text-right text-slate-600">
                  {formatPrice(item.totalSubtotalMinor / 100)}
                </td>
                <td className="py-3.5 px-4 text-right text-rose-600 font-medium">
                  {item.totalDiscountMinor > 0 ? `-${formatPrice(item.totalDiscountMinor / 100)}` : '—'}
                </td>
                <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                  {formatPrice(item.totalGrandTotalMinor / 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

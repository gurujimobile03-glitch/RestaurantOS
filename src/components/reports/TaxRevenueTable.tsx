import React from 'react';
import { useRestaurant } from '../../context/RestaurantContext';
import { AnalyticsSummary } from '../../services/analyticsService';
import { Landmark } from 'lucide-react';

interface TaxRevenueTableProps {
  summary: AnalyticsSummary;
}

export const TaxRevenueTable: React.FC<TaxRevenueTableProps> = ({ summary }) => {
  const { formatPrice } = useRestaurant();

  const taxRows = [
    {
      type: 'CGST',
      label: 'Central Goods & Services Tax',
      rate: '2.5% / Variable',
      valueMinor: summary.cgstMinor,
    },
    {
      type: 'SGST',
      label: 'State Goods & Services Tax',
      rate: '2.5% / Variable',
      valueMinor: summary.sgstMinor,
    },
    {
      type: 'IGST',
      label: 'Integrated Goods & Services Tax',
      rate: '5% / Variable',
      valueMinor: summary.igstMinor,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">GST Tax & Revenue breakdown</h3>
          <p className="text-xs text-slate-500 mt-0.5">Authoritative tax-component liability reporting</p>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">
          <Landmark className="w-3.5 h-3.5" />
          <span>Filing Reference</span>
        </div>
      </div>

      <div className="p-5 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 gap-4 text-xs">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Taxable Turnover</p>
          <p className="text-lg font-black text-slate-900 mt-1">{formatPrice(summary.taxableAmountMinor / 100)}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Total GST Accrued</p>
          <p className="text-lg font-black text-slate-900 mt-1">{formatPrice(summary.totalTaxMinor / 100)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 font-semibold">Tax Component</th>
              <th className="py-3 px-4 font-semibold">Scope Description</th>
              <th className="py-3 px-4 font-semibold text-right">Tax Rates</th>
              <th className="py-3 px-4 font-semibold text-right">Accrued Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {taxRows.map((row) => (
              <tr key={row.type} className="hover:bg-slate-50/30 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-800">{row.type}</td>
                <td className="py-3.5 px-4 text-slate-500">{row.label}</td>
                <td className="py-3.5 px-4 text-right text-slate-500 font-mono">{row.rate}</td>
                <td className="py-3.5 px-4 text-right font-bold text-slate-800">
                  {formatPrice(row.valueMinor / 100)}
                </td>
              </tr>
            ))}
            {/* Total Accrued Row */}
            <tr className="bg-slate-50/40 font-bold border-t border-slate-100">
              <td className="py-4 px-4 text-slate-900" colSpan={2}>Total Accrued GST Liability</td>
              <td className="py-4 px-4 text-right text-slate-400 font-mono">—</td>
              <td className="py-4 px-4 text-right text-indigo-600 text-sm font-black">
                {formatPrice(summary.totalTaxMinor / 100)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

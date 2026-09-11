import React, { useState } from 'react';
import { ReportsDashboard } from '../components/reports/ReportsDashboard';
import { InventoryAnalyticsDashboard } from '../components/inventory/InventoryAnalyticsDashboard';
import { useAuth } from '../context/AuthContext';
import { Coins, Boxes } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { profile } = useAuth();
  const staffRole = profile?.role || 'owner';
  const canAccessInventoryReports =
    staffRole === 'owner' || staffRole === 'manager' || staffRole === 'accountant';

  const [activeReportTab, setActiveReportTab] = useState<'sales' | 'inventory'>('sales');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Report Tab Switcher */}
      {canAccessInventoryReports && (
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            id="tab-report-sales"
            type="button"
            onClick={() => setActiveReportTab('sales')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeReportTab === 'sales'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Sales & Revenue Analytics</span>
          </button>

          <button
            id="tab-report-inventory"
            type="button"
            onClick={() => setActiveReportTab('inventory')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeReportTab === 'inventory'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Inventory & Stock Intelligence</span>
          </button>
        </div>
      )}

      {activeReportTab === 'sales' ? (
        <ReportsDashboard />
      ) : (
        <InventoryAnalyticsDashboard />
      )}
    </div>
  );
};

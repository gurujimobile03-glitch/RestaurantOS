import React, { useState } from 'react';
import { Table } from '../../types/table';
import { Users, X, AlertCircle, CheckCircle2, Play } from 'lucide-react';

interface OpenSessionModalProps {
  isOpen: boolean;
  table: Table | null;
  onClose: () => void;
  onOpenSession: (tableId: string, guestCount: number) => Promise<void>;
  isSubmitting: boolean;
}

export const OpenSessionModal: React.FC<OpenSessionModalProps> = ({
  isOpen,
  table,
  onClose,
  onOpenSession,
  isSubmitting
}) => {
  if (!isOpen || !table) return null;

  const [guestCount, setGuestCount] = useState<number>(Math.min(2, table.capacity || 1));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (guestCount <= 0) {
      setError('Guest count must be at least 1.');
      return;
    }

    if (guestCount > table.capacity) {
      setError(`Guest count cannot exceed table capacity (${table.capacity}).`);
      return;
    }

    try {
      await onOpenSession(table.id, guestCount);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to open table session.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Open Session — Table {table.tableNumber}
              </h2>
              <p className="text-xs text-slate-400">
                {table.floorOrArea || 'Main Floor'} • Max Capacity: {table.capacity}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Guest Count (Seating)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={table.capacity}
                value={guestCount}
                onChange={(e) => setGuestCount(parseInt(e.target.value) || 1)}
                data-testid="input-guest-count"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1">
                {[1, 2, 4, 6].map((num) => (
                  num <= table.capacity && (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setGuestCount(num)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                        guestCount === num
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {num}
                    </button>
                  )
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Must be between 1 and table capacity ({table.capacity}).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-colors min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="btn-confirm-open-session"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs inline-flex items-center gap-2 shadow-md shadow-indigo-900/40 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              <Play className="w-4 h-4" />
              <span>{isSubmitting ? 'Opening Session...' : 'Open Session'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

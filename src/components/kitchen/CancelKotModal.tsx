import React, { useState } from 'react';
import { X, AlertTriangle, XCircle } from 'lucide-react';

interface CancelKotModalProps {
  isOpen: boolean;
  kotNumber: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isSubmitting?: boolean;
}

export const CancelKotModal: React.FC<CancelKotModalProps> = ({
  isOpen,
  kotNumber,
  onClose,
  onConfirm,
  isSubmitting = false
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for cancelling this KOT.');
      return;
    }
    setError(null);
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 text-rose-400 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Cancel Kitchen KOT</h3>
            <p className="text-xs font-mono text-slate-400">{kotNumber}</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 mb-4">
          Are you sure you want to cancel this KOT? This action will mark the kitchen ticket as cancelled and log the audit reason.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Cancellation Reason *
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Item out of stock, Customer cancelled order, Wrong entry"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-rose-500"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              Keep KOT
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md shadow-rose-950/40 disabled:opacity-50"
            >
              {isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

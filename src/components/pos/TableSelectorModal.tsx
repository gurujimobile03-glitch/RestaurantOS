import React, { useState, useEffect } from 'react';
import { Table, TableSession } from '../../types/table';
import { tableService } from '../../services/tableService';
import { tableSessionService } from '../../services/tableSessionService';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { Layers, Users, X, Check, RefreshCw, AlertCircle, PlusCircle } from 'lucide-react';

interface TableSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTable: Table | null;
  activeSession: TableSession | null;
  onSelectTableAndSession: (table: Table, session: TableSession) => void;
}

export const TableSelectorModal: React.FC<TableSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedTable,
  activeSession,
  onSelectTableAndSession
}) => {
  const { restaurant } = useRestaurant();
  const { user } = useAuth();
  const restaurantId = restaurant?.restaurantId || '';

  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chosenTable, setChosenTable] = useState<Table | null>(selectedTable);
  const [guestCount, setGuestCount] = useState<number>(2);
  const [submitting, setSubmitting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !restaurantId) return;

    setLoading(true);
    setError(null);

    const unsubscribe = tableService.subscribeToTables(
      restaurantId,
      (updatedTables) => {
        setTables(updatedTables);
        setLoading(false);
      },
      (err) => {
        console.error('Table subscription error:', err);
        setError(err.message || 'Failed to fetch tables');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, restaurantId]);

  if (!isOpen) return null;

  const handleSelectTableCard = async (table: Table) => {
    setChosenTable(table);
    setSessionError(null);
  };

  const handleConfirmTableSelection = async () => {
    if (!chosenTable || !restaurantId) return;

    setSubmitting(true);
    setSessionError(null);

    try {
      // 1. Check if there's already an active session for this table
      let session = await tableSessionService.getActiveSession(restaurantId, chosenTable.id);

      // 2. If no active session exists, open a new one
      if (!session) {
        session = await tableSessionService.openSession(
          restaurantId,
          chosenTable.id,
          guestCount,
          user?.uid || 'staff',
          `req_session_${chosenTable.id}_${Date.now()}`
        );
      }

      onSelectTableAndSession(chosenTable, session);
      onClose();
    } catch (err: any) {
      console.error('Failed to open or select table session:', err);
      setSessionError(err.message || 'Could not select or open session for this table.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Select Floor Table</h3>
              <p className="text-xs text-slate-400">Choose a physical table to assign dine-in order</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Grid */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-slate-500 text-xs font-bold">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Loading floor plan tables...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : tables.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No tables configured in restaurant setup yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {tables.map((tbl) => {
                const isSelected = chosenTable?.id === tbl.id;
                const isOccupied = !!tbl.activeSessionId;

                return (
                  <button
                    key={tbl.id}
                    type="button"
                    onClick={() => handleSelectTableCard(tbl)}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20 shadow-sm'
                        : isOccupied
                        ? 'border-amber-300 bg-amber-50/50 hover:border-amber-400'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-900">
                        Table {tbl.tableNumber}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase ${
                          isOccupied
                            ? 'bg-amber-200/80 text-amber-900'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isOccupied ? 'Occupied' : 'Vacant'}
                      </span>
                    </div>

                    <p className="text-[11px] font-medium text-slate-500 truncate mt-1">
                      {tbl.name || `Capacity: ${tbl.capacity}`}
                    </p>

                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 font-semibold text-slate-600">
                        <Users className="w-3 h-3 text-slate-400" />
                        Cap: {tbl.capacity}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Session Guest Count Options */}
          {chosenTable && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Selected Table {chosenTable.tableNumber}
                    {chosenTable.activeSessionId ? ' (Occupied Session)' : ' (New Session)'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {chosenTable.activeSessionId
                      ? 'Will attach order to existing open session.'
                      : `Set guest count (Max Capacity: ${chosenTable.capacity})`}
                  </p>
                </div>

                {!chosenTable.activeSessionId && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600">Guests:</label>
                    <input
                      type="number"
                      min="1"
                      max={chosenTable.capacity}
                      value={guestCount}
                      onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value)))}
                      className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-xl text-xs font-bold text-center"
                    />
                  </div>
                )}
              </div>

              {sessionError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
                  {sessionError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!chosenTable || submitting}
            onClick={handleConfirmTableSelection}
            className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>Confirm Table</span>
          </button>
        </div>
      </div>
    </div>
  );
};

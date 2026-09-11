import React, { useState } from 'react';
import { Sliders, AlertCircle, RefreshCw, X, ArrowRight } from 'lucide-react';
import { InventoryItem, StockMovementType, RecordStockMovementDTO } from '../../types/inventory';
import { inventoryService } from '../../services/inventoryService';
import { formatQuantityWithUnit, roundQuantity } from '../../utils/units';

interface RecordMovementModalProps {
  restaurantId: string;
  item: InventoryItem;
  initialType?: StockMovementType;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecordMovementModal: React.FC<RecordMovementModalProps> = ({
  restaurantId,
  item,
  initialType = 'stock_in',
  onClose,
  onSuccess
}) => {
  const [movementType, setMovementType] = useState<StockMovementType>(initialType);
  const [quantity, setQuantity] = useState<string>('');
  const [adjustmentMode, setAdjustmentMode] = useState<'set_to' | 'add' | 'subtract'>('set_to');
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const numQty = parseFloat(quantity) || 0;
  const prevStock = item.currentQuantity;

  // Calculate projected delta and resulting preview
  let deltaPreview = 0;
  let resultingPreview = prevStock;

  if (movementType === 'stock_in') {
    deltaPreview = roundQuantity(numQty);
    resultingPreview = roundQuantity(prevStock + deltaPreview);
  } else if (movementType === 'stock_out' || movementType === 'wastage' || movementType === 'damage') {
    deltaPreview = -roundQuantity(numQty);
    resultingPreview = roundQuantity(prevStock + deltaPreview);
  } else if (movementType === 'opening') {
    deltaPreview = roundQuantity(numQty);
    resultingPreview = roundQuantity(prevStock + deltaPreview);
  } else if (movementType === 'adjustment') {
    if (adjustmentMode === 'set_to') {
      resultingPreview = roundQuantity(numQty);
      deltaPreview = roundQuantity(resultingPreview - prevStock);
    } else if (adjustmentMode === 'add') {
      deltaPreview = roundQuantity(numQty);
      resultingPreview = roundQuantity(prevStock + deltaPreview);
    } else if (adjustmentMode === 'subtract') {
      deltaPreview = -roundQuantity(numQty);
      resultingPreview = roundQuantity(prevStock + deltaPreview);
    }
  } else if (movementType === 'correction') {
    if (adjustmentMode === 'subtract') {
      deltaPreview = -roundQuantity(numQty);
      resultingPreview = roundQuantity(prevStock + deltaPreview);
    } else {
      deltaPreview = roundQuantity(numQty);
      resultingPreview = roundQuantity(prevStock + deltaPreview);
    }
  }

  const isResultingNegative = resultingPreview < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (isNaN(numQty) || numQty < 0) {
      setModalError('Please enter a valid non-negative quantity.');
      return;
    }
    if (movementType !== 'adjustment' && numQty <= 0) {
      setModalError('Movement quantity must be greater than 0.');
      return;
    }

    if (isResultingNegative) {
      setModalError(
        `Insufficient stock! Operation would cause negative stock (${resultingPreview} ${item.unit}).`
      );
      return;
    }

    if ((movementType === 'wastage' || movementType === 'damage' || movementType === 'correction') && !reason.trim()) {
      setModalError(`A specific reason is required when recording ${movementType}.`);
      return;
    }

    setSubmitting(true);
    try {
      const dto: RecordStockMovementDTO = {
        inventoryItemId: item.id,
        type: movementType,
        quantity: numQty,
        unit: item.unit,
        reason: reason.trim() || undefined,
        note: note.trim() || undefined,
        adjustmentMode: movementType === 'adjustment' || movementType === 'correction' ? adjustmentMode : undefined,
        referenceType: movementType === 'adjustment' ? 'physical_count' : 'manual'
      };

      await inventoryService.recordStockMovement(restaurantId, dto);
      onSuccess();
    } catch (err: any) {
      console.error('Failed to record stock movement:', err);
      setModalError(err.message || 'Failed to record movement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      id="modal-record-stock-movement"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-slate-800" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Record Stock Movement</h2>
              <p className="text-xs text-slate-500 font-medium">{item.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-md p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Stock Banner */}
        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">Current On-Hand Stock:</span>
          <span className="text-base font-bold text-slate-900 font-mono">
            {formatQuantityWithUnit(item.currentQuantity, item.unit)}
          </span>
        </div>

        {modalError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{modalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
              Movement Type *
            </label>
            <select
              id="select-movement-type"
              value={movementType}
              onChange={e => setMovementType(e.target.value as StockMovementType)}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            >
              <option value="stock_in">Stock In (Restock / Receiving)</option>
              <option value="stock_out">Stock Out (Transfer / Manual Consumption)</option>
              <option value="adjustment">Physical Count / Stocktake Adjustment</option>
              <option value="wastage">Wastage (Spoilage / Kitchen Prep Loss)</option>
              <option value="damage">Damage (Breakage / Expired Goods)</option>
              <option value="correction">Manual Correction</option>
            </select>
          </div>

          {(movementType === 'adjustment' || movementType === 'correction') && (
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
                Adjustment Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {movementType === 'adjustment' && (
                  <button
                    type="button"
                    onClick={() => setAdjustmentMode('set_to')}
                    className={`py-1.5 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                      adjustmentMode === 'set_to'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Counted Total
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAdjustmentMode('add')}
                  className={`py-1.5 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                    adjustmentMode === 'add'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Add (+)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentMode('subtract')}
                  className={`py-1.5 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${
                    adjustmentMode === 'subtract'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Subtract (-)
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
              {movementType === 'adjustment' && adjustmentMode === 'set_to'
                ? `Actual Physical Count Result (${item.unit}) *`
                : `Quantity (${item.unit}) *`}
            </label>
            <input
              id="input-movement-quantity"
              type="number"
              step="any"
              min="0"
              required
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder={`Enter amount in ${item.unit}`}
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-semibold font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Real-time Calculation & Delta Preview */}
          {quantity.trim() !== '' && !isNaN(numQty) && (
            <div
              className={`p-3 rounded-xl border flex flex-col gap-1.5 text-xs ${
                isResultingNegative
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Calculated Ledger Delta:</span>
                <span
                  className={`font-mono font-bold ${
                    deltaPreview > 0
                      ? 'text-emerald-700'
                      : deltaPreview < 0
                        ? 'text-rose-700'
                        : 'text-slate-700'
                  }`}
                >
                  {deltaPreview > 0 ? `+${deltaPreview}` : deltaPreview} {item.unit}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5">
                <span className="font-semibold text-slate-600">Resulting On-Hand Stock:</span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {resultingPreview} {item.unit}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
              Reason / Justification *
            </label>
            <input
              id="input-movement-reason"
              type="text"
              required={movementType === 'wastage' || movementType === 'damage' || movementType === 'correction'}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Weekly physical cycle count discrepancy, Prep spoilage"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-700 mb-1">
              Operational Note (Optional)
            </label>
            <input
              id="input-movement-note"
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Additional shift or batch details..."
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              id="btn-cancel-movement"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              id="btn-submit-movement"
              type="submit"
              disabled={submitting || isResultingNegative}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Apply Stock Movement</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

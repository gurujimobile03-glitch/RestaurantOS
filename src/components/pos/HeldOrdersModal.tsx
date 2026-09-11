import React from 'react';
import { CartItem } from '../../types/cart';
import { OrderType } from '../../types/order';
import { DiscountSpec } from '../../types/discount';
import { formatMoney } from '../../utils/money';
import { useRestaurant } from '../../context/RestaurantContext';
import { PauseCircle, Play, Trash2, X, Clock, ShoppingBag } from 'lucide-react';

export interface HeldOrderDraft {
  id: string;
  heldAt: Date;
  cartItems: CartItem[];
  orderType: OrderType;
  orderDiscount?: DiscountSpec;
  orderNotes?: string;
  tableId?: string | null;
  tableSessionId?: string | null;
}

interface HeldOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldDrafts: HeldOrderDraft[];
  onResumeDraft: (draft: HeldOrderDraft) => void;
  onDeleteDraft: (id: string) => void;
}

export const HeldOrdersModal: React.FC<HeldOrdersModalProps> = ({
  isOpen,
  onClose,
  heldDrafts,
  onResumeDraft,
  onDeleteDraft
}) => {
  const { restaurant } = useRestaurant();
  const symbol = restaurant?.currencySymbol || '₹';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PauseCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Held Carts & Order Drafts</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono font-bold">
              {heldDrafts.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {heldDrafts.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-400">
              <ShoppingBag className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-xs font-bold text-slate-600">No held order drafts</p>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                You can put any active cart on hold using the Hold button on the cart panel.
              </p>
            </div>
          ) : (
            heldDrafts.map((draft) => {
              const totalItems = draft.cartItems.reduce((sum, item) => sum + item.quantity, 0);
              const estSubtotalMinor = draft.cartItems.reduce(
                (sum, item) => sum + item.unitPriceMinor * item.quantity,
                0
              );

              return (
                <div
                  key={draft.id}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-2 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Draft #{draft.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 capitalize">
                          {draft.orderType}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{new Date(draft.heldAt).toLocaleTimeString()}</span>
                        <span>•</span>
                        <span>{totalItems} items</span>
                      </p>
                    </div>

                    <span className="text-xs font-black text-indigo-700">
                      {formatMoney(estSubtotalMinor, symbol)}
                    </span>
                  </div>

                  {draft.orderNotes && (
                    <p className="text-[11px] text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 italic">
                      "{draft.orderNotes}"
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Delete this held draft?')) {
                          onDeleteDraft(draft.id);
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Discard</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onResumeDraft(draft);
                        onClose();
                      }}
                      className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-2xs flex items-center gap-1 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume Cart</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

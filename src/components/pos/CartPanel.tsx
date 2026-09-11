import React, { useState } from 'react';
import { CartItem } from '../../types/cart';
import { OrderType } from '../../types/order';
import { Table, TableSession } from '../../types/table';
import { DiscountSpec } from '../../types/discount';
import { formatMoney } from '../../utils/money';
import { useRestaurant } from '../../context/RestaurantContext';
import { calculateOrderTotals } from '../../services/orderCalculationService';
import {
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  Edit3,
  Percent,
  CookingPot,
  CreditCard,
  PauseCircle,
  Utensils,
  AlertCircle,
  MessageSquare
} from 'lucide-react';

interface CartPanelProps {
  cartItems: CartItem[];
  orderType: OrderType;
  selectedTable: Table | null;
  activeSession: TableSession | null;
  orderDiscount: DiscountSpec | undefined;
  onApplyDiscount: (discount: DiscountSpec | undefined) => void;
  orderNotes: string;
  onOrderNotesChange: (notes: string) => void;
  onUpdateQuantity: (cartItemId: string, newQty: number) => void;
  onUpdateItemNotes: (cartItemId: string, notes: string) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
  onHoldOrder: () => void;
  onCreateKot: () => void;
  onOpenPayment: () => void;
  isSubmitting: boolean;
}

export const CartPanel: React.FC<CartPanelProps> = ({
  cartItems,
  orderType,
  selectedTable,
  activeSession,
  orderDiscount,
  onApplyDiscount,
  orderNotes,
  onOrderNotesChange,
  onUpdateQuantity,
  onUpdateItemNotes,
  onRemoveItem,
  onClearCart,
  onHoldOrder,
  onCreateKot,
  onOpenPayment,
  isSubmitting
}) => {
  const { restaurant } = useRestaurant();
  const symbol = restaurant?.currencySymbol || '₹';

  const [editingNotesItemId, setEditingNotesItemId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<string>('');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState<number>(0);

  // Authoritatively calculate totals using Phase 2B Calculation Engine
  const calculationResult = React.useMemo(() => {
    if (cartItems.length === 0) return null;
    const lineInputs = cartItems.map((item) => ({
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      taxRate: item.taxRate,
      taxInclusive: item.taxInclusive,
      discount: item.discount
    }));
    return calculateOrderTotals({
      items: lineInputs,
      orderDiscount,
      taxJurisdiction: 'intraState'
    });
  }, [cartItems, orderDiscount]);

  const handleSaveItemNote = (cartItemId: string) => {
    onUpdateItemNotes(cartItemId, noteInput);
    setEditingNotesItemId(null);
    setNoteInput('');
  };

  const handleApplyDiscountSubmit = () => {
    if (discountValue <= 0) {
      onApplyDiscount(undefined);
    } else {
      if (discountType === 'percent') {
        onApplyDiscount({ type: 'percentage', percentageRate: Math.min(100, Math.max(0, discountValue)) });
      } else {
        // fixed discount in minor units
        onApplyDiscount({ type: 'fixed', fixedAmountMinor: Math.max(0, Math.round(discountValue * 100)) });
      }
    }
    setShowDiscountModal(false);
  };

  return (
    <div className="bg-white border-l border-slate-200 h-full flex flex-col justify-between shadow-xs">
      {/* Top Cart Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Current Order Cart</h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
              {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 capitalize">
            Type: <span className="font-bold text-slate-700">{orderType}</span>
            {orderType === 'dineIn' && (
              <>
                {' • '}
                <span className="font-bold text-indigo-600">
                  {selectedTable ? `Table ${selectedTable.tableNumber}` : 'No Table Selected'}
                </span>
              </>
            )}
          </p>
        </div>

        {cartItems.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Clear all items from current cart?')) {
                onClearCart();
              }
            }}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Clear Cart"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Middle Cart Item List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cartItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 mb-3">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-slate-600">Cart is empty</p>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-[200px]">
              Tap any food item on the left menu to add it to this order.
            </p>
          </div>
        ) : (
          cartItems.map((item, idx) => {
            const lineRes = calculationResult?.lineResults[idx];
            const isEditingNote = editingNotesItemId === item.cartItemId;

            return (
              <div
                key={item.cartItemId}
                className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3 space-y-2 text-xs transition-all hover:border-slate-300"
              >
                {/* Item Line Top Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h5 className="font-bold text-slate-900 leading-tight truncate">
                      {item.nameSnapshot}
                    </h5>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                      {formatMoney(item.unitPriceMinor, symbol)} each
                      {item.taxInclusive ? ' (Tax Incl.)' : ` (+${item.taxRate}%)`}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-black text-sm text-slate-900">
                      {lineRes ? formatMoney(lineRes.lineTotalMinor, symbol) : formatMoney(item.unitPriceMinor * item.quantity, symbol)}
                    </span>
                  </div>
                </div>

                {/* Item Note Display or Editor */}
                {isEditingNote ? (
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Special instructions (e.g. extra spicy)..."
                      className="flex-1 px-2.5 py-1 text-[11px] bg-white border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveItemNote(item.cartItemId)}
                      className="px-2 py-1 bg-indigo-600 text-white font-bold text-[10px] rounded-lg"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNotesItemId(item.cartItemId);
                        setNoteInput(item.notes || '');
                      }}
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-indigo-600 italic"
                    >
                      <MessageSquare className="w-3 h-3 text-slate-400" />
                      <span>{item.notes ? `"${item.notes}"` : '+ Add note'}</span>
                    </button>
                  </div>
                )}

                {/* Quantity Controls & Remove */}
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1)}
                      className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 font-bold"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center font-bold text-slate-900 text-xs">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
                      className="w-6 h-6 rounded-lg bg-indigo-50 hover:bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.cartItemId)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Totals & Action Buttons Area */}
      {cartItems.length > 0 && calculationResult && (
        <div className="p-4 border-t border-slate-200 bg-slate-50/90 space-y-3">
          {/* Order Notes Field */}
          <div>
            <input
              type="text"
              value={orderNotes}
              onChange={(e) => onOrderNotesChange(e.target.value)}
              placeholder="Overall order instructions / customer note..."
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-slate-800"
            />
          </div>

          {/* Discount Trigger Button */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-semibold">Order Discount</span>
            <button
              type="button"
              onClick={() => setShowDiscountModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold border border-indigo-200/80 transition-colors"
            >
              <Percent className="w-3 h-3" />
              <span>
                {orderDiscount
                  ? orderDiscount.type === 'percentage'
                    ? `${orderDiscount.percentageRate}% Off`
                    : `${formatMoney(orderDiscount.fixedAmountMinor || 0, symbol)} Off`
                  : 'Add Discount'}
              </span>
            </button>
          </div>

          {/* Breakdown Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-900">
                {formatMoney(calculationResult.subtotalMinor, symbol)}
              </span>
            </div>

            {calculationResult.discountMinor > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Discount</span>
                <span>-{formatMoney(calculationResult.discountMinor, symbol)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>Taxable Amount</span>
              <span>{formatMoney(calculationResult.taxableAmountMinor, symbol)}</span>
            </div>

            {calculationResult.cgstMinor > 0 && (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>CGST</span>
                <span>{formatMoney(calculationResult.cgstMinor, symbol)}</span>
              </div>
            )}

            {calculationResult.sgstMinor > 0 && (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>SGST</span>
                <span>{formatMoney(calculationResult.sgstMinor, symbol)}</span>
              </div>
            )}

            {calculationResult.igstMinor > 0 && (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>IGST</span>
                <span>{formatMoney(calculationResult.igstMinor, symbol)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
              <span className="font-black text-slate-900">Grand Total</span>
              <span className="font-black text-indigo-700 text-base">
                {formatMoney(calculationResult.grandTotalMinor, symbol)}
              </span>
            </div>
          </div>

          {/* Action Buttons: Hold, Kitchen / KOT, Pay & Settle */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onHoldOrder}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors border border-slate-700"
            >
              <PauseCircle className="w-4 h-4 text-amber-400 mb-1" />
              <span>Hold</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={onCreateKot}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors border border-slate-700"
            >
              <CookingPot className="w-4 h-4 text-indigo-400 mb-1" />
              <span>KOT</span>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={onOpenPayment}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-md shadow-indigo-600/30"
            >
              <CreditCard className="w-4 h-4 mb-1" />
              <span>Pay & Settle</span>
            </button>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Apply Order Discount</h3>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiscountType('percent')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border ${
                  discountType === 'percent'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Percentage (%)
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('fixed')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border ${
                  discountType === 'fixed'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                Fixed Amount ({symbol})
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">
                {discountType === 'percent' ? 'Discount Percentage' : `Amount in ${symbol}`}
              </label>
              <input
                type="number"
                min="0"
                step={discountType === 'percent' ? '1' : '10'}
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyDiscountSubmit}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-xs"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

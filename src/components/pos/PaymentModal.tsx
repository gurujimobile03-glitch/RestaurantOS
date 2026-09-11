import React, { useState } from 'react';
import { Order } from '../../types/order';
import { PaymentMethod } from '../../types/payment';
import { formatMoney } from '../../utils/money';
import { paymentService } from '../../services/paymentService';
import { orderService } from '../../services/orderService';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { CreditCard, Banknote, QrCode, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onPaymentSuccess: (updatedOrder: Order) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  onPaymentSuccess
}) => {
  const { restaurant } = useRestaurant();
  const { user } = useAuth();
  const symbol = restaurant?.currencySymbol || '₹';

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [tenderedRupees, setTenderedRupees] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const dueMinor = order.dueAmountMinor;
  const dueRupees = dueMinor / 100;

  const payAmountRupees = tenderedRupees !== '' ? Number(tenderedRupees) : dueRupees;
  const payAmountMinor = Math.round(payAmountRupees * 100);

  const changeDueMinor = Math.max(0, payAmountMinor - dueMinor);

  const handleProcessPayment = async () => {
    if (!order || !restaurant?.restaurantId) return;

    setError(null);
    setSubmitting(true);

    try {
      const clientRequestId = `req_pay_${order.id}_${Date.now()}`;
      
      await paymentService.recordPayment(
        restaurant.restaurantId,
        {
          orderId: order.id,
          amountMinor: payAmountMinor,
          method: paymentMethod,
          createdBy: user?.uid || 'cashier'
        },
        clientRequestId
      );

      const updatedOrder = await orderService.getOrderById(restaurant.restaurantId, order.id);
      if (updatedOrder) {
        onPaymentSuccess(updatedOrder);
      } else {
        onPaymentSuccess(order);
      }
      onClose();
    } catch (err: any) {
      console.error('Payment failure:', err);
      setError(err.message || 'Payment recording failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Settle Payment</h3>
            <p className="text-xs text-slate-400">Order #{order.orderNumber}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Amount Summary Cards */}
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Grand Total</span>
              <span className="font-bold text-slate-900">{formatMoney(order.grandTotalMinor, symbol)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Paid So Far</span>
              <span className="font-bold text-emerald-700">{formatMoney(order.paidAmountMinor, symbol)}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black">
              <span className="text-slate-900">Remaining Due</span>
              <span className="text-rose-600 text-base">{formatMoney(dueMinor, symbol)}</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 mb-2 block">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-5 h-5 mb-1" />
                <span>Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                  paymentMethod === 'upi'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <QrCode className="w-5 h-5 mb-1" />
                <span>UPI / QR</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                  paymentMethod === 'card'
                    ? 'border-indigo-600 bg-indigo-50/80 text-indigo-700 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1" />
                <span>Card</span>
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1 block">
              Payment Amount ({symbol})
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={tenderedRupees !== '' ? tenderedRupees : dueRupees}
              onChange={(e) => setTenderedRupees(e.target.value)}
              className="w-full px-3 py-2 text-base font-black bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
            />
          </div>

          {/* Change Due if cash overpay */}
          {paymentMethod === 'cash' && changeDueMinor > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900 font-bold">
              <span>Change to return customer:</span>
              <span className="text-sm font-black">{formatMoney(changeDueMinor, symbol)}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
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
            disabled={submitting}
            onClick={handleProcessPayment}
            className="px-5 py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>Confirm Payment ({formatMoney(payAmountMinor, symbol)})</span>
          </button>
        </div>
      </div>
    </div>
  );
};

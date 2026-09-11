import React, { useEffect } from 'react';
import { Order } from '../../types/order';
import { formatMoney } from '../../utils/money';
import { useRestaurant } from '../../context/RestaurantContext';
import { useAuth } from '../../context/AuthContext';
import { orderService } from '../../services/orderService';
import { printerService } from '../../services/printer/PrinterService';
import { Printer, X, Receipt, CheckCircle2, RotateCw } from 'lucide-react';

interface BillReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  isReprint?: boolean;
}

export const BillReceiptModal: React.FC<BillReceiptModalProps> = ({
  isOpen,
  onClose,
  order,
  isReprint = false
}) => {
  const { restaurant } = useRestaurant();
  const { user } = useAuth();
  const symbol = restaurant?.currencySymbol || '₹';

  useEffect(() => {
    if (isOpen && order && restaurant?.id && user?.uid) {
      if (isReprint || order.status === 'completed') {
        orderService.logBillReprint(restaurant.id, order.id, user.uid);
      } else {
        orderService.logBillViewed(restaurant.id, order.id, user.uid);
      }
    }
  }, [isOpen, order?.id, restaurant?.id, user?.uid, isReprint]);

  if (!isOpen || !order) return null;

  const [printFeedback, setPrintFeedback] = React.useState<{ status: string; message: string } | null>(null);

  const handlePrint = async (reprint: boolean = false) => {
    setPrintFeedback(null);
    const restId = restaurant?.restaurantId || restaurant?.id;
    if (restId && user?.uid) {
      orderService.logBillReprint(restId, order.id, user.uid);
    }
    if (restId) {
      try {
        const result = await printerService.printBill(restId, order, restaurant, { isReprint: reprint });
        if (result.status === 'unknown') {
          setPrintFeedback({
            status: 'unknown',
            message: 'Print status unknown — verify printer before retrying.'
          });
        } else if (!result.success) {
          setPrintFeedback({
            status: 'failed',
            message: result.error || 'Print dispatch failed.'
          });
        } else if (result.status === 'submitted') {
          setPrintFeedback({
            status: 'submitted',
            message: 'Print job submitted to printer interface.'
          });
        }
      } catch (err: any) {
        console.warn('Hardware print dispatch failed, calling window.print() fallback:', err);
        window.print();
      }
    } else {
      window.print();
    }
  };

  const showReprintNotice = isReprint || order.status === 'completed';

  return (
    <div
      data-testid="bill-receipt-modal"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">
              {showReprintNotice ? 'Tax Invoice (Reprint)' : 'Tax Invoice / Receipt'}
            </h3>
          </div>
          <button
            type="button"
            data-testid="btn-close-receipt-modal"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-6 overflow-y-auto font-mono text-xs text-slate-800 space-y-4 printable-receipt">
          {printFeedback && (
            <div
              data-testid="print-status-banner"
              className={`p-3 rounded-xl font-sans text-xs font-semibold flex items-center justify-between ${
                printFeedback.status === 'unknown'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : printFeedback.status === 'failed'
                  ? 'bg-rose-100 text-rose-900 border border-rose-300'
                  : 'bg-blue-100 text-blue-900 border border-blue-300'
              }`}
            >
              <span>{printFeedback.message}</span>
              <button
                type="button"
                onClick={() => setPrintFeedback(null)}
                className="text-slate-500 hover:text-slate-800 p-1"
              >
                ✕
              </button>
            </div>
          )}

          {showReprintNotice && (
            <div
              data-testid="reprint-watermark"
              className="text-center py-1 px-2 bg-slate-100 border border-slate-300 rounded text-[10px] font-extrabold text-slate-600 uppercase tracking-widest"
            >
              *** DUPLICATE / REPRINT INVOICE ***
            </div>
          )}

          {/* Restaurant Header */}
          <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
            <h2 className="text-base font-black text-slate-900 uppercase font-sans">
              {restaurant?.name || 'RestaurantOS'}
            </h2>
            {restaurant?.address && <p className="text-[11px] text-slate-600">{restaurant.address}</p>}
            {restaurant?.city && (
              <p className="text-[11px] text-slate-600">
                {restaurant.city}, {restaurant.state} {restaurant.pincode}
              </p>
            )}
            {restaurant?.gstin && (
              <p className="text-[11px] font-bold text-slate-700">GSTIN: {restaurant.gstin}</p>
            )}
            {restaurant?.phone && <p className="text-[11px] text-slate-600">Ph: {restaurant.phone}</p>}
          </div>

          {/* Meta Information */}
          <div className="space-y-1 text-[11px] pb-3 border-b border-dashed border-slate-300">
            <div className="flex justify-between">
              <span className="font-bold">Order #:</span>
              <span data-testid="receipt-order-number" className="font-bold">{order.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Type:</span>
              <span className="capitalize font-bold">{order.orderType}</span>
            </div>
            {order.tableId && (
              <div className="flex justify-between">
                <span>Table:</span>
                <span className="font-bold">Table {order.tableId}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Date/Time:</span>
              <span>
                {order.createdAt
                  ? new Date(
                      typeof order.createdAt.toDate === 'function'
                        ? order.createdAt.toDate()
                        : order.createdAt
                    ).toLocaleString('en-IN')
                  : new Date().toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="space-y-2 pb-3 border-b border-dashed border-slate-300">
            <div className="flex justify-between font-bold text-slate-900 border-b border-slate-200 pb-1">
              <span className="flex-1">Item</span>
              <span className="w-10 text-center">Qty</span>
              <span className="w-16 text-right">Amount</span>
            </div>

            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-[11px]" data-testid={`receipt-item-${idx}`}>
                <div className="flex-1 pr-2">
                  <p className="font-bold text-slate-900">{item.nameSnapshot}</p>
                  <p className="text-[10px] text-slate-500">
                    @{formatMoney(item.unitPriceMinor, symbol)}
                  </p>
                </div>
                <span className="w-10 text-center font-bold">{item.quantity}</span>
                <span className="w-16 text-right font-bold">
                  {formatMoney(item.lineTotalMinor, symbol)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals Breakdown */}
          <div className="space-y-1 text-[11px] pb-3 border-b border-dashed border-slate-300">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span data-testid="receipt-subtotal">{formatMoney(order.subtotalMinor, symbol)}</span>
            </div>

            {order.discountMinor > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount:</span>
                <span>-{formatMoney(order.discountMinor, symbol)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span>Taxable Amount:</span>
              <span data-testid="receipt-taxable">{formatMoney(order.taxableAmountMinor, symbol)}</span>
            </div>

            {order.cgstMinor > 0 && (
              <div className="flex justify-between">
                <span>CGST:</span>
                <span data-testid="receipt-cgst">{formatMoney(order.cgstMinor, symbol)}</span>
              </div>
            )}

            {order.sgstMinor > 0 && (
              <div className="flex justify-between">
                <span>SGST:</span>
                <span data-testid="receipt-sgst">{formatMoney(order.sgstMinor, symbol)}</span>
              </div>
            )}

            {order.igstMinor > 0 && (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span data-testid="receipt-igst">{formatMoney(order.igstMinor, symbol)}</span>
              </div>
            )}

            <div className="flex justify-between font-black text-sm pt-2 text-slate-900 border-t border-slate-300">
              <span>Grand Total:</span>
              <span data-testid="receipt-grand-total">{formatMoney(order.grandTotalMinor, symbol)}</span>
            </div>
          </div>

          {/* Payment Status */}
          <div className="space-y-1 text-[11px] text-center">
            <div className="flex justify-between">
              <span>Paid Amount:</span>
              <span data-testid="receipt-paid-amount" className="font-bold text-emerald-700">
                {formatMoney(order.paidAmountMinor, symbol)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Due Amount:</span>
              <span data-testid="receipt-due-amount" className="font-bold text-rose-600">
                {formatMoney(order.dueAmountMinor, symbol)}
              </span>
            </div>

            {order.dueAmountMinor === 0 && (
              <div className="pt-2 text-emerald-700 font-bold flex items-center justify-center gap-1 font-sans">
                <CheckCircle2 className="w-4 h-4" />
                <span>FULLY SETTLED & PAID</span>
              </div>
            )}
          </div>

          <p className="text-[10px] text-center text-slate-400 pt-2 border-t border-dashed border-slate-200">
            Thank you for dining with us!
          </p>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 no-print">
          <button
            type="button"
            data-testid="btn-close-receipt"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            Close
          </button>
          {showReprintNotice ? (
            <button
              type="button"
              data-testid="btn-reprint-bill"
              onClick={() => handlePrint(true)}
              className="px-5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <RotateCw className="w-4 h-4" />
              <span>Reprint Bill</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="btn-print-bill"
              onClick={() => handlePrint(false)}
              className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>Print Bill</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Order, OrderType, OrderStatus } from '../../types/order';
import { KOT, KOTStatus } from '../../types/kot';
import { Table, TableSession } from '../../types/table';
import { formatMoney } from '../../utils/money';
import {
  Utensils,
  ShoppingBag,
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
  CookingPot,
  ChevronRight,
  Flame,
  Check
} from 'lucide-react';

interface OrderKotCardProps {
  order: Order;
  kots: KOT[];
  table?: Table | null;
  session?: TableSession | null;
  onClick: () => void;
  onUpdateKotStatus?: (kotId: string, newStatus: KOTStatus) => void;
}

export const OrderKotCard: React.FC<OrderKotCardProps> = ({
  order,
  kots,
  table,
  session,
  onClick,
  onUpdateKotStatus
}) => {
  // Filter KOTs associated with this order
  const orderKots = kots.filter((k) => k.orderId === order.id);

  // Helper for Order Type Badge
  const renderOrderTypeBadge = (type: OrderType) => {
    switch (type) {
      case 'dineIn':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold">
            <Utensils className="w-3 h-3" />
            <span>Dine-In</span>
          </span>
        );
      case 'takeaway':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold">
            <ShoppingBag className="w-3 h-3" />
            <span>Takeaway</span>
          </span>
        );
      case 'delivery':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-bold">
            <Truck className="w-3 h-3" />
            <span>Delivery</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs font-bold capitalize">
            {type}
          </span>
        );
    }
  };

  // Helper for Order Status Badge
  const renderOrderStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'confirmed':
        return <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-bold">Confirmed</span>;
      case 'preparing':
        return <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-bold flex items-center gap-1"><Flame className="w-3 h-3 animate-pulse" /> In Prep</span>;
      case 'ready':
        return <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ready</span>;
      case 'completed':
        return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-bold">Completed</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-bold">Cancelled</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-bold capitalize">{status}</span>;
    }
  };

  // Helper for KOT Status Badge
  const renderKotStatusBadge = (status: KOTStatus) => {
    switch (status) {
      case 'sentToKitchen':
        return <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">Waiting</span>;
      case 'preparing':
        return <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">Preparing</span>;
      case 'ready':
        return <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold animate-pulse">Ready</span>;
      case 'served':
        return <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold">Served</span>;
      case 'cancelled':
        return <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold">Cancelled</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">{status}</span>;
    }
  };

  // Elapsed time calculation
  const createdDate = order.createdAt ? new Date((order.createdAt as any)?.toDate?.() || order.createdAt) : new Date();
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdDate.getTime()) / 60000));

  return (
    <div
      data-testid={`order-card-${order.id}`}
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 hover:border-slate-700 transition-all cursor-pointer shadow-md flex flex-col justify-between group"
      onClick={onClick}
    >
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-black text-white tracking-wide">
              #{order.orderNumber || order.id.substring(0, 6)}
            </span>
            {renderOrderTypeBadge(order.orderType)}
          </div>
          <div className="flex items-center gap-2">
            {renderOrderStatusBadge(order.status)}
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors" />
          </div>
        </div>

        {/* Table / Customer Context */}
        <div className="text-xs text-slate-300 font-semibold mb-2 flex items-center justify-between">
          <div>
            {order.orderType === 'dine_in' ? (
              <span>
                {table ? `Table ${table.tableNumber}` : 'Dine-In Table'}{' '}
                {table?.floorOrArea ? `(${table.floorOrArea})` : ''}
              </span>
            ) : (
              <span>
                {order.customerSnapshot?.name || 'Walk-in Customer'}
                {order.customerSnapshot?.phone ? ` • ${order.customerSnapshot.phone}` : ''}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 font-normal">{elapsedMinutes}m ago</span>
        </div>

        {/* Items Summary & Financial Breakdown */}
        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80 mb-3 text-xs flex items-center justify-between">
          <div className="text-slate-400">
            <span className="font-bold text-slate-200">{order.items?.length || 0}</span> Items
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-400 text-sm">
              {formatMoney(order.grandTotalMinor || 0)}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                order.paymentStatus === 'paid'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}
            >
              {order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
            </span>
          </div>
        </div>

        {/* Associated KOT Tickets Breakdown */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Kitchen KOTs ({orderKots.length})</span>
          </div>

          {orderKots.length === 0 ? (
            <div className="text-[11px] text-slate-500 italic bg-slate-950/30 rounded-lg p-2 border border-slate-900">
              No KOT dispatched yet
            </div>
          ) : (
            orderKots.map((kot) => (
              <div
                key={kot.id}
                className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 text-xs flex flex-col gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-mono font-bold text-slate-300 text-[11px]">
                    <CookingPot className="w-3.5 h-3.5 text-indigo-400" />
                    <span>#{kot.kotNumber || kot.id.substring(0, 6)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderKotStatusBadge(kot.status)}
                    {kot.status === 'ready' && onUpdateKotStatus && (
                      <button
                        type="button"
                        data-testid={`btn-serve-kot-${kot.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateKotStatus(kot.id, 'served');
                        }}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        <span>Serve</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* KOT Line Items list */}
                <div className="text-[11px] text-slate-400 space-y-0.5 pl-1 border-l border-slate-800">
                  {kot.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <span className="truncate max-w-[180px]">
                        {item.quantity}x {item.shortNameSnapshot || item.nameSnapshot}
                      </span>
                      {item.notes && <span className="text-[10px] text-amber-400/80 italic">({item.notes})</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useRestaurant } from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';
import { subscribeToCategories, subscribeToMenuItems } from '../services/menuService';
import { orderService } from '../services/orderService';
import { kotService } from '../services/kotService';
import { Category, MenuItem } from '../types/menu';
import { CartItem } from '../types/cart';
import { Order, OrderType } from '../types/order';
import { Table, TableSession } from '../types/table';
import { DiscountSpec } from '../types/discount';
import { toMoneyMinor } from '../utils/money';

import { PosHeader } from '../components/pos/PosHeader';
import { CategoryBar } from '../components/pos/CategoryBar';
import { MenuGrid } from '../components/pos/MenuGrid';
import { CartPanel } from '../components/pos/CartPanel';
import { TableSelectorModal } from '../components/pos/TableSelectorModal';
import { PaymentModal } from '../components/pos/PaymentModal';
import { BillReceiptModal } from '../components/pos/BillReceiptModal';
import { HeldOrdersModal, HeldOrderDraft } from '../components/pos/HeldOrdersModal';
import { AdminView } from '../components/layout/Sidebar';

import { CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';

interface PosPageProps {
  onNavigate?: (view: AdminView) => void;
}

export const PosPage: React.FC<PosPageProps> = ({ onNavigate }) => {
  const { restaurant, loading: restaurantLoading, error: restaurantError } = useRestaurant();
  const { user } = useAuth();
  const restaurantId = restaurant?.restaurantId || '';

  // Menu Categories & Items state
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState<boolean>(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // POS Filter & Search state
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Order & Cart state
  const [orderType, setOrderType] = useState<OrderType>('dineIn');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeSession, setActiveSession] = useState<TableSession | null>(null);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<DiscountSpec | undefined>(undefined);
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Held Carts state
  const [heldDrafts, setHeldDrafts] = useState<HeldOrderDraft[]>([]);

  // Modals
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isHeldOrdersModalOpen, setIsHeldOrdersModalOpen] = useState(false);

  const [activeOrderForPayment, setActiveOrderForPayment] = useState<Order | null>(null);
  const [activeOrderForBill, setActiveOrderForBill] = useState<Order | null>(null);

  // Processing & Toast feedback
  const [activeMobileTab, setActiveMobileTab] = useState<'menu' | 'cart'>('menu');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // 1. Subscribe to real-time Categories and MenuItems
  useEffect(() => {
    if (!restaurantId) return;

    setMenuLoading(true);
    setMenuError(null);

    let unsubCats = () => {};
    let unsubItems = () => {};

    try {
      unsubCats = subscribeToCategories(
        restaurantId,
        (cats) => {
          setCategories(cats.filter((c) => c.isActive));
        },
        (err) => console.error('Categories error:', err)
      );

      unsubItems = subscribeToMenuItems(
        restaurantId,
        (items) => {
          setMenuItems(items);
          setMenuLoading(false);
        },
        (err: any) => {
          console.error('Menu items error:', err);
          setMenuError(err.message || 'Failed to load menu items');
          setMenuLoading(false);
        }
      );
    } catch (err: any) {
      setMenuError(err.message || 'Error subscribing to menu data');
      setMenuLoading(false);
    }

    return () => {
      unsubCats();
      unsubItems();
    };
  }, [restaurantId]);

  // Filtered Items computation
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      // Category filter
      if (selectedCategoryId && item.categoryId !== selectedCategoryId) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.name.toLowerCase().includes(q);
        const matchShort = item.shortName?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        const matchSku = item.sku?.toLowerCase().includes(q);
        return matchName || matchShort || matchDesc || matchSku;
      }
      return true;
    });
  }, [menuItems, selectedCategoryId, searchQuery]);

  // Add Item to Cart
  const handleAddToCart = (item: MenuItem) => {
    if (!item.isAvailable) {
      setStatusMessage({ type: 'error', text: `${item.name} is currently marked unavailable.` });
      return;
    }

    setCartItems((prev) => {
      const existingIdx = prev.findIndex((ci) => ci.itemId === item.itemId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + 1
        };
        return updated;
      } else {
        const newCartItem: CartItem = {
          cartItemId: `cart_${item.itemId}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          itemId: item.itemId,
          nameSnapshot: item.name,
          shortNameSnapshot: item.shortName || item.name.slice(0, 16),
          unitPriceMinor: toMoneyMinor(item.price),
          taxRate: item.taxRate || restaurant?.defaultTaxRate || 5,
          taxInclusive: !!item.taxInclusive,
          quantity: 1
        };
        return [...prev, newCartItem];
      }
    });
  };

  // Cart quantity changes
  const handleUpdateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(cartItemId);
      return;
    }
    setCartItems((prev) =>
      prev.map((ci) => (ci.cartItemId === cartItemId ? { ...ci, quantity: newQty } : ci))
    );
  };

  // Item notes update
  const handleUpdateItemNotes = (cartItemId: string, notes: string) => {
    setCartItems((prev) =>
      prev.map((ci) => (ci.cartItemId === cartItemId ? { ...ci, notes } : ci))
    );
  };

  // Remove Item
  const handleRemoveItem = (cartItemId: string) => {
    setCartItems((prev) => prev.filter((ci) => ci.cartItemId !== cartItemId));
  };

  // Clear Cart
  const handleClearCart = () => {
    setCartItems([]);
    setOrderDiscount(undefined);
    setOrderNotes('');
  };

  // Hold Order
  const handleHoldOrder = () => {
    if (cartItems.length === 0) return;

    const draft: HeldOrderDraft = {
      id: `draft_${Date.now()}`,
      heldAt: new Date(),
      cartItems: [...cartItems],
      orderType,
      orderDiscount,
      orderNotes,
      tableId: selectedTable?.id,
      tableSessionId: activeSession?.id
    };

    setHeldDrafts((prev) => [draft, ...prev]);
    handleClearCart();
    setStatusMessage({ type: 'info', text: 'Cart moved to Held Orders.' });
  };

  // Resume Draft
  const handleResumeDraft = (draft: HeldOrderDraft) => {
    setCartItems(draft.cartItems);
    setOrderType(draft.orderType);
    setOrderDiscount(draft.orderDiscount);
    setOrderNotes(draft.orderNotes || '');
    setHeldDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    setStatusMessage({ type: 'info', text: 'Held cart resumed successfully.' });
  };

  // Delete Draft
  const handleDeleteDraft = (id: string) => {
    setHeldDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  // Create Order & KOT Flow
  const handleCreateKot = async () => {
    if (cartItems.length === 0) {
      setStatusMessage({ type: 'error', text: 'Cart is empty.' });
      return;
    }

    if (orderType === 'dineIn' && (!selectedTable || !activeSession)) {
      setIsTableModalOpen(true);
      setStatusMessage({ type: 'error', text: 'Please select an active table for Dine-In order.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const clientReqId = `req_ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      // 1. Create order in Firestore
      const newOrder = await orderService.createOrderFromCart({
        restaurantId,
        cartState: { items: cartItems, orderDiscount, notes: orderNotes },
        orderType,
        source: 'pos',
        tableId: selectedTable?.id,
        tableSessionId: activeSession?.id,
        notes: orderNotes,
        createdBy: user?.uid || 'pos_cashier',
        clientRequestId: clientReqId
      });

      // 2. Create corresponding Kitchen Order Ticket (KOT)
      await kotService.createKOTFromOrder({
        restaurantId,
        orderId: newOrder.id,
        notes: newOrder.notes,
        createdBy: user?.uid || 'pos_cashier',
        clientRequestId: `req_kot_${newOrder.id}`
      });

      // 3. Success state
      handleClearCart();
      setActiveOrderForBill(newOrder);
      setIsBillModalOpen(true);
      setStatusMessage({
        type: 'success',
        text: `Order #${newOrder.orderNumber} placed & sent to Kitchen!`
      });
    } catch (err: any) {
      console.error('KOT creation error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to create order or KOT.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Payment Open Flow
  const handleOpenPayment = async () => {
    if (cartItems.length === 0) {
      setStatusMessage({ type: 'error', text: 'Cart is empty.' });
      return;
    }

    if (orderType === 'dineIn' && (!selectedTable || !activeSession)) {
      setIsTableModalOpen(true);
      setStatusMessage({ type: 'error', text: 'Please select an active table for Dine-In order.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const clientReqId = `req_ord_pay_${Date.now()}`;

      // Create Order first
      const newOrder = await orderService.createOrderFromCart({
        restaurantId,
        cartState: { items: cartItems, orderDiscount, notes: orderNotes },
        orderType,
        source: 'pos',
        tableId: selectedTable?.id,
        tableSessionId: activeSession?.id,
        notes: orderNotes,
        createdBy: user?.uid || 'pos_cashier',
        clientRequestId: clientReqId
      });

      setActiveOrderForPayment(newOrder);
      setIsPaymentModalOpen(true);
    } catch (err: any) {
      console.error('Order creation for payment error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to prepare order for payment.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Payment Settlement Success
  const handlePaymentSuccess = (updatedOrder: Order) => {
    handleClearCart();
    setActiveOrderForPayment(null);
    setActiveOrderForBill(updatedOrder);
    setIsBillModalOpen(true);
    setStatusMessage({
      type: 'success',
      text: `Payment settled for Order #${updatedOrder.orderNumber}`
    });
  };

  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-slate-100 flex flex-col font-sans">
      {/* POS Top Header */}
      <PosHeader
        orderType={orderType}
        onOrderTypeChange={(type) => {
          setOrderType(type);
          if (type !== 'dineIn') {
            setSelectedTable(null);
            setActiveSession(null);
          }
        }}
        selectedTable={selectedTable}
        activeSession={activeSession}
        onOpenTableModal={() => setIsTableModalOpen(true)}
        heldOrdersCount={heldDrafts.length}
        onOpenHeldOrders={() => setIsHeldOrdersModalOpen(true)}
        onOpenRecentOrders={() => {
          if (activeOrderForBill) {
            setIsBillModalOpen(true);
          } else if (onNavigate) {
            onNavigate('orders');
          } else {
            setStatusMessage({ type: 'info', text: 'No recent receipt open.' });
          }
        }}
      />

      {/* Status Toast Notification */}
      {statusMessage && (
        <div
          className={`px-4 py-2.5 flex items-center justify-between text-xs font-bold transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-600 text-white'
              : statusMessage.type === 'error'
              ? 'bg-rose-600 text-white'
              : 'bg-indigo-600 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="p-1 hover:bg-black/10 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mobile view toggles */}
      <div className="lg:hidden flex border-b border-slate-200 bg-white shrink-0 p-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveMobileTab('menu')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-2 ${
            activeMobileTab === 'menu'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span>Menu Browse ({filteredItems.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveMobileTab('cart')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-2 ${
            activeMobileTab === 'cart'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span>Cart View ({cartItems.reduce((sum, item) => sum + item.quantity, 0)})</span>
        </button>
      </div>

      {/* Main Terminal Area (Split View: Menu Left 65%, Cart Right 35%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* LEFT AREA: Categories & Menu Items */}
        <div className={`lg:col-span-7 xl:col-span-8 flex flex-col min-h-0 bg-slate-100 ${activeMobileTab === 'menu' ? 'flex' : 'hidden lg:flex'}`}>
          <CategoryBar
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            totalItemsCount={filteredItems.length}
          />

          <div className="flex-1 overflow-y-auto">
            <MenuGrid
              items={filteredItems}
              loading={menuLoading || restaurantLoading}
              error={menuError || restaurantError}
              onRetry={() => {
                setMenuLoading(true);
                setMenuError(null);
              }}
              onAddToCart={handleAddToCart}
            />
          </div>
        </div>

        {/* RIGHT AREA: Cart Panel */}
        <div className={`lg:col-span-5 xl:col-span-4 flex flex-col min-h-0 bg-white border-l border-slate-200 ${activeMobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
          <CartPanel
            cartItems={cartItems}
            orderType={orderType}
            selectedTable={selectedTable}
            activeSession={activeSession}
            orderDiscount={orderDiscount}
            onApplyDiscount={setOrderDiscount}
            orderNotes={orderNotes}
            onOrderNotesChange={setOrderNotes}
            onUpdateQuantity={handleUpdateQuantity}
            onUpdateItemNotes={handleUpdateItemNotes}
            onRemoveItem={handleRemoveItem}
            onClearCart={handleClearCart}
            onHoldOrder={handleHoldOrder}
            onCreateKot={handleCreateKot}
            onOpenPayment={handleOpenPayment}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>

      {/* Modals */}
      <TableSelectorModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        selectedTable={selectedTable}
        activeSession={activeSession}
        onSelectTableAndSession={(table, session) => {
          setSelectedTable(table);
          setActiveSession(session);
        }}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        order={activeOrderForPayment}
        onPaymentSuccess={handlePaymentSuccess}
      />

      <BillReceiptModal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        order={activeOrderForBill}
      />

      <HeldOrdersModal
        isOpen={isHeldOrdersModalOpen}
        onClose={() => setIsHeldOrdersModalOpen(false)}
        heldDrafts={heldDrafts}
        onResumeDraft={handleResumeDraft}
        onDeleteDraft={handleDeleteDraft}
      />
    </div>
  );
};

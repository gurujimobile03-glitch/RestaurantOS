import { MoneyMinor } from './money';
import { TaxRate } from './tax';
import { DiscountSpec } from './discount';
import { OrderItemModifier } from './order';

/**
 * Cart Item Snapshot
 * 
 * Captures historical catalog attributes at the instant an item is added to the cart.
 * All subsequent cart operations and order generation use these snapshot attributes,
 * strictly insulating the transaction from live catalog edits (historical price snapshot policy).
 */
export interface CartItemSnapshot {
  itemId: string;
  nameSnapshot: string;
  shortNameSnapshot: string;
  unitPriceMinor: MoneyMinor;
  taxRate: TaxRate;
  taxInclusive: boolean;
  notes?: string;
  modifiers?: OrderItemModifier[];
}

export interface CartItem extends CartItemSnapshot {
  cartItemId: string; // Unique identifier for the cart line
  quantity: number;
  discount?: DiscountSpec;
}

export interface CartState {
  items: CartItem[];
  orderDiscount?: DiscountSpec;
  notes?: string;
}

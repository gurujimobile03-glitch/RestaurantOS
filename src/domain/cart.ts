import { MenuItem } from '../types/menu';
import { CartItem, CartItemSnapshot, CartState } from '../types/cart';
import { OrderItemModifier } from '../types/order';
import { DiscountSpec } from '../types/discount';
import { TaxJurisdiction } from '../types/tax';
import { OrderCalculationResult } from '../types/orderCalculation';
import { toMoneyMinor } from '../utils/money';
import { assertValidQuantity, calculateOrderTotals } from '../services/orderCalculationService';

/**
 * Creates an immutable snapshot from a catalog MenuItem.
 * 
 * Historical Price Snapshot Policy:
 * Captures unitPriceMinor, taxRate, taxInclusive, nameSnapshot, and shortNameSnapshot.
 * Any subsequent updates to the catalog MenuItem do not alter this snapshot.
 */
export function createMenuItemSnapshot(
  item: MenuItem,
  modifiers?: OrderItemModifier[],
  notes?: string
): CartItemSnapshot {
  if (!item || typeof item !== 'object') {
    throw new TypeError('Invalid MenuItem provided for snapshot creation');
  }

  // Convert menu item price (in major currency units, e.g. Rupees) to authoritative integer minor units (Paise)
  const unitPriceMinor = toMoneyMinor(item.price);

  return {
    itemId: item.itemId,
    nameSnapshot: item.name,
    shortNameSnapshot: item.shortName || item.name,
    unitPriceMinor,
    taxRate: item.taxRate as any,
    taxInclusive: !!item.taxInclusive,
    modifiers: modifiers && modifiers.length > 0 ? [...modifiers] : undefined,
    notes: notes ? notes.trim() : undefined
  };
}

/**
 * Checks if two modifier configurations are identical.
 */
function areModifiersEqual(
  a?: OrderItemModifier[],
  b?: OrderItemModifier[]
): boolean {
  const listA = a || [];
  const listB = b || [];
  if (listA.length !== listB.length) return false;

  const sortedA = [...listA].sort((x, y) => x.id.localeCompare(y.id));
  const sortedB = [...listB].sort((x, y) => x.id.localeCompare(y.id));

  for (let i = 0; i < sortedA.length; i++) {
    if (
      sortedA[i].id !== sortedB[i].id ||
      sortedA[i].priceMinor !== sortedB[i].priceMinor ||
      sortedA[i].name !== sortedB[i].name
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Generates a unique ID for a cart line.
 */
function generateCartItemId(): string {
  return `cart_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Pure domain Cart manager.
 * Supports add, remove, update quantity, merge duplicate lines, and recalculation using Phase 2B.
 */
export class Cart {
  private state: CartState;

  constructor(initialState?: Partial<CartState>) {
    this.state = {
      items: initialState?.items ? [...initialState.items] : [],
      orderDiscount: initialState?.orderDiscount,
      notes: initialState?.notes
    };
  }

  /**
   * Returns a copy of the current cart state.
   */
  getState(): CartState {
    return {
      items: this.state.items.map((it) => ({ ...it })),
      orderDiscount: this.state.orderDiscount ? { ...this.state.orderDiscount } : undefined,
      notes: this.state.notes
    };
  }

  /**
   * Adds an item to the cart.
   * 
   * Same-Item Merge Policy:
   * If an item with the EXACT same itemId, notes, and modifier configuration already exists,
   * its quantity is incremented rather than creating a duplicate line.
   * If modifiers or notes differ, a separate cart line is maintained.
   */
  addItem(
    snapshot: CartItemSnapshot,
    quantity: number = 1,
    discount?: DiscountSpec
  ): CartItem {
    assertValidQuantity(quantity, 'quantity');

    // Find existing matching line
    const existingIndex = this.state.items.findIndex((item) => {
      const isSameItem = item.itemId === snapshot.itemId;
      const isSameNotes = (item.notes || '') === (snapshot.notes || '');
      const isSameModifiers = areModifiersEqual(item.modifiers, snapshot.modifiers);
      return isSameItem && isSameNotes && isSameModifiers;
    });

    if (existingIndex >= 0) {
      const existingItem = this.state.items[existingIndex];
      const newQuantity = existingItem.quantity + quantity;
      assertValidQuantity(newQuantity, 'combined quantity');

      const updatedItem: CartItem = {
        ...existingItem,
        quantity: newQuantity,
        discount: discount || existingItem.discount
      };

      this.state.items[existingIndex] = updatedItem;
      return updatedItem;
    }

    const newItem: CartItem = {
      ...snapshot,
      cartItemId: generateCartItemId(),
      quantity,
      discount
    };

    this.state.items.push(newItem);
    return newItem;
  }

  /**
   * Updates quantity of a specific cart line.
   */
  updateQuantity(cartItemId: string, quantity: number): CartItem {
    assertValidQuantity(quantity, 'quantity');

    const itemIndex = this.state.items.findIndex((it) => it.cartItemId === cartItemId);
    if (itemIndex === -1) {
      throw new Error(`Cart item with ID "${cartItemId}" not found in cart.`);
    }

    const updatedItem: CartItem = {
      ...this.state.items[itemIndex],
      quantity
    };

    this.state.items[itemIndex] = updatedItem;
    return updatedItem;
  }

  /**
   * Removes a specific cart line.
   */
  removeItem(cartItemId: string): void {
    this.state.items = this.state.items.filter((it) => it.cartItemId !== cartItemId);
  }

  /**
   * Clears all items and discounts from the cart.
   */
  clear(): void {
    this.state.items = [];
    this.state.orderDiscount = undefined;
    this.state.notes = undefined;
  }

  /**
   * Sets or updates order-level discount.
   */
  setOrderDiscount(discount?: DiscountSpec): void {
    this.state.orderDiscount = discount;
  }

  /**
   * Sets or updates cart notes.
   */
  setNotes(notes?: string): void {
    this.state.notes = notes ? notes.trim() : undefined;
  }

  /**
   * Calculates totals using the authoritative Phase 2B Calculation Engine.
   * NO calculations are duplicated here.
   */
  calculateTotals(taxJurisdiction: TaxJurisdiction = 'intraState'): OrderCalculationResult {
    const lineInputs = this.state.items.map((item) => ({
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      taxRate: item.taxRate,
      taxInclusive: item.taxInclusive,
      discount: item.discount
    }));

    return calculateOrderTotals({
      items: lineInputs,
      orderDiscount: this.state.orderDiscount,
      taxJurisdiction
    });
  }
}

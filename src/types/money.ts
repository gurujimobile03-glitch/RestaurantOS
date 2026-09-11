/**
 * Authoritative Money representation for RestaurantOS.
 * 
 * Financial values are stored as non-negative integers in minor currency units.
 * For INR: ₹100.50 is represented as 10050 paise.
 * 
 * Floating-point numbers MUST NEVER be used for authoritative financial totals.
 */
export type MoneyMinor = number;

export interface MoneyBreakdown {
  subtotalMinor: MoneyMinor;
  discountMinor: MoneyMinor;
  taxableAmountMinor: MoneyMinor;
  taxMinor: MoneyMinor;
  grandTotalMinor: MoneyMinor;
  paidAmountMinor: MoneyMinor;
  dueAmountMinor: MoneyMinor;
}

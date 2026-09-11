import { MoneyMinor } from './money';

export type DiscountType = 'percentage' | 'fixed';

export interface DiscountSpec {
  type: DiscountType;
  /**
   * For percentage discount, value in percent (e.g. 10 for 10%, 2.5 for 2.5%).
   * Must be between 0 and 100.
   */
  percentageRate?: number;
  /**
   * For fixed discount, amount in minor units (e.g. 5000 paise for ₹50.00).
   * Must be a non-negative integer.
   */
  fixedAmountMinor?: MoneyMinor;
}

export interface DiscountResult {
  discountMinor: MoneyMinor;
  remainingTaxableAmountMinor: MoneyMinor;
}

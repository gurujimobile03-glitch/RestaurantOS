import { MoneyMinor } from './money';
import { TaxJurisdiction, TaxRate } from './tax';
import { DiscountSpec } from './discount';

export interface OrderItemLineInput {
  quantity: number;
  unitPriceMinor: MoneyMinor;
  taxRate: TaxRate;
  taxInclusive: boolean;
  discount?: DiscountSpec;
  taxJurisdiction?: TaxJurisdiction;
}

export interface OrderItemLineResult {
  quantity: number;
  unitPriceMinor: MoneyMinor;
  subtotalMinor: MoneyMinor;
  discountMinor: MoneyMinor;
  taxableAmountMinor: MoneyMinor;
  taxRate: TaxRate;
  taxInclusive: boolean;
  taxJurisdiction: TaxJurisdiction;
  cgstMinor: MoneyMinor;
  sgstMinor: MoneyMinor;
  igstMinor: MoneyMinor;
  totalTaxMinor: MoneyMinor;
  lineTotalMinor: MoneyMinor;
}

export interface OrderCalculationInput {
  items: OrderItemLineInput[];
  orderDiscount?: DiscountSpec;
  taxJurisdiction?: TaxJurisdiction;
}

export interface OrderCalculationResult {
  subtotalMinor: MoneyMinor;
  discountMinor: MoneyMinor;
  taxableAmountMinor: MoneyMinor;
  cgstMinor: MoneyMinor;
  sgstMinor: MoneyMinor;
  igstMinor: MoneyMinor;
  totalTaxMinor: MoneyMinor;
  grandTotalMinor: MoneyMinor;
  taxJurisdiction: TaxJurisdiction;
  lineResults: OrderItemLineResult[];
}

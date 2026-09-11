import { MoneyMinor } from './money';
import { TaxMode } from './restaurant';

export type { TaxMode };

export type TaxJurisdiction = 'intraState' | 'interState';

export type TaxRate = number; // e.g. 5 for 5%

export interface TaxBreakdown {
  taxableAmountMinor: MoneyMinor;
  taxRate: TaxRate;
  cgstRate: TaxRate;
  sgstRate: TaxRate;
  igstRate: TaxRate;
  cgstMinor: MoneyMinor;
  sgstMinor: MoneyMinor;
  igstMinor: MoneyMinor;
  totalTaxMinor: MoneyMinor;
}

export interface TaxCalculationResult {
  taxableAmountMinor: MoneyMinor;
  taxRate: TaxRate;
  taxAmountMinor: MoneyMinor;
  cgstMinor: MoneyMinor;
  sgstMinor: MoneyMinor;
  igstMinor: MoneyMinor;
  totalTaxMinor: MoneyMinor;
  finalTotalMinor: MoneyMinor;
  breakdown?: TaxBreakdown;
}

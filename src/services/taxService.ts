import { MoneyMinor } from '../types/money';
import { TaxCalculationResult, TaxJurisdiction, TaxRate } from '../types/tax';
import { assertValidMoney, roundHalfUp } from '../utils/money';

export interface TaxCalculationParams {
  /**
   * For exclusive tax: this is the net taxable amount.
   * For inclusive tax: this is the gross amount (which includes tax).
   */
  amountMinor: MoneyMinor;
  taxRate: TaxRate;
  taxInclusive: boolean;
  taxJurisdiction?: TaxJurisdiction; // defaults to 'intraState'
}

/**
 * Validates tax rate.
 */
export function assertValidTaxRate(rate: unknown): asserts rate is TaxRate {
  if (typeof rate !== 'number' || Number.isNaN(rate) || !Number.isFinite(rate)) {
    throw new TypeError(`Tax rate must be a finite number, received ${String(rate)}`);
  }
  if (rate < 0) {
    throw new RangeError(`Tax rate cannot be negative, received ${rate}`);
  }
  if (rate > 100) {
    throw new RangeError(`Tax rate cannot exceed 100%, received ${rate}`);
  }
}

/**
 * Centralized pure tax calculation engine.
 * 
 * Supports:
 * - Exclusive GST
 * - Inclusive GST
 * - Intra-State (CGST + SGST)
 * - Inter-State (IGST)
 * - 0%, 5%, 12%, 18%, and arbitrary valid GST rates
 * 
 * Uses the authoritative Half-Up Rounding Policy to prevent lost or extra paise.
 * Invariant: cgstMinor + sgstMinor + igstMinor === totalTaxMinor.
 * Invariant: finalTotalMinor === taxableAmountMinor + totalTaxMinor.
 */
export function calculateTax(params: TaxCalculationParams): TaxCalculationResult {
  const {
    amountMinor,
    taxRate,
    taxInclusive,
    taxJurisdiction = 'intraState'
  } = params;

  assertValidMoney(amountMinor, 'amountMinor');
  assertValidTaxRate(taxRate);

  if (taxJurisdiction !== 'intraState' && taxJurisdiction !== 'interState') {
    throw new TypeError(`Invalid tax jurisdiction: ${String(taxJurisdiction)}`);
  }

  let taxableAmountMinor: MoneyMinor;
  let totalTaxMinor: MoneyMinor;
  let finalTotalMinor: MoneyMinor;

  if (amountMinor === 0 || taxRate === 0) {
    taxableAmountMinor = amountMinor;
    totalTaxMinor = 0;
    finalTotalMinor = amountMinor;
  } else if (taxInclusive) {
    // Tax-Inclusive calculation:
    // Taxable Amount = roundHalfUp((Gross * 100) / (100 + TaxRate))
    // Tax = Gross - Taxable Amount
    taxableAmountMinor = roundHalfUp((amountMinor * 100) / (100 + taxRate));
    assertValidMoney(taxableAmountMinor, 'taxableAmountMinor');
    totalTaxMinor = amountMinor - taxableAmountMinor;
    assertValidMoney(totalTaxMinor, 'totalTaxMinor');
    finalTotalMinor = amountMinor;
  } else {
    // Tax-Exclusive calculation:
    // Taxable Amount = Base Amount
    // Tax = roundHalfUp((Taxable Amount * TaxRate) / 100)
    // Final Total = Taxable Amount + Tax
    taxableAmountMinor = amountMinor;
    totalTaxMinor = roundHalfUp((taxableAmountMinor * taxRate) / 100);
    assertValidMoney(totalTaxMinor, 'totalTaxMinor');
    finalTotalMinor = taxableAmountMinor + totalTaxMinor;
    assertValidMoney(finalTotalMinor, 'finalTotalMinor');
  }

  // CGST, SGST, IGST Reconciliation
  let cgstMinor: MoneyMinor = 0;
  let sgstMinor: MoneyMinor = 0;
  let igstMinor: MoneyMinor = 0;

  if (taxJurisdiction === 'interState') {
    igstMinor = totalTaxMinor;
    cgstMinor = 0;
    sgstMinor = 0;
  } else {
    // Intra-State: 50/50 split between CGST and SGST
    // Apply deterministic rounding to CGST, and assign remainder to SGST
    // to strictly preserve cgstMinor + sgstMinor === totalTaxMinor
    cgstMinor = roundHalfUp(totalTaxMinor / 2);
    sgstMinor = totalTaxMinor - cgstMinor;
    igstMinor = 0;
  }

  assertValidMoney(cgstMinor, 'cgstMinor');
  assertValidMoney(sgstMinor, 'sgstMinor');
  assertValidMoney(igstMinor, 'igstMinor');

  // Verify non-negotiable invariant
  if (cgstMinor + sgstMinor + igstMinor !== totalTaxMinor) {
    throw new Error(
      `Tax split invariant failed: CGST(${cgstMinor}) + SGST(${sgstMinor}) + IGST(${igstMinor}) !== Total(${totalTaxMinor})`
    );
  }

  const halfRate = taxRate / 2;

  return {
    taxableAmountMinor,
    taxRate,
    taxAmountMinor: totalTaxMinor,
    totalTaxMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    finalTotalMinor,
    breakdown: {
      taxableAmountMinor,
      taxRate,
      cgstRate: taxJurisdiction === 'intraState' ? halfRate : 0,
      sgstRate: taxJurisdiction === 'intraState' ? halfRate : 0,
      igstRate: taxJurisdiction === 'interState' ? taxRate : 0,
      cgstMinor,
      sgstMinor,
      igstMinor,
      totalTaxMinor
    }
  };
}

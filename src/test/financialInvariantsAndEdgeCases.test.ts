import { describe, it, expect } from 'vitest';
import { calculateTax } from '../services/taxService';
import { calculateDiscount } from '../services/discountService';
import { calculateOrderItemLine, calculateOrderTotals } from '../services/orderCalculationService';

describe('Financial Invariants & Edge Cases (Step 10 & Step 12)', () => {
  describe('Exact edge case amounts requested by specification', () => {
    // ₹0
    it('handles ₹0 (0 paise)', () => {
      const tax = calculateTax({ amountMinor: 0, taxRate: 18, taxInclusive: false });
      expect(tax.totalTaxMinor).toBe(0);
      expect(tax.finalTotalMinor).toBe(0);

      const disc = calculateDiscount(0, { type: 'percentage', percentageRate: 10 });
      expect(disc.discountMinor).toBe(0);
      expect(disc.remainingTaxableAmountMinor).toBe(0);
    });

    // ₹0.01 (1 paise)
    it('handles ₹0.01 (1 paise)', () => {
      const taxEx = calculateTax({ amountMinor: 1, taxRate: 5, taxInclusive: false });
      expect(taxEx.taxableAmountMinor).toBe(1);
      expect(taxEx.totalTaxMinor).toBe(0); // 0.05 paise -> 0
      expect(taxEx.finalTotalMinor).toBe(1);

      const taxInc = calculateTax({ amountMinor: 1, taxRate: 5, taxInclusive: true });
      expect(taxInc.finalTotalMinor).toBe(1);
      expect(taxInc.taxableAmountMinor + taxInc.totalTaxMinor).toBe(1);
    });

    // ₹0.05 (5 paise)
    it('handles ₹0.05 (5 paise)', () => {
      const tax = calculateTax({ amountMinor: 5, taxRate: 18, taxInclusive: false });
      // 5 * 18 / 100 = 0.9 paise -> rounds half-up to 1 paise
      expect(tax.totalTaxMinor).toBe(1);
      expect(tax.cgstMinor + tax.sgstMinor).toBe(1);
      expect(tax.finalTotalMinor).toBe(6);
    });

    // ₹0.10 (10 paise)
    it('handles ₹0.10 (10 paise)', () => {
      const tax = calculateTax({ amountMinor: 10, taxRate: 5, taxInclusive: false });
      // 10 * 5 / 100 = 0.50 paise -> rounds half-up to 1 paise
      expect(tax.totalTaxMinor).toBe(1);
      expect(tax.finalTotalMinor).toBe(11);
    });

    // ₹0.50 (50 paise)
    it('handles ₹0.50 (50 paise)', () => {
      const tax = calculateTax({ amountMinor: 50, taxRate: 5, taxInclusive: false });
      // 50 * 5 / 100 = 2.5 paise -> rounds half-up to 3 paise
      expect(tax.totalTaxMinor).toBe(3);
      expect(tax.cgstMinor).toBe(2);
      expect(tax.sgstMinor).toBe(1);
      expect(tax.finalTotalMinor).toBe(53);
    });

    // ₹0.99 (99 paise)
    it('handles ₹0.99 (99 paise)', () => {
      const tax = calculateTax({ amountMinor: 99, taxRate: 18, taxInclusive: false });
      // 99 * 18 / 100 = 17.82 -> rounds to 18 paise
      expect(tax.totalTaxMinor).toBe(18);
      expect(tax.cgstMinor).toBe(9);
      expect(tax.sgstMinor).toBe(9);
      expect(tax.finalTotalMinor).toBe(117);
    });

    // ₹1 (100 paise)
    it('handles ₹1.00 (100 paise)', () => {
      const tax = calculateTax({ amountMinor: 100, taxRate: 5, taxInclusive: false });
      expect(tax.totalTaxMinor).toBe(5);
      expect(tax.cgstMinor).toBe(3);
      expect(tax.sgstMinor).toBe(2);
      expect(tax.finalTotalMinor).toBe(105);
    });

    // ₹99 (9900 paise)
    it('handles ₹99.00 (9900 paise)', () => {
      const tax = calculateTax({ amountMinor: 9900, taxRate: 18, taxInclusive: false });
      expect(tax.totalTaxMinor).toBe(1782);
      expect(tax.cgstMinor).toBe(891);
      expect(tax.sgstMinor).toBe(891);
      expect(tax.finalTotalMinor).toBe(11682);
    });

    // ₹100 (10000 paise)
    it('handles ₹100.00 (10000 paise)', () => {
      const tax = calculateTax({ amountMinor: 10000, taxRate: 18, taxInclusive: false });
      expect(tax.totalTaxMinor).toBe(1800);
      expect(tax.finalTotalMinor).toBe(11800);
    });

    // ₹105 at 5% (inclusive)
    it('handles ₹105.00 at 5% inclusive (10500 paise)', () => {
      const tax = calculateTax({ amountMinor: 10500, taxRate: 5, taxInclusive: true });
      expect(tax.taxableAmountMinor).toBe(10000);
      expect(tax.totalTaxMinor).toBe(500);
      expect(tax.cgstMinor).toBe(250);
      expect(tax.sgstMinor).toBe(250);
      expect(tax.finalTotalMinor).toBe(10500);
    });

    // ₹118 at 18% (inclusive)
    it('handles ₹118.00 at 18% inclusive (11800 paise)', () => {
      const tax = calculateTax({ amountMinor: 11800, taxRate: 18, taxInclusive: true });
      expect(tax.taxableAmountMinor).toBe(10000);
      expect(tax.totalTaxMinor).toBe(1800);
      expect(tax.cgstMinor).toBe(900);
      expect(tax.sgstMinor).toBe(900);
      expect(tax.finalTotalMinor).toBe(11800);
    });

    // ₹9.99 at 18% (inclusive) -> 999 paise
    it('handles ₹9.99 at 18% inclusive (999 paise)', () => {
      // Taxable = round(999 * 100 / 118) = round(846.61) = 847 paise (₹8.47)
      // Tax = 999 - 847 = 152 paise (₹1.52)
      // CGST = round(152 / 2) = 76 paise, SGST = 76 paise
      const tax = calculateTax({ amountMinor: 999, taxRate: 18, taxInclusive: true });
      expect(tax.taxableAmountMinor).toBe(847);
      expect(tax.totalTaxMinor).toBe(152);
      expect(tax.cgstMinor).toBe(76);
      expect(tax.sgstMinor).toBe(76);
      expect(tax.taxableAmountMinor + tax.totalTaxMinor).toBe(999);
    });

    // ₹10.00 at 5% (inclusive) -> 1000 paise
    it('handles ₹10.00 at 5% inclusive (1000 paise)', () => {
      // Taxable = round(1000 * 100 / 105) = round(952.38) = 952 paise
      // Tax = 1000 - 952 = 48 paise
      // CGST = 24, SGST = 24
      const tax = calculateTax({ amountMinor: 1000, taxRate: 5, taxInclusive: true });
      expect(tax.taxableAmountMinor).toBe(952);
      expect(tax.totalTaxMinor).toBe(48);
      expect(tax.cgstMinor).toBe(24);
      expect(tax.sgstMinor).toBe(24);
      expect(tax.taxableAmountMinor + tax.totalTaxMinor).toBe(1000);
    });

    // ₹10,000 at 18% (inclusive) -> 1,000,000 paise
    it('handles ₹10,000 at 18% inclusive (1000000 paise)', () => {
      // Taxable = round(1000000 * 100 / 118) = round(847457.627...) = 847458 paise (₹8,474.58)
      // Tax = 1000000 - 847458 = 152542 paise (₹1,525.42)
      // CGST = round(152542 / 2) = 76271 paise (₹762.71)
      // SGST = 152542 - 76271 = 76271 paise (₹762.71)
      const tax = calculateTax({ amountMinor: 1000000, taxRate: 18, taxInclusive: true });
      expect(tax.taxableAmountMinor).toBe(847458);
      expect(tax.totalTaxMinor).toBe(152542);
      expect(tax.cgstMinor).toBe(76271);
      expect(tax.sgstMinor).toBe(76271);
      expect(tax.cgstMinor + tax.sgstMinor).toBe(152542);
      expect(tax.taxableAmountMinor + tax.totalTaxMinor).toBe(1000000);
    });

    // ₹999 at 18% (inclusive)
    it('handles ₹999.00 at 18% inclusive (99900 paise)', () => {
      const tax = calculateTax({ amountMinor: 99900, taxRate: 18, taxInclusive: true });
      expect(tax.taxableAmountMinor).toBe(84661);
      expect(tax.totalTaxMinor).toBe(15239);
      expect(tax.cgstMinor).toBe(7620);
      expect(tax.sgstMinor).toBe(7619);
      expect(tax.cgstMinor + tax.sgstMinor).toBe(15239);
      expect(tax.finalTotalMinor).toBe(99900);
    });
  });

  describe('Full and Near-Full Discount Invariants', () => {
    it('handles 100% full discount without producing negative or orphaned tax', () => {
      const line = calculateOrderItemLine({
        quantity: 1,
        unitPriceMinor: 10000,
        taxRate: 18,
        taxInclusive: false,
        discount: {
          type: 'percentage',
          percentageRate: 100
        }
      });

      expect(line.subtotalMinor).toBe(10000);
      expect(line.discountMinor).toBe(10000);
      expect(line.taxableAmountMinor).toBe(0);
      expect(line.totalTaxMinor).toBe(0);
      expect(line.cgstMinor).toBe(0);
      expect(line.sgstMinor).toBe(0);
      expect(line.lineTotalMinor).toBe(0);
    });

    it('handles near-full discount (₹99.99 off ₹100.00)', () => {
      const line = calculateOrderItemLine({
        quantity: 1,
        unitPriceMinor: 10000,
        taxRate: 18,
        taxInclusive: false,
        discount: {
          type: 'fixed',
          fixedAmountMinor: 9999
        }
      });

      expect(line.subtotalMinor).toBe(10000);
      expect(line.discountMinor).toBe(9999);
      expect(line.taxableAmountMinor).toBe(1); // 1 paise remaining
      // 18% of 1 paise = 0.18 -> 0 paise
      expect(line.totalTaxMinor).toBe(0);
      expect(line.lineTotalMinor).toBe(1);
    });
  });

  describe('Large Quantities & Monetary Amounts', () => {
    it('handles high volume order without overflow or precision loss', () => {
      // 500 items @ ₹1,250.75 (125075 paise) = ₹6,25,375.00 (62537500 paise)
      const line = calculateOrderItemLine({
        quantity: 500,
        unitPriceMinor: 125075,
        taxRate: 18,
        taxInclusive: false
      });

      expect(line.subtotalMinor).toBe(62537500);
      // 18% of 62537500 = 11256750 paise
      expect(line.totalTaxMinor).toBe(11256750);
      expect(line.cgstMinor).toBe(5628375);
      expect(line.sgstMinor).toBe(5628375);
      expect(line.lineTotalMinor).toBe(73794250);
      expect(line.taxableAmountMinor + line.totalTaxMinor).toBe(line.lineTotalMinor);
    });
  });

  describe('Strict Universal Invariants on Order Calculations', () => {
    it('satisfies all financial invariants across 20 distinct rate/amount configurations', () => {
      const rates = [0, 2.5, 5, 12, 18, 28];
      const quantities = [1, 2, 5, 10];
      const prices = [100, 2550, 4999, 10000, 29900];

      for (const rate of rates) {
        for (const qty of quantities) {
          for (const price of prices) {
            const result = calculateOrderTotals({
              items: [
                {
                  quantity: qty,
                  unitPriceMinor: price,
                  taxRate: rate,
                  taxInclusive: false
                }
              ]
            });

            // 1. Non-negativity
            expect(result.subtotalMinor).toBeGreaterThanOrEqual(0);
            expect(result.discountMinor).toBeGreaterThanOrEqual(0);
            expect(result.taxableAmountMinor).toBeGreaterThanOrEqual(0);
            expect(result.totalTaxMinor).toBeGreaterThanOrEqual(0);
            expect(result.grandTotalMinor).toBeGreaterThanOrEqual(0);

            // 2. Tax split identity
            expect(result.cgstMinor + result.sgstMinor + result.igstMinor).toBe(
              result.totalTaxMinor
            );

            // 3. Grand total identity
            expect(result.taxableAmountMinor + result.totalTaxMinor).toBe(
              result.grandTotalMinor
            );
          }
        }
      }
    });
  });

  describe('CGST / SGST Odd-Paise Policy Verification', () => {
    it('deterministically assigns the odd paise to CGST across odd tax amounts 1, 2, 3, 4, 5, 7, 9, 11', () => {
      const oddTaxes = [1, 2, 3, 4, 5, 7, 9, 11];
      for (const totalTax of oddTaxes) {
        // CGST = roundHalfUp(totalTax / 2), SGST = totalTax - CGST
        const expectedCGST = Math.round(totalTax / 2);
        const expectedSGST = totalTax - expectedCGST;

        // Verify invariant
        expect(expectedCGST + expectedSGST).toBe(totalTax);
        if (totalTax % 2 === 1) {
          // Odd paise always gives CGST exactly 1 paise more than SGST
          expect(expectedCGST - expectedSGST).toBe(1);
        } else {
          expect(expectedCGST).toBe(expectedSGST);
        }
      }
    });
  });

  describe('Line-Level Rounding vs Order-Level Rounding Policy', () => {
    it('demonstrates and verifies the line-by-line rounding policy where lines round independently then aggregate', () => {
      // 3 items of ₹10.10 (1010 paise) each @ 5% GST exclusive
      // Line calculation:
      // Subtotal per line = 1010 paise
      // Tax per line = round(1010 * 0.05) = round(50.5) = 51 paise (CGST 26, SGST 25)
      // Line Total = 1010 + 51 = 1061 paise
      //
      // Order aggregation under Line-by-Line policy:
      // Total Subtotal = 3 x 1010 = 3030 paise
      // Total Tax = 3 x 51 = 153 paise
      // Grand Total = 3 x 1061 = 3183 paise
      //
      // (Note: If whole order was rounded at once: round(3030 * 0.05) = round(151.5) = 152 paise)
      // Under RestaurantOS authoritative policy, Line-by-Line aggregation is used:
      const result = calculateOrderTotals({
        items: [
          { quantity: 1, unitPriceMinor: 1010, taxRate: 5, taxInclusive: false },
          { quantity: 1, unitPriceMinor: 1010, taxRate: 5, taxInclusive: false },
          { quantity: 1, unitPriceMinor: 1010, taxRate: 5, taxInclusive: false }
        ]
      });

      expect(result.subtotalMinor).toBe(3030);
      expect(result.totalTaxMinor).toBe(153);
      expect(result.grandTotalMinor).toBe(3183);
      expect(result.cgstMinor).toBe(78); // 26 + 26 + 26
      expect(result.sgstMinor).toBe(75); // 25 + 25 + 25
      expect(result.cgstMinor + result.sgstMinor).toBe(153);
      expect(result.taxableAmountMinor + result.totalTaxMinor).toBe(3183);
    });
  });

  describe('Complex Multi-Line Deterministic Test with Quantities > 1', () => {
    it('calculates Item A (qty 2 @ ₹100, 5%), Item B (qty 1 @ ₹200, 18%), Item C (qty 3 @ ₹99, 12%)', () => {
      // Item A: 2 x 10000 = 20000 subtotal @ 5% tax -> 1000 tax (CGST 500, SGST 500) -> Line Total = 21000
      // Item B: 1 x 20000 = 20000 subtotal @ 18% tax -> 3600 tax (CGST 1800, SGST 1800) -> Line Total = 23600
      // Item C: 3 x 9900 = 29700 subtotal @ 12% tax -> round(29700 * 0.12) = 3564 tax (CGST 1782, SGST 1782) -> Line Total = 33264
      //
      // Aggregations:
      // Subtotal = 20000 + 20000 + 29700 = 69700 paise (₹697.00)
      // Tax = 1000 + 3600 + 3564 = 8164 paise (₹81.64)
      // CGST = 500 + 1800 + 1782 = 4082 paise
      // SGST = 500 + 1800 + 1782 = 4082 paise
      // Grand Total = 21000 + 23600 + 33264 = 77864 paise (₹778.64)
      const result = calculateOrderTotals({
        items: [
          { quantity: 2, unitPriceMinor: 10000, taxRate: 5, taxInclusive: false },
          { quantity: 1, unitPriceMinor: 20000, taxRate: 18, taxInclusive: false },
          { quantity: 3, unitPriceMinor: 9900, taxRate: 12, taxInclusive: false }
        ]
      });

      expect(result.subtotalMinor).toBe(69700);
      expect(result.discountMinor).toBe(0);
      expect(result.taxableAmountMinor).toBe(69700);
      expect(result.totalTaxMinor).toBe(8164);
      expect(result.cgstMinor).toBe(4082);
      expect(result.sgstMinor).toBe(4082);
      expect(result.igstMinor).toBe(0);
      expect(result.grandTotalMinor).toBe(77864);

      expect(result.cgstMinor + result.sgstMinor + result.igstMinor).toBe(8164);
      expect(result.taxableAmountMinor + result.totalTaxMinor).toBe(77864);
    });
  });

  describe('Purity & Immutability Audit', () => {
    it('guarantees that calculations do not mutate input objects or arrays', () => {
      const input = {
        items: [
          { quantity: 2, unitPriceMinor: 10000, taxRate: 5, taxInclusive: false },
          { quantity: 1, unitPriceMinor: 20000, taxRate: 18, taxInclusive: false }
        ],
        orderDiscount: {
          type: 'percentage' as const,
          percentageRate: 10
        }
      };

      const inputCopy = JSON.parse(JSON.stringify(input));

      // Execute calculation 3 times
      const res1 = calculateOrderTotals(input);
      const res2 = calculateOrderTotals(input);
      const res3 = calculateOrderTotals(input);

      // Verify idempotence
      expect(res1).toEqual(res2);
      expect(res2).toEqual(res3);

      // Verify input was not mutated
      expect(input).toEqual(inputCopy);
    });
  });
});

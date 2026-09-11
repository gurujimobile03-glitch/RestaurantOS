# RestaurantOS — Milestone 2 Specification: POS Terminal, Transaction Architecture & Financial Engines

## Milestone 2 Architecture Overview

Milestone 2 establishes the high-throughput transactional and financial processing core of RestaurantOS.

### Phase Breakdown
- **Phase 2A (Completed):** Data Model, Security Foundation, Multi-Tenant Paths & Transaction Types
- **Phase 2B (Completed):** Money + Tax + Discount Calculation Engine
- **Phase 2C (Completed):** Transaction Services (Table Sessions, Orders, KOTs, Payments)
- **Phase 2D (Completed):** POS Terminal & Operational UI


---

## Phase 2B: Authoritative Financial Calculation Specification

### 1. Authoritative Money Representation
- All authoritative monetary balances and arithmetic in RestaurantOS use **integer minor units** (`MoneyMinor = number`).
- For INR, 1 Rupee = 100 Paise.
  - ₹100.50 is represented strictly as `10050` paise.
  - ₹0.01 is `1` paise.
- JavaScript floating-point numbers (`0.1 + 0.2`) are strictly forbidden for authoritative financial calculations, storage, or database fields. Floating numbers may only be used for presentation conversion (`fromMoneyMinor`).
- Monetary values must be finite integers. `NaN`, `Infinity`, fractional values, and negative values (unless explicitly allowed in differential comparisons) throw `TypeError` or `RangeError`.

---

### 2. Authoritative Rounding Policy
- **Policy Name:** Half-Up Rounding to Nearest Minor Unit (Paise) (`roundHalfUp`).
- **Rule:**
  - If the fractional remainder of minor units is $\ge 0.50$, it rounds up to the next whole integer minor unit.
  - If the fractional remainder is $< 0.50$, it rounds down.
  - For non-negative amounts, standard `Math.round(value)` implements this deterministically.
- **Consistency Invariant:**
  The same rounding policy applies universally across:
  1. Percentage discounts
  2. Inclusive GST taxable amount extraction
  3. Exclusive GST calculation
  4. CGST / SGST split
  5. Line-item totals
  6. Order grand totals

---

### 3. Discount Engine Specification (`src/services/discountService.ts`)

#### Supported Discount Types:
1. **Percentage Discount (`percentage`):**
   - Discount amount = $\text{roundHalfUp}\left( \frac{\text{subtotalMinor} \times \text{percentageRate}}{100} \right)$
   - `percentageRate` must be between $0$ and $100$.
2. **Fixed Amount Discount (`fixed`):**
   - Discount amount = `fixedAmountMinor`
   - `fixedAmountMinor` must be an integer minor unit $\ge 0$.

#### Discount Validation & Invariants:
- `discountMinor >= 0`
- `discountMinor <= subtotalMinor`
- `remainingTaxableAmountMinor >= 0`
- `discountMinor + remainingTaxableAmountMinor === subtotalMinor`
- A discount greater than subtotal is rejected with a `RangeError`.

#### Multi-Item Proportional Discount Allocation:
- When an order-level discount is applied to an order with multiple items, the discount is allocated across the items based on line subtotals using integer paise math:
  - $\text{lineDiscount} = \left\lfloor \frac{\text{lineSubtotal} \times \text{totalDiscount}}{\text{orderSubtotal}} \right\rfloor$
  - Any remaining paise are allocated deterministically to the lines with the highest fractional remainder.
  - Invariant: $\sum \text{lineDiscounts} \equiv \text{totalDiscountMinor}$.

---

### 4. Tax Engine Specification (`src/services/taxService.ts`)

#### Supported Tax Modes & Rates:
- **Tax Inclusive (`taxInclusive = true`):** Menu item price includes GST.
- **Tax Exclusive (`taxInclusive = false`):** GST is added on top of the taxable base.
- **Rates:** Standard rates include 0%, 5%, 12%, 18%, 28%, and custom rates.
- **Jurisdictions:**
  - `intraState` (Default): Split equally between CGST and SGST.
  - `interState`: 100% allocated to IGST (`cgst = 0`, `sgst = 0`).

#### Tax-Exclusive Formula:
- $\text{taxableAmountMinor} = \text{amountMinor}$
- $\text{totalTaxMinor} = \text{roundHalfUp}\left( \frac{\text{taxableAmountMinor} \times \text{taxRate}}{100} \right)$
- $\text{finalTotalMinor} = \text{taxableAmountMinor} + \text{totalTaxMinor}$

#### Tax-Inclusive Formula:
- $\text{taxableAmountMinor} = \text{roundHalfUp}\left( \frac{\text{grossAmountMinor} \times 100}{100 + \text{taxRate}} \right)$
- $\text{totalTaxMinor} = \text{grossAmountMinor} - \text{taxableAmountMinor}$
- $\text{finalTotalMinor} = \text{grossAmountMinor} = \text{taxableAmountMinor} + \text{totalTaxMinor}$

#### CGST / SGST Reconciliation Policy:
- Intra-State transactions divide total GST equally:
  - $\text{cgstMinor} = \text{roundHalfUp}\left( \frac{\text{totalTaxMinor}}{2} \right)$
  - $\text{sgstMinor} = \text{totalTaxMinor} - \text{cgstMinor}$
- Invariant: $\text{cgstMinor} + \text{sgstMinor} + \text{igstMinor} \equiv \text{totalTaxMinor}$.
- No lost paise. No extra paise.

---

### 5. Line Calculation Engine (`calculateOrderItemLine`)
- **Quantity:** Must be a positive integer ($1, 2, 3...$). Rejects $0$, negatives, decimals, `NaN`, `Infinity`.
- **Order of Operations:**
  $\text{Unit Price} \times \text{Quantity} \longrightarrow \text{Subtotal} \longrightarrow \text{Discount} \longrightarrow \text{Tax} \longrightarrow \text{Line Total}$
- **Reconciliation Invariant:**
  $\text{taxableAmountMinor} + \text{totalTaxMinor} \equiv \text{lineTotalMinor}$

---

### 6. Order Calculation Engine (`calculateOrderTotals`)
- **Strategy:** $\text{LINE CALCULATION} \longrightarrow \text{ROUND LINE} \longrightarrow \text{AGGREGATE LINES}$.
- Aggregates all line subtotals, line discounts, line taxable amounts, line taxes (CGST, SGST, IGST), and line totals.
- Invariants:
  - $\sum \text{lineSubtotal} \equiv \text{orderSubtotal}$
  - $\sum \text{lineDiscount} \equiv \text{orderDiscount}$
  - $\sum \text{lineTax} \equiv \text{orderTotalTax}$
  - $\sum \text{lineTotal} \equiv \text{orderGrandTotal}$
  - $\text{orderCGST} + \text{orderSGST} + \text{orderIGST} \equiv \text{orderTotalTax}$
  - $\text{orderTaxableAmount} + \text{orderTotalTax} \equiv \text{orderGrandTotal}$

---

### 7. Historical Price Snapshot Policy
- **Rule:** Order calculations and recalculations MUST use the historical price snapshot stored directly on `OrderItem`:
  - `unitPriceMinor`
  - `taxRate`
  - `taxInclusive`
- An existing order recalculation MUST NEVER query or substitute current Menu Item catalog prices.

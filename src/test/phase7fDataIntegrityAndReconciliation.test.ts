(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inventoryAnalyticsService } from '../services/inventoryAnalyticsService';
import { roundQuantity, convertQuantity, areUnitsCompatible, parseNumericQuantity, UNIT_CONFIG } from '../utils/units';
import { calculateRecipeCostPaise, validateRecipeIngredients } from '../utils/recipeUtils';
import { calculatePurchaseLineTotal, calculatePurchaseOrderTotals } from '../utils/supplierUtils';
import { InventoryItem, StockMovement } from '../types/inventory';
import { RecipeIngredient } from '../types/recipe';

describe('M7-7F Data Integrity, Unit Precision & Mathematical Reconciliation Suite (26 Tests)', () => {
  // ============================================================================
  // UNIT PRECISION & ARITHMETIC INVARIANTS (1-8)
  // ============================================================================
  describe('Unit Precision & Floating-Point Drift Elimination', () => {
    it('1: roundQuantity eliminates IEEE 754 floating point addition drift (0.1 + 0.2)', () => {
      const rawSum = 0.1 + 0.2; // 0.30000000000000004
      expect(rawSum).not.toBe(0.3);
      expect(roundQuantity(rawSum)).toBe(0.3);
    });

    it('2: roundQuantity correctly rounds to 3 decimal places', () => {
      expect(roundQuantity(1.2344)).toBe(1.234);
      expect(roundQuantity(1.2346)).toBe(1.235);
      expect(roundQuantity(0.0001)).toBe(0);
      expect(roundQuantity(0.0009)).toBe(0.001);
    });

    it('3: Unit conversion precision: grams to kilograms roundtrip', () => {
      const g = 350;
      const kg = convertQuantity(g, 'g', 'kg');
      expect(kg).toBe(0.35);

      const gRoundtrip = convertQuantity(kg, 'kg', 'g');
      expect(gRoundtrip).toBe(350);
    });

    it('4: Unit conversion precision: millilitres to litres roundtrip', () => {
      const ml = 475;
      const litre = convertQuantity(ml, 'ml', 'litre');
      expect(litre).toBe(0.475);

      const mlRoundtrip = convertQuantity(litre, 'litre', 'ml');
      expect(mlRoundtrip).toBe(475);
    });

    it('5: Unit conversion for count categories (box, packet, piece)', () => {
      expect(areUnitsCompatible('box', 'box')).toBe(true);
      expect(areUnitsCompatible('piece', 'piece')).toBe(true);
      expect(areUnitsCompatible('box', 'piece')).toBe(false); // distinct discrete count units without packaging ratio
    });

    it('6: parseNumericQuantity handles numbers, strings and invalid inputs safely', () => {
      expect(parseNumericQuantity(10.5)).toBe(10.5);
      expect(parseNumericQuantity(' 25.75 ')).toBe(25.75);
      expect(parseNumericQuantity('')).toBe(0);
      expect(parseNumericQuantity('invalid')).toBe(0);
      expect(parseNumericQuantity(-5)).toBe(0);
    });

    it('7: UNIT_CONFIG defines all 7 standardized units across 3 categories', () => {
      const units = Object.keys(UNIT_CONFIG);
      expect(units).toContain('kg');
      expect(units).toContain('g');
      expect(units).toContain('litre');
      expect(units).toContain('ml');
      expect(units).toContain('piece');
      expect(units).toContain('box');
      expect(units).toContain('packet');
      expect(units.length).toBe(7);
    });

    it('8: Strict non-negative quantity invariant', () => {
      expect(roundQuantity(Math.max(0, -10))).toBe(0);
    });
  });

  // ============================================================================
  // INTEGER MONEY & FINANCIAL CALCULATIONS (9-14)
  // ============================================================================
  describe('Integer Minor Units (Paise) Financial Integrity', () => {
    it('9: calculatePurchaseLineTotal uses integer paise without floating point inaccuracy', () => {
      const qty = 2.5; // 2.5 kg
      const unitPricePaise = 8550; // ₹85.50 per kg
      const lineTotal = calculatePurchaseLineTotal(qty, unitPricePaise);
      expect(lineTotal).toBe(21375); // ₹213.75 in paise
      expect(Number.isInteger(lineTotal)).toBe(true);
    });

    it('10: calculatePurchaseOrderTotals accurately computes subtotal, tax and grand total in paise', () => {
      const items = [
        { lineTotalMinor: 10000 }, // ₹100.00
        { lineTotalMinor: 25050 }, // ₹250.50
        { lineTotalMinor: 4950 }   // ₹49.50
      ];
      const taxRatePercent = 5; // 5% GST

      const totals = calculatePurchaseOrderTotals(items as any, taxRatePercent);
      expect(totals.subtotalMinor).toBe(40000); // ₹400.00
      expect(totals.taxMinor).toBe(2000); // 5% of 40000 = ₹20.00
      expect(totals.grandTotalMinor).toBe(42000); // ₹420.00
      expect(Number.isInteger(totals.grandTotalMinor)).toBe(true);
    });

    it('11: calculateRecipeCostPaise calculates BOM cost in integer paise with unit conversion', () => {
      const ingredients: RecipeIngredient[] = [
        {
          inventoryItemId: 'inv_1',
          quantity: 250, // 250g in recipe
          unit: 'g',
          inventoryItemSnapshot: {
            name: 'Basmati Rice',
            unit: 'kg', // base unit is kg
            costPerUnitPaise: 8000 // ₹80.00 per kg -> 250g = ₹20.00 (2000 paise)
          }
        },
        {
          inventoryItemId: 'inv_2',
          quantity: 50, // 50ml in recipe
          unit: 'ml',
          inventoryItemSnapshot: {
            name: 'Ghee',
            unit: 'litre', // base unit is litre
            costPerUnitPaise: 60000 // ₹600.00 per litre -> 50ml = ₹30.00 (3000 paise)
          }
        },
        {
          inventoryItemId: 'inv_3',
          quantity: 2, // 2 pieces
          unit: 'piece',
          inventoryItemSnapshot: {
            name: 'Bay Leaf Pack',
            unit: 'piece',
            costPerUnitPaise: 500 // ₹5.00 per piece -> 2 pieces = ₹10.00 (1000 paise)
          }
        }
      ];

      const totalCost = calculateRecipeCostPaise(ingredients);
      expect(totalCost).toBe(6000); // 2000 + 3000 + 1000 = 6000 paise (₹60.00)
      expect(Number.isInteger(totalCost)).toBe(true);
    });

    it('12: Inventory catalog valuation computes integer sum across all items', () => {
      const items: InventoryItem[] = [
        { id: '1', restaurantId: 'r1', name: 'Item 1', normalizedName: 'item 1', createdBy: 'u1', updatedBy: 'u1', unit: 'kg', currentQuantity: 10.5, costPerUnitPaise: 10000, active: true, status: 'active', minimumQuantity: 5, createdAt: new Date(), updatedAt: new Date() },
        { id: '2', restaurantId: 'r1', name: 'Item 2', normalizedName: 'item 2', createdBy: 'u1', updatedBy: 'u1', unit: 'litre', currentQuantity: 20, costPerUnitPaise: 5000, active: true, status: 'active', minimumQuantity: 5, createdAt: new Date(), updatedAt: new Date() },
        { id: '3', restaurantId: 'r1', name: 'Item 3', normalizedName: 'item 3', createdBy: 'u1', updatedBy: 'u1', unit: 'piece', currentQuantity: 100, costPerUnitPaise: 250, active: true, status: 'active', minimumQuantity: 10, createdAt: new Date(), updatedAt: new Date() }
      ];

      const overview = inventoryAnalyticsService.computeOverview(items);
      // 10.5 * 10000 = 105000
      // 20 * 5000 = 100000
      // 100 * 250 = 25000
      // Total = 230000 paise (₹2,300.00)
      expect(overview.totalValuationPaise).toBe(230000);
      expect(overview.activeItems).toBe(3);
    });

    it('13: Category distribution proportion percentages sum correctly to 100%', () => {
      const items: InventoryItem[] = [
        { id: '1', restaurantId: 'r1', name: 'Rice', normalizedName: 'rice', createdBy: 'u1', updatedBy: 'u1', unit: 'kg', currentQuantity: 50, costPerUnitPaise: 10000, active: true, status: 'active', minimumQuantity: 5, createdAt: new Date(), updatedAt: new Date() }, // 500,000 paise (50%)
        { id: '2', restaurantId: 'r1', name: 'Oil', normalizedName: 'oil', createdBy: 'u1', updatedBy: 'u1', unit: 'litre', currentQuantity: 50, costPerUnitPaise: 10000, active: true, status: 'active', minimumQuantity: 5, createdAt: new Date(), updatedAt: new Date() } // 500,000 paise (50%)
      ];

      const overview = inventoryAnalyticsService.computeOverview(items);
      const weightDist = overview.categoryDistribution.find(c => c.category === 'weight');
      const volumeDist = overview.categoryDistribution.find(c => c.category === 'volume');

      expect(weightDist?.proportionPercent).toBe(50);
      expect(volumeDist?.proportionPercent).toBe(50);
    });

    it('14: Zero quantity or zero cost results in zero valuation gracefully', () => {
      const items: InventoryItem[] = [
        { id: '1', restaurantId: 'r1', name: 'Zero Stock', normalizedName: 'zero stock', createdBy: 'u1', updatedBy: 'u1', unit: 'kg', currentQuantity: 0, costPerUnitPaise: 10000, active: true, status: 'active', minimumQuantity: 5, createdAt: new Date(), updatedAt: new Date() },
        { id: '2', restaurantId: 'r1', name: 'Free Item', normalizedName: 'free item', createdBy: 'u1', updatedBy: 'u1', unit: 'kg', currentQuantity: 10, costPerUnitPaise: 0, active: true, status: 'active', minimumQuantity: 5, createdAt: new Date(), updatedAt: new Date() }
      ];

      const overview = inventoryAnalyticsService.computeOverview(items);
      expect(overview.totalValuationPaise).toBe(0);
      expect(overview.outOfStockCount).toBe(1);
    });
  });

  // ============================================================================
  // MATHEMATICAL RECONCILIATION ENGINE TESTS (15-26)
  // ============================================================================
  describe('Mathematical Stock Reconciliation Invariants', () => {
    const mockItem: InventoryItem = {
      id: 'inv_reconcile_1',
      restaurantId: 'rest_rec_1',
      name: 'Basmati Rice',
      normalizedName: 'basmati rice',
      createdBy: 'u1',
      updatedBy: 'u1',
      unit: 'kg',
      currentQuantity: 85,
      minimumQuantity: 20,
      costPerUnitPaise: 8000,
      active: true,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('15: Perfect reconciliation on standard movement lifecycle (Opening + In - Out = Current)', () => {
      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 50, delta: 50, previousQuantity: 0, resultingQuantity: 50, unit: 'kg', actorUid: 'u1', reason: 'Initial', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_in', quantity: 50, delta: 50, previousQuantity: 50, resultingQuantity: 100, unit: 'kg', actorUid: 'u1', reason: 'Purchase', createdAt: new Date('2026-09-02T10:00:00Z') },
        { id: 'm3', movementId: 'm3', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_out', quantity: 15, delta: -15, previousQuantity: 100, resultingQuantity: 85, unit: 'kg', actorUid: 'u1', reason: 'Consumption', createdAt: new Date('2026-09-03T10:00:00Z') }
      ];

      const summary = inventoryAnalyticsService.computeItemReconciliation(mockItem, movements);

      expect(summary.openingQuantity).toBe(50);
      expect(summary.totalInflow).toBe(50);
      expect(summary.totalOutflow).toBe(15);
      expect(summary.netChange).toBe(35);
      expect(summary.calculatedQuantity).toBe(85);
      expect(summary.currentQuantity).toBe(85);
      expect(summary.isReconciled).toBe(true);
      expect(summary.discrepancy).toBe(0);
    });

    it('16: Reconciles complex sequence with wastage, damage, and adjustments', () => {
      // Opening: 100
      // Inflow: +50 (Purchase)
      // Wastage: -5
      // Damage: -3
      // Outflow: -42
      // Net: 100 + 50 - 5 - 3 - 42 = 100
      const itemWith100: InventoryItem = { ...mockItem, currentQuantity: 100 };

      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 100, delta: 100, previousQuantity: 0, resultingQuantity: 100, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_in', quantity: 50, delta: 50, previousQuantity: 100, resultingQuantity: 150, unit: 'kg', actorUid: 'u1', reason: 'PO', createdAt: new Date('2026-09-02T10:00:00Z') },
        { id: 'm3', movementId: 'm3', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'wastage', quantity: 5, delta: -5, previousQuantity: 150, resultingQuantity: 145, unit: 'kg', actorUid: 'u1', reason: 'Spoiled', createdAt: new Date('2026-09-03T10:00:00Z') },
        { id: 'm4', movementId: 'm4', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'damage', quantity: 3, delta: -3, previousQuantity: 145, resultingQuantity: 142, unit: 'kg', actorUid: 'u1', reason: 'Bag torn', createdAt: new Date('2026-09-04T10:00:00Z') },
        { id: 'm5', movementId: 'm5', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_out', quantity: 42, delta: -42, previousQuantity: 142, resultingQuantity: 100, unit: 'kg', actorUid: 'u1', reason: 'Order prep', createdAt: new Date('2026-09-05T10:00:00Z') }
      ];

      const summary = inventoryAnalyticsService.computeItemReconciliation(itemWith100, movements);

      expect(summary.calculatedQuantity).toBe(100);
      expect(summary.currentQuantity).toBe(100);
      expect(summary.isReconciled).toBe(true);
      expect(summary.totalOutflow).toBe(50); // 5 + 3 + 42
    });

    it('17: Accurately detects physical stock deficit discrepancy', () => {
      // Current on-hand is 70, but ledger calculates 85 (Discrepancy: -15)
      const itemDeficit: InventoryItem = { ...mockItem, currentQuantity: 70 };

      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 100, delta: 100, previousQuantity: 0, resultingQuantity: 100, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_out', quantity: 15, delta: -15, previousQuantity: 100, resultingQuantity: 85, unit: 'kg', actorUid: 'u1', reason: 'Orders', createdAt: new Date('2026-09-02T10:00:00Z') }
      ];

      const summary = inventoryAnalyticsService.computeItemReconciliation(itemDeficit, movements);

      expect(summary.calculatedQuantity).toBe(85);
      expect(summary.currentQuantity).toBe(70);
      expect(summary.isReconciled).toBe(false);
      expect(summary.discrepancy).toBe(-15);
    });

    it('18: Accurately detects physical stock surplus discrepancy', () => {
      // Current on-hand is 90, but ledger calculates 85 (Discrepancy: +5)
      const itemSurplus: InventoryItem = { ...mockItem, currentQuantity: 90 };

      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 100, delta: 100, previousQuantity: 0, resultingQuantity: 100, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_out', quantity: 15, delta: -15, previousQuantity: 100, resultingQuantity: 85, unit: 'kg', actorUid: 'u1', reason: 'Orders', createdAt: new Date('2026-09-02T10:00:00Z') }
      ];

      const summary = inventoryAnalyticsService.computeItemReconciliation(itemSurplus, movements);

      expect(summary.calculatedQuantity).toBe(85);
      expect(summary.currentQuantity).toBe(90);
      expect(summary.isReconciled).toBe(false);
      expect(summary.discrepancy).toBe(5);
    });

    it('19: Reconciles zero movements item where current quantity equals 0', () => {
      const zeroItem: InventoryItem = { ...mockItem, currentQuantity: 0 };
      const summary = inventoryAnalyticsService.computeItemReconciliation(zeroItem, []);

      expect(summary.openingQuantity).toBe(0);
      expect(summary.calculatedQuantity).toBe(0);
      expect(summary.currentQuantity).toBe(0);
      expect(summary.isReconciled).toBe(true);
    });

    it('20: Multi-item batch reconciliation calculates stats across whole catalog', () => {
      const items: InventoryItem[] = [
        { id: 'i1', restaurantId: 'r1', name: 'Item 1', normalizedName: 'item 1', createdBy: 'u1', updatedBy: 'u1', unit: 'kg', currentQuantity: 10, minimumQuantity: 5, costPerUnitPaise: 1000, active: true, status: 'active', createdAt: new Date(), updatedAt: new Date() },
        { id: 'i2', restaurantId: 'r1', name: 'Item 2', normalizedName: 'item 2', createdBy: 'u1', updatedBy: 'u1', unit: 'kg', currentQuantity: 20, minimumQuantity: 5, costPerUnitPaise: 2000, active: true, status: 'active', createdAt: new Date(), updatedAt: new Date() }
      ];

      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'i1', type: 'opening', quantity: 10, delta: 10, previousQuantity: 0, resultingQuantity: 10, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date() },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'i2', type: 'opening', quantity: 20, delta: 20, previousQuantity: 0, resultingQuantity: 20, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date() }
      ];

      const results = inventoryAnalyticsService.computeReconciliationFromMovements(items, movements);

      expect(results.length).toBe(2);
      expect(results[0].isReconciled).toBe(true);
      expect(results[1].isReconciled).toBe(true);
    });

    it('21: Correctly accounts for positive and negative adjustment deltas in ledger', () => {
      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 50, delta: 50, previousQuantity: 0, resultingQuantity: 50, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'adjustment', quantity: 10, delta: 10, previousQuantity: 50, resultingQuantity: 60, unit: 'kg', actorUid: 'u1', reason: 'Physical recount +10', createdAt: new Date('2026-09-02T10:00:00Z') },
        { id: 'm3', movementId: 'm3', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'adjustment', quantity: 5, delta: -5, previousQuantity: 60, resultingQuantity: 55, unit: 'kg', actorUid: 'u1', reason: 'Physical recount -5', createdAt: new Date('2026-09-03T10:00:00Z') }
      ];

      const item55: InventoryItem = { ...mockItem, currentQuantity: 55 };
      const summary = inventoryAnalyticsService.computeItemReconciliation(item55, movements);

      expect(summary.calculatedQuantity).toBe(55);
      expect(summary.isReconciled).toBe(true);
    });

    it('22: Accounts for compensating correction movements in reconciliation', () => {
      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 50, delta: 50, previousQuantity: 0, resultingQuantity: 50, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_out', quantity: 20, delta: -20, previousQuantity: 50, resultingQuantity: 30, unit: 'kg', actorUid: 'u1', reason: 'Erroneous stock out', createdAt: new Date('2026-09-02T10:00:00Z') },
        { id: 'm3', movementId: 'm3', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'correction', quantity: 20, delta: 20, previousQuantity: 30, resultingQuantity: 50, unit: 'kg', actorUid: 'u1', reason: 'Reversal of m2', reversalOfMovementId: 'm2', createdAt: new Date('2026-09-03T10:00:00Z') }
      ];

      const item50: InventoryItem = { ...mockItem, currentQuantity: 50 };
      const summary = inventoryAnalyticsService.computeItemReconciliation(item50, movements);

      expect(summary.calculatedQuantity).toBe(50);
      expect(summary.isReconciled).toBe(true);
    });

    it('23: Ignores movements belonging to other inventory items during single item reconciliation', () => {
      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 50, delta: 50, previousQuantity: 0, resultingQuantity: 50, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_other_item_99', type: 'stock_in', quantity: 500, delta: 500, previousQuantity: 0, resultingQuantity: 500, unit: 'kg', actorUid: 'u1', reason: 'Alien item', createdAt: new Date('2026-09-02T10:00:00Z') }
      ];

      const item50: InventoryItem = { ...mockItem, currentQuantity: 50 };
      const summary = inventoryAnalyticsService.computeItemReconciliation(item50, movements);

      expect(summary.movementsCount).toBe(1);
      expect(summary.calculatedQuantity).toBe(50);
      expect(summary.isReconciled).toBe(true);
    });

    it('24: Correctly handles timestamp sorting order regardless of raw movement array ordering', () => {
      const movementsOutOfOrder: StockMovement[] = [
        { id: 'm3', movementId: 'm3', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_out', quantity: 10, delta: -10, previousQuantity: 80, resultingQuantity: 70, unit: 'kg', actorUid: 'u1', reason: 'Third', createdAt: new Date('2026-09-03T10:00:00Z') },
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 50, delta: 50, previousQuantity: 0, resultingQuantity: 50, unit: 'kg', actorUid: 'u1', reason: 'First', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_in', quantity: 30, delta: 30, previousQuantity: 50, resultingQuantity: 80, unit: 'kg', actorUid: 'u1', reason: 'Second', createdAt: new Date('2026-09-02T10:00:00Z') }
      ];

      const item70: InventoryItem = { ...mockItem, currentQuantity: 70 };
      const summary = inventoryAnalyticsService.computeItemReconciliation(item70, movementsOutOfOrder);

      expect(summary.calculatedQuantity).toBe(70);
      expect(summary.isReconciled).toBe(true);
    });

    it('25: Reconciles fractional quantities with 3-decimal precision (e.g. 0.333 kg)', () => {
      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 1, delta: 1, previousQuantity: 0, resultingQuantity: 1, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date('2026-09-01T10:00:00Z') },
        { id: 'm2', movementId: 'm2', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'stock_out', quantity: 0.333, delta: -0.333, previousQuantity: 1, resultingQuantity: 0.667, unit: 'kg', actorUid: 'u1', reason: 'Recipe 1/3 kg', createdAt: new Date('2026-09-02T10:00:00Z') }
      ];

      const itemFractional: InventoryItem = { ...mockItem, currentQuantity: 0.667 };
      const summary = inventoryAnalyticsService.computeItemReconciliation(itemFractional, movements);

      expect(summary.calculatedQuantity).toBe(0.667);
      expect(summary.isReconciled).toBe(true);
    });

    it('26: Computes financial discrepancy value in integer paise based on item unit cost', () => {
      const itemDeficit: InventoryItem = { ...mockItem, currentQuantity: 80, costPerUnitPaise: 8000 }; // Missing 5 kg at ₹80/kg
      const movements: StockMovement[] = [
        { id: 'm1', movementId: 'm1', restaurantId: 'r1', inventoryItemId: 'inv_reconcile_1', type: 'opening', quantity: 85, delta: 85, previousQuantity: 0, resultingQuantity: 85, unit: 'kg', actorUid: 'u1', reason: 'Init', createdAt: new Date() }
      ];

      const summary = inventoryAnalyticsService.computeItemReconciliation(itemDeficit, movements);
      expect(summary.discrepancy).toBe(-5);
      const financialDiscrepancyPaise = Math.round(summary.discrepancy * itemDeficit.costPerUnitPaise!);
      expect(financialDiscrepancyPaise).toBe(-40000); // -₹400.00 in paise
    });
  });
});

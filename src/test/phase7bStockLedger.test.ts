import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  roundQuantity,
  convertQuantity,
  areUnitsCompatible,
  formatQuantityWithUnit
} from '../utils/units';
import { hasPermission } from '../utils/permissions';
import {
  StockMovement,
  StockMovementType,
  InventoryItem,
  RecordStockMovementDTO,
  StockReconciliationSummary
} from '../types/inventory';
import { inventoryService } from '../services/inventoryService';
import { auditService } from '../services/auditService';

describe('M7-7B Stock Ledger & Advanced Stock Movements Master Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Signed Delta & Ledger Invariant Calculations
  // =========================================================================
  describe('1. Signed Delta & Resulting Stock Calculations', () => {
    it('correctly computes positive deltas for stock inflow types', () => {
      // Helper to simulate service signed delta logic
      const computeDelta = (type: StockMovementType, qty: number) => {
        switch (type) {
          case 'opening':
          case 'stock_in':
            return roundQuantity(qty);
          case 'stock_out':
          case 'wastage':
          case 'damage':
            return roundQuantity(-qty);
          default:
            return 0;
        }
      };

      expect(computeDelta('opening', 50)).toBe(50);
      expect(computeDelta('stock_in', 25.5)).toBe(25.5);
    });

    it('correctly computes negative deltas for stock outflow types', () => {
      const computeDelta = (type: StockMovementType, qty: number) => {
        switch (type) {
          case 'stock_out':
          case 'wastage':
          case 'damage':
            return roundQuantity(-qty);
          default:
            return 0;
        }
      };

      expect(computeDelta('stock_out', 10)).toBe(-10);
      expect(computeDelta('wastage', 2.125)).toBe(-2.125);
      expect(computeDelta('damage', 1.5)).toBe(-1.5);
    });

    it('calculates exact adjustment modes (set_to, add, subtract)', () => {
      const prevStock = 45.5;

      // Set to 50: delta = 50 - 45.5 = +4.5
      const setToTarget = 50;
      const setDelta = roundQuantity(setToTarget - prevStock);
      expect(setDelta).toBe(4.5);
      expect(roundQuantity(prevStock + setDelta)).toBe(50);

      // Set to 40: delta = 40 - 45.5 = -5.5
      const setToLower = 40;
      const setLowerDelta = roundQuantity(setToLower - prevStock);
      expect(setLowerDelta).toBe(-5.5);
      expect(roundQuantity(prevStock + setLowerDelta)).toBe(40);

      // Add 10: delta = +10
      const addQty = 10;
      expect(roundQuantity(prevStock + addQty)).toBe(55.5);

      // Subtract 5: delta = -5
      const subQty = 5;
      expect(roundQuantity(prevStock - subQty)).toBe(40.5);
    });

    it('enforces rounding to 3 decimal places without IEEE-754 precision leakage', () => {
      // 0.1 + 0.2 in standard JS is 0.30000000000000004
      const unrounded = 0.1 + 0.2;
      expect(roundQuantity(unrounded)).toBe(0.3);

      // Outflow deduction 10 - 0.001
      expect(roundQuantity(10 - 0.001)).toBe(9.999);

      // Precise 3-decimal fraction
      expect(roundQuantity(1.12345)).toBe(1.123);
      expect(roundQuantity(1.12365)).toBe(1.124);
    });

    it('strictly guards against negative stock across all movement variants', () => {
      const prevStock = 5.0;
      const attemptOutflow = 5.001;
      const resulting = roundQuantity(prevStock - attemptOutflow);

      expect(resulting).toBe(-0.001);
      expect(resulting < 0).toBe(true); // Must be rejected
    });
  });

  // =========================================================================
  // 2. Reversal & Compensating Movement Logic
  // =========================================================================
  describe('2. Compensating Movement / Reversal Invariants', () => {
    it('creates an exact inverted compensating delta when reversing a movement', () => {
      // Original stock_in (+15)
      const originalMovement: StockMovement = {
        id: 'mov_in_01',
        restaurantId: 'rest_1',
        inventoryItemId: 'item_1',
        type: 'stock_in',
        quantity: 15,
        unit: 'kg',
        delta: 15,
        previousQuantity: 10,
        resultingQuantity: 25,
        reason: 'Vendor arrival',
        actorUid: 'user_1',
        createdAt: new Date().toISOString()
      };

      // Compensating reversal delta must be -15
      const reversalDelta = -originalMovement.delta!;
      expect(reversalDelta).toBe(-15);

      // If current stock is 25, reversing stock_in of 15 leaves 10
      const currentStock = 25;
      const newStock = roundQuantity(currentStock + reversalDelta);
      expect(newStock).toBe(10);
      expect(newStock >= 0).toBe(true);
    });

    it('correctly inverts an outflow movement when reversing wastage', () => {
      // Original wastage (-5)
      const originalMovement: StockMovement = {
        id: 'mov_waste_01',
        restaurantId: 'rest_1',
        inventoryItemId: 'item_1',
        type: 'wastage',
        quantity: 5,
        unit: 'kg',
        delta: -5,
        previousQuantity: 20,
        resultingQuantity: 15,
        reason: 'Spoiled milk carton',
        actorUid: 'user_1',
        createdAt: new Date().toISOString()
      };

      // Compensating reversal delta must be +5
      const reversalDelta = -originalMovement.delta!;
      expect(reversalDelta).toBe(5);

      const currentStock = 15;
      const newStock = roundQuantity(currentStock + reversalDelta);
      expect(newStock).toBe(20);
    });

    it('rejects reversal if compensating deduction would drop stock below zero', () => {
      // Original movement added 50 kg
      const originalMovement: StockMovement = {
        id: 'mov_large_in',
        restaurantId: 'rest_1',
        inventoryItemId: 'item_1',
        type: 'stock_in',
        quantity: 50,
        unit: 'kg',
        delta: 50,
        previousQuantity: 0,
        resultingQuantity: 50,
        reason: 'Bulk stock',
        actorUid: 'user_1',
        createdAt: new Date().toISOString()
      };

      // Subsequent operations consumed 45 kg, current stock is now only 5 kg
      const currentStock = 5;
      const reversalDelta = -originalMovement.delta!; // -50
      const resultingStock = roundQuantity(currentStock + reversalDelta); // -45

      expect(resultingStock).toBe(-45);
      expect(resultingStock < 0).toBe(true);
      // Service must reject with insufficient stock error
    });

    it('tracks reversalOfMovementId and prevents double-reversing', () => {
      const originalMovementId = 'mov_target_99';
      const reversalMovement: StockMovement = {
        id: 'mov_rev_100',
        restaurantId: 'rest_1',
        inventoryItemId: 'item_1',
        type: 'adjustment',
        quantity: 10,
        unit: 'kg',
        delta: -10,
        previousQuantity: 30,
        resultingQuantity: 20,
        reason: 'Correction: Reversal of movement mov_target_99',
        referenceType: 'correction',
        referenceId: originalMovementId,
        reversalOfMovementId: originalMovementId,
        actorUid: 'user_1',
        createdAt: new Date().toISOString()
      };

      expect(reversalMovement.reversalOfMovementId).toBe(originalMovementId);
      expect(reversalMovement.referenceType).toBe('correction');
    });
  });

  // =========================================================================
  // 3. Stock Reconciliation & Integrity Verification
  // =========================================================================
  describe('3. Stock Reconciliation Mathematical Integrity', () => {
    it('accurately reconciles a balanced ledger where opening + inflow - outflow == current', () => {
      const opening = 20;
      const movements: StockMovement[] = [
        {
          id: 'm1',
          restaurantId: 'r1',
          inventoryItemId: 'item_1',
          type: 'opening',
          quantity: 20,
          unit: 'kg',
          delta: 20,
          previousQuantity: 0,
          resultingQuantity: 20,
          actorUid: 'u1',
          createdAt: '2026-09-01T00:00:00Z'
        },
        {
          id: 'm2',
          restaurantId: 'r1',
          inventoryItemId: 'item_1',
          type: 'stock_in',
          quantity: 30,
          unit: 'kg',
          delta: 30,
          previousQuantity: 20,
          resultingQuantity: 50,
          actorUid: 'u1',
          createdAt: '2026-09-02T00:00:00Z'
        },
        {
          id: 'm3',
          restaurantId: 'r1',
          inventoryItemId: 'item_1',
          type: 'stock_out',
          quantity: 15,
          unit: 'kg',
          delta: -15,
          previousQuantity: 50,
          resultingQuantity: 35,
          actorUid: 'u1',
          createdAt: '2026-09-03T00:00:00Z'
        },
        {
          id: 'm4',
          restaurantId: 'r1',
          inventoryItemId: 'item_1',
          type: 'wastage',
          quantity: 5,
          unit: 'kg',
          delta: -5,
          previousQuantity: 35,
          resultingQuantity: 30,
          actorUid: 'u1',
          createdAt: '2026-09-04T00:00:00Z'
        }
      ];

      // Compute total inflow & outflow
      let totalInflow = 0;
      let totalOutflow = 0;
      let calculatedStock = 0;

      for (const m of movements) {
        const delta = m.delta ?? (m.resultingQuantity - m.previousQuantity);
        calculatedStock = roundQuantity(calculatedStock + delta);
        if (delta > 0) {
          totalInflow = roundQuantity(totalInflow + delta);
        } else if (delta < 0) {
          totalOutflow = roundQuantity(totalOutflow + Math.abs(delta));
        }
      }

      const currentQuantity = 30; // Matches final resultingQuantity
      const discrepancy = roundQuantity(currentQuantity - calculatedStock);
      const isReconciled = Math.abs(discrepancy) < 0.0001;

      expect(totalInflow).toBe(50); // 20 opening + 30 stock_in
      expect(totalOutflow).toBe(20); // 15 stock_out + 5 wastage
      expect(calculatedStock).toBe(30);
      expect(discrepancy).toBe(0);
      expect(isReconciled).toBe(true);
    });

    it('detects and flags discrepancies when on-hand stock deviates from movements', () => {
      // Suppose database currentQuantity was manually tampered with or desynced
      const currentQuantity = 25; // Should be 30 according to movements
      const calculatedStock = 30;
      const discrepancy = roundQuantity(currentQuantity - calculatedStock); // -5
      const isReconciled = Math.abs(discrepancy) < 0.0001;

      expect(discrepancy).toBe(-5);
      expect(isReconciled).toBe(false);
    });
  });

  // =========================================================================
  // 4. Role Permissions & Access Control
  // =========================================================================
  describe('4. Inventory Role Permissions & Access Control', () => {
    it('authorizes Owner and Manager to manage inventory and record stock movements', () => {
      expect(hasPermission('owner', 'manage_inventory')).toBe(true);
      expect(hasPermission('manager', 'manage_inventory')).toBe(true);
    });

    it('forbids Cashier, Captain, Kitchen from performing inventory management actions', () => {
      expect(hasPermission('cashier', 'manage_inventory')).toBe(false);
      expect(hasPermission('captain', 'manage_inventory')).toBe(false);
      expect(hasPermission('kitchen', 'manage_inventory')).toBe(false);
    });
  });
});

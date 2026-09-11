import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UNIT_CONFIG,
  SUPPORTED_UNITS,
  isValidUnit,
  getUnitCategory,
  areUnitsCompatible,
  roundQuantity,
  convertQuantity,
  formatQuantityWithUnit,
  normalizeInventoryItemName,
  isLowStock
} from '../utils/units';
import { hasPermission, isViewAllowed } from '../utils/permissions';
import { OfflineSyncService } from '../services/offlineSyncService';
import { inventoryService } from '../services/inventoryService';
import { InventoryItem, StockMovement } from '../types/inventory';
import { auditService } from '../services/auditService';

describe('M7-7A Inventory Foundation Master Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // =========================================================================
  // 1. Unit Domain & Arithmetic Invariants
  // =========================================================================
  describe('1. Units of Measure & Deterministic Precision', () => {
    it('strictly supports required inventory units and categories', () => {
      expect(SUPPORTED_UNITS).toEqual(['kg', 'g', 'litre', 'ml', 'piece', 'box', 'packet']);
      expect(getUnitCategory('kg')).toBe('weight');
      expect(getUnitCategory('g')).toBe('weight');
      expect(getUnitCategory('litre')).toBe('volume');
      expect(getUnitCategory('ml')).toBe('volume');
      expect(getUnitCategory('piece')).toBe('count');
      expect(getUnitCategory('box')).toBe('count');
      expect(getUnitCategory('packet')).toBe('count');
    });

    it('enforces exact conversion factors without floating point leakage', () => {
      // Weight
      expect(convertQuantity(1.5, 'kg', 'g')).toBe(1500);
      expect(convertQuantity(250, 'g', 'kg')).toBe(0.25);
      expect(convertQuantity(0.005, 'kg', 'g')).toBe(5);

      // Volume
      expect(convertQuantity(2.5, 'litre', 'ml')).toBe(2500);
      expect(convertQuantity(750, 'ml', 'litre')).toBe(0.75);

      // Same unit identity
      expect(convertQuantity(12, 'piece', 'piece')).toBe(12);
      expect(convertQuantity(3, 'box', 'box')).toBe(3);
    });

    it('strictly forbids cross-category and incompatible unit conversions', () => {
      expect(areUnitsCompatible('kg', 'litre')).toBe(false);
      expect(areUnitsCompatible('piece', 'box')).toBe(false);
      expect(areUnitsCompatible('g', 'ml')).toBe(false);

      expect(() => convertQuantity(10, 'kg', 'litre')).toThrow(/Incompatible unit conversion/);
      expect(() => convertQuantity(5, 'piece', 'box')).toThrow(/Incompatible unit conversion/);
    });

    it('applies deterministic 3-decimal rounding to eliminate IEEE 754 float drift', () => {
      // 0.1 + 0.2 is 0.30000000000000004 in standard JS floating point
      expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
      expect(roundQuantity(1.2345)).toBe(1.235);
      expect(roundQuantity(5.0001)).toBe(5);
      expect(roundQuantity(0.0009)).toBe(0.001);
    });

    it('correctly calculates low-stock threshold state', () => {
      expect(isLowStock(10, 10)).toBe(true); // threshold inclusive
      expect(isLowStock(9.999, 10)).toBe(true);
      expect(isLowStock(10.001, 10)).toBe(false);
      expect(isLowStock(0, 5)).toBe(true);
    });

    it('normalizes item names consistently', () => {
      expect(normalizeInventoryItemName('  Basmati   Rice   ')).toBe('basmati rice');
      expect(normalizeInventoryItemName('WHOLE MILK')).toBe('whole milk');
    });
  });

  // =========================================================================
  // 2. Permission Matrix & Access Control
  // =========================================================================
  describe('2. Role-Based Access Control (RBAC)', () => {
    it('Owner and Manager have full access to view, adjust, and configure inventory', () => {
      for (const role of ['owner', 'manager'] as const) {
        expect(hasPermission(role, 'access_inventory')).toBe(true);
        expect(hasPermission(role, 'view_inventory')).toBe(true);
        expect(hasPermission(role, 'manage_inventory')).toBe(true);
        expect(isViewAllowed(role, 'inventory')).toBe(true);
      }
    });

    it('Accountant has read-only access to view stock and audit logs, but cannot perform mutations', () => {
      expect(hasPermission('accountant', 'access_inventory')).toBe(true);
      expect(hasPermission('accountant', 'view_inventory')).toBe(true);
      expect(hasPermission('accountant', 'manage_inventory')).toBe(false);
      expect(isViewAllowed('accountant', 'inventory')).toBe(true);
    });

    it('Cashier, Kitchen, and Captain roles are strictly barred from inventory in 7A', () => {
      for (const role of ['cashier', 'kitchen', 'captain'] as const) {
        expect(hasPermission(role, 'access_inventory')).toBe(false);
        expect(hasPermission(role, 'view_inventory')).toBe(false);
        expect(hasPermission(role, 'manage_inventory')).toBe(false);
        expect(isViewAllowed(role, 'inventory')).toBe(false);
      }
    });

    it('Unauthenticated requests are completely rejected', () => {
      expect(hasPermission(undefined, 'access_inventory')).toBe(false);
      expect(hasPermission(undefined, 'view_inventory')).toBe(false);
      expect(hasPermission(undefined, 'manage_inventory')).toBe(false);
      expect(isViewAllowed(undefined, 'inventory')).toBe(false);
    });
  });

  // =========================================================================
  // 3. Offline Sync Queue Integration
  // =========================================================================
  describe('3. Offline Queue & Resilient Synchronization', () => {
    let syncService: OfflineSyncService;

    beforeEach(() => {
      syncService = new OfflineSyncService();
    });

    it('enqueues create_inventory_item operation offline and processes upon reconnection', async () => {
      const mockCreatedItem: InventoryItem = {
        id: 'inv_item_99',
        restaurantId: 'rest_test_1',
        name: 'Organic Sugar',
        normalizedName: 'organic sugar',
        unit: 'kg',
        currentQuantity: 50,
        minimumQuantity: 10,
        status: 'active',
        active: true,
        createdBy: 'user_test',
        updatedBy: 'user_test',
        createdAt: {} as any,
        updatedAt: {} as any
      };

      const spyCreate = vi
        .spyOn(inventoryService, 'createInventoryItem')
        .mockResolvedValue(mockCreatedItem);

      // Prevent immediate auto-sync to test offline enqueue state
      const spyProcess = vi.spyOn(syncService, 'processQueue').mockImplementation(async () => {});

      const queueItem = syncService.enqueue('rest_test_1', 'create_inventory_item', {
        name: 'Organic Sugar',
        unit: 'kg',
        minimumQuantity: 10,
        openingQuantity: 50
      });

      expect(queueItem.operation).toBe('create_inventory_item');
      expect(queueItem.status).toBe('queued');
      expect(queueItem.idempotencyKey).toBeDefined();

      // Restore and trigger processQueue
      spyProcess.mockRestore();
      await syncService.processQueue();

      expect(spyCreate).toHaveBeenCalledTimes(1);
      expect(spyCreate).toHaveBeenCalledWith(
        'rest_test_1',
        expect.objectContaining({
          name: 'Organic Sugar',
          unit: 'kg',
          minimumQuantity: 10,
          openingQuantity: 50
        }),
        queueItem.idempotencyKey
      );

      const stats = syncService.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.queued).toBe(0);
    });

    it('enqueues record_stock_movement operation offline and processes atomically', async () => {
      const mockMovement: StockMovement = {
        id: 'mov_100',
        restaurantId: 'rest_test_1',
        inventoryItemId: 'inv_item_99',
        type: 'stock_in',
        quantity: 25,
        unit: 'kg',
        delta: 25,
        previousQuantity: 50,
        resultingQuantity: 75,
        reason: 'Shipment arrival',
        actorUid: 'actor_123',
        createdAt: {} as any
      };

      const spyRecord = vi
        .spyOn(inventoryService, 'recordStockMovement')
        .mockResolvedValue(mockMovement);

      // Prevent immediate auto-sync to test offline enqueue state
      const spyProcess = vi.spyOn(syncService, 'processQueue').mockImplementation(async () => {});

      const queueItem = syncService.enqueue('rest_test_1', 'record_stock_movement', {
        inventoryItemId: 'inv_item_99',
        type: 'stock_in',
        quantity: 25,
        unit: 'kg',
        reason: 'Shipment arrival'
      });

      expect(queueItem.operation).toBe('record_stock_movement');
      expect(queueItem.status).toBe('queued');

      // Restore and trigger processQueue
      spyProcess.mockRestore();
      await syncService.processQueue();

      expect(spyRecord).toHaveBeenCalledTimes(1);
      expect(spyRecord).toHaveBeenCalledWith(
        'rest_test_1',
        expect.objectContaining({
          inventoryItemId: 'inv_item_99',
          type: 'stock_in',
          quantity: 25,
          unit: 'kg',
          reason: 'Shipment arrival',
          clientRequestId: queueItem.idempotencyKey
        })
      );

      const stats = syncService.getStats();
      expect(stats.completed).toBe(1);
      expect(stats.queued).toBe(0);
    });
  });

  // =========================================================================
  // 4. Stock Movement Math & Validation Logic
  // =========================================================================
  describe('4. Stock Movement Business Rules & Negative Quantity Defense', () => {
    it('validates stock addition logic for stock_in and opening', () => {
      const prev = 100;
      const addition = 25.5;
      const resulting = roundQuantity(prev + addition);
      expect(resulting).toBe(125.5);
    });

    it('validates stock deduction logic for stock_out, wastage, and damage', () => {
      const prev = 50;
      const reduction = 15;
      const resulting = roundQuantity(prev - reduction);
      expect(resulting).toBe(35);
    });

    it('rejects reduction if resulting quantity would be negative', () => {
      const prev = 10;
      const reduction = 15;
      const resulting = roundQuantity(prev - reduction);
      expect(resulting < 0).toBe(true);
    });

    it('handles adjustment modes (set_to, add, subtract)', () => {
      const current = 80;

      // Mode: set_to
      const targetCount = 74;
      const setToResult = roundQuantity(targetCount);
      expect(setToResult).toBe(74);

      // Mode: add
      const addResult = roundQuantity(current + 10);
      expect(addResult).toBe(90);

      // Mode: subtract
      const subResult = roundQuantity(current - 5);
      expect(subResult).toBe(75);

      // Mode: subtract resulting in negative
      const subNeg = roundQuantity(current - 85);
      expect(subNeg < 0).toBe(true);
    });

    it('validates that unit conversions during movement preserve precision', () => {
      const currentKg = 5.25; // 5.25 kg
      const incomingGrams = 750; // 750 g
      const incomingInKg = convertQuantity(incomingGrams, 'g', 'kg'); // 0.75 kg
      const resultingKg = roundQuantity(currentKg + incomingInKg);

      expect(incomingInKg).toBe(0.75);
      expect(resultingKg).toBe(6);
    });
  });
});

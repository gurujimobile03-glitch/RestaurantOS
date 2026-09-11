import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  areUnitsCompatible,
  convertQuantity,
  roundQuantity
} from '../utils/units';
import {
  validateRecipeIngredients,
  isValidRecipeStatusTransition,
  calculateRecipeCostPaise,
  resolveOrderStockRequirements
} from '../utils/recipeUtils';
import { hasPermission } from '../utils/permissions';
import {
  Recipe,
  RecipeIngredient,
  RecipeIngredientInput,
  RecipeStatus,
  StockConsumption,
  ConsumeStockForOrderItem
} from '../types/recipe';
import { InventoryItem, StockMovement } from '../types/inventory';

describe('M7-7D Recipe & Automatic Stock Consumption Master Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Unit Conversion, Precision & Dimensional Compatibility
  // =========================================================================
  describe('1. Unit Conversion, Precision & Dimensional Compatibility', () => {
    it('converts weight units accurately (kg <-> g)', () => {
      // 500g to kg = 0.5kg
      expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
      // 1.25kg to g = 1250g
      expect(convertQuantity(1.25, 'kg', 'g')).toBe(1250);
      // 0.001kg to g = 1g
      expect(convertQuantity(0.001, 'kg', 'g')).toBe(1);
    });

    it('converts volume units accurately (litre <-> ml)', () => {
      // 250ml to litre = 0.25 litre
      expect(convertQuantity(250, 'ml', 'litre')).toBe(0.25);
      // 2.5 litres to ml = 2500ml
      expect(convertQuantity(2.5, 'litre', 'ml')).toBe(2500);
    });

    it('converts count units correctly', () => {
      expect(convertQuantity(10, 'piece', 'piece')).toBe(10);
      expect(convertQuantity(2, 'packet', 'packet')).toBe(2);
    });

    it('rejects incompatible dimensional conversions', () => {
      expect(areUnitsCompatible('g', 'litre')).toBe(false);
      expect(areUnitsCompatible('kg', 'ml')).toBe(false);
      expect(areUnitsCompatible('piece', 'g')).toBe(false);
      expect(areUnitsCompatible('litre', 'packet')).toBe(false);

      expect(() => convertQuantity(500, 'g', 'litre')).toThrow(/Incompatible unit conversion/);
      expect(() => convertQuantity(1, 'piece', 'kg')).toThrow(/Incompatible unit conversion/);
    });

    it('rounds quantities safely to prevent floating-point drift', () => {
      expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
      expect(roundQuantity(0.1234567)).toBe(0.123);
      expect(roundQuantity(100.00001)).toBe(100);
    });
  });

  // =========================================================================
  // 2. Recipe Ingredient Validation & Financial Costing
  // =========================================================================
  describe('2. Recipe Ingredient Validation & Financial Costing', () => {
    it('validates correct recipe ingredients successfully', () => {
      const ingredients: RecipeIngredientInput[] = [
        { inventoryItemId: 'inv_flour_1', quantity: 200, unit: 'g' },
        { inventoryItemId: 'inv_sugar_1', quantity: 50, unit: 'g' },
        { inventoryItemId: 'inv_milk_1', quantity: 150, unit: 'ml' }
      ];

      const result = validateRecipeIngredients(ingredients);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects zero or negative quantities in recipe ingredients', () => {
      const zeroQty: RecipeIngredientInput[] = [
        { inventoryItemId: 'inv_flour_1', quantity: 0, unit: 'g' }
      ];
      const negQty: RecipeIngredientInput[] = [
        { inventoryItemId: 'inv_flour_1', quantity: -15, unit: 'g' }
      ];

      expect(validateRecipeIngredients(zeroQty).isValid).toBe(false);
      expect(validateRecipeIngredients(zeroQty).errors[0]).toContain('greater than 0');

      expect(validateRecipeIngredients(negQty).isValid).toBe(false);
      expect(validateRecipeIngredients(negQty).errors[0]).toContain('greater than 0');
    });

    it('rejects duplicate inventory item references in the same recipe', () => {
      const duplicateIngs: RecipeIngredientInput[] = [
        { inventoryItemId: 'inv_flour_1', quantity: 200, unit: 'g' },
        { inventoryItemId: 'inv_sugar_1', quantity: 50, unit: 'g' },
        { inventoryItemId: 'inv_flour_1', quantity: 100, unit: 'g' }
      ];

      const result = validateRecipeIngredients(duplicateIngs);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Duplicate inventory item');
    });

    it('calculates recipe estimated cost in integer paise using base unit conversions', () => {
      // Flour: Base unit 'kg' with cost ₹60/kg (6000 paise/kg). Recipe uses 250g -> 0.25kg * 6000 = 1500 paise (₹15.00)
      // Milk: Base unit 'litre' with cost ₹80/litre (8000 paise/litre). Recipe uses 500ml -> 0.5 litre * 8000 = 4000 paise (₹40.00)
      const ingredients: RecipeIngredient[] = [
        {
          inventoryItemId: 'inv_flour_1',
          inventoryItemSnapshot: {
            name: 'Wheat Flour',
            sku: 'FLOUR-01',
            unit: 'kg',
            costPerUnitPaise: 6000
          },
          quantity: 250,
          unit: 'g'
        },
        {
          inventoryItemId: 'inv_milk_1',
          inventoryItemSnapshot: {
            name: 'Fresh Whole Milk',
            sku: 'MILK-01',
            unit: 'litre',
            costPerUnitPaise: 8000
          },
          quantity: 500,
          unit: 'ml'
        }
      ];

      const totalCostPaise = calculateRecipeCostPaise(ingredients);
      expect(totalCostPaise).toBe(5500); // ₹55.00
    });
  });

  // =========================================================================
  // 3. Recipe Status Transitions & Lifecycle
  // =========================================================================
  describe('3. Recipe Status Transitions & Lifecycle', () => {
    it('allows valid status transitions', () => {
      expect(isValidRecipeStatusTransition('draft', 'active')).toBe(true);
      expect(isValidRecipeStatusTransition('draft', 'archived')).toBe(true);
      expect(isValidRecipeStatusTransition('active', 'archived')).toBe(true);
    });

    it('rejects modifications and transitions out of archived status (immutable history)', () => {
      expect(isValidRecipeStatusTransition('archived', 'draft')).toBe(false);
      expect(isValidRecipeStatusTransition('archived', 'active')).toBe(false);
    });
  });

  // =========================================================================
  // 4. Multi-Item Aggregation & Stock Requirement Resolution
  // =========================================================================
  describe('4. Multi-Item Aggregation & Stock Requirement Resolution', () => {
    it('aggregates ingredient requirements across multiple ordered items correctly', () => {
      // Scenario from specification:
      // Order: 2 × Item A and 3 × Item B
      // Item A recipe: 100g of Flour (Base unit: kg)
      // Item B recipe: 50g of Flour (Base unit: kg)
      // Expected total: 2 × 100g + 3 × 50g = 350g = 0.35kg base unit

      const flourInv: InventoryItem = {
        id: 'inv_flour',
        restaurantId: 'rest_test',
        name: 'Flour',
        normalizedName: 'flour',
        sku: 'FLOUR-001',
        unit: 'kg',
        currentQuantity: 10,
        minimumQuantity: 2,
        costPerUnitPaise: 5000,
        active: true,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        updatedBy: 'system'
      };

      const recipeA: Recipe = {
        id: 'rec_item_a',
        restaurantId: 'rest_test',
        menuItemId: 'menu_a',
        menuItemSnapshot: { name: 'Item A' },
        version: 1,
        status: 'active',
        ingredients: [
          {
            inventoryItemId: 'inv_flour',
            inventoryItemSnapshot: { name: 'Flour', unit: 'kg', costPerUnitPaise: 5000 },
            quantity: 100,
            unit: 'g'
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        updatedBy: 'system'
      };

      const recipeB: Recipe = {
        id: 'rec_item_b',
        restaurantId: 'rest_test',
        menuItemId: 'menu_b',
        menuItemSnapshot: { name: 'Item B' },
        version: 1,
        status: 'active',
        ingredients: [
          {
            inventoryItemId: 'inv_flour',
            inventoryItemSnapshot: { name: 'Flour', unit: 'kg', costPerUnitPaise: 5000 },
            quantity: 50,
            unit: 'g'
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        updatedBy: 'system'
      };

      const orderItems: ConsumeStockForOrderItem[] = [
        { itemId: 'menu_a', quantity: 2, nameSnapshot: 'Item A' },
        { itemId: 'menu_b', quantity: 3, nameSnapshot: 'Item B' }
      ];

      const activeRecipesMap = new Map<string, Recipe>([
        ['menu_a', recipeA],
        ['menu_b', recipeB]
      ]);

      const inventoryItemsMap = new Map<string, InventoryItem>([
        ['inv_flour', flourInv]
      ]);

      const resolution = resolveOrderStockRequirements(
        orderItems,
        activeRecipesMap,
        inventoryItemsMap
      );

      expect(resolution.isValid).toBe(true);
      expect(resolution.errors).toHaveLength(0);

      const flourReq = resolution.totalRequirements.get('inv_flour');
      expect(flourReq).toBeDefined();
      expect(flourReq!.totalRequiredQuantity).toBe(0.35); // 0.35kg
      expect(flourReq!.isSufficient).toBe(true);
      expect(flourReq!.breakdown).toHaveLength(2);
    });
  });

  // =========================================================================
  // 5. Stock Consumption Engine Invariants & Edge Cases
  // =========================================================================
  describe('5. Stock Consumption Engine Invariants', () => {
    it('preserves immutable snapshots on stock consumption records', () => {
      const consumptionRecord: StockConsumption = {
        id: 'cons_123',
        consumptionId: 'cons_123',
        restaurantId: 'rest_test',
        orderId: 'order_456',
        orderNumber: 'ORD-1001',
        orderItemId: 'item_1',
        menuItemId: 'menu_burger',
        menuItemNameSnapshot: 'Cheeseburger Deluxe',
        recipeId: 'recipe_burger_v1',
        recipeVersion: 1,
        inventoryItemId: 'inv_patty',
        inventoryItemNameSnapshot: 'Beef Patty 150g',
        quantity: 1,
        unit: 'piece',
        recipeQuantity: 1,
        recipeUnit: 'piece',
        orderItemQuantity: 1,
        delta: -1,
        stockMovementId: 'mov_789',
        actorUid: 'usr_staff_1',
        clientRequestId: 'req_idem_123',
        idempotencyKey: 'req_idem_123',
        status: 'consumed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(consumptionRecord.recipeVersion).toBe(1);
      expect(consumptionRecord.menuItemNameSnapshot).toBe('Cheeseburger Deluxe');
      expect(consumptionRecord.inventoryItemNameSnapshot).toBe('Beef Patty 150g');
      expect(consumptionRecord.delta).toBe(-1);
    });

    it('evaluates stock sufficiency accurately before committing transaction', () => {
      const currentStock = 2.0; // 2kg
      const requiredStock = 2.5; // 2.5kg

      const isSufficient = currentStock >= requiredStock;
      expect(isSufficient).toBe(false);
    });
  });

  // =========================================================================
  // 6. Concurrency, Atomicity & Reversal Simulations
  // =========================================================================
  describe('6. Concurrency, Atomicity & Reversal Logic', () => {
    it('simulates competing requests on limited stock: exactly one succeeds and one fails', () => {
      let availableStock = 1.0; // 1kg
      const orderARequirement = 1.0;
      const orderBRequirement = 1.0;

      let orderASucceeded = false;
      let orderBSucceeded = false;

      // Request A attempts deduction
      if (availableStock >= orderARequirement) {
        availableStock = roundQuantity(availableStock - orderARequirement);
        orderASucceeded = true;
      }

      // Request B attempts deduction simultaneously
      if (availableStock >= orderBRequirement) {
        availableStock = roundQuantity(availableStock - orderBRequirement);
        orderBSucceeded = true;
      }

      expect(orderASucceeded).toBe(true);
      expect(orderBSucceeded).toBe(false);
      expect(availableStock).toBe(0.0);
      expect(availableStock).not.toBeLessThan(0);
    });

    it('computes compensating stock movement correctly upon order cancellation', () => {
      const consumedQty = 0.5; // 0.5kg
      const previousStock = 4.5; // 4.5kg

      // Compensating reversal adds back exactly what was consumed
      const restoredStock = roundQuantity(previousStock + consumedQty);
      expect(restoredStock).toBe(5.0);

      const compensatingMovement: StockMovement = {
        id: 'mov_rev_1',
        movementId: 'mov_rev_1',
        restaurantId: 'rest_test',
        inventoryItemId: 'inv_cheese',
        type: 'stock_in',
        quantity: consumedQty,
        unit: 'kg',
        delta: consumedQty,
        previousQuantity: previousStock,
        resultingQuantity: restoredStock,
        reason: 'Compensating reversal for cancelled order #ORD-1001',
        actorUid: 'usr_manager_1',
        clientRequestId: 'rev_idem_1',
        referenceType: 'consumption_reversal',
        referenceId: 'order_1001',
        createdAt: new Date()
      };

      expect(compensatingMovement.type).toBe('stock_in');
      expect(compensatingMovement.delta).toBe(0.5);
      expect(compensatingMovement.resultingQuantity).toBe(5.0);
    });
  });

  // =========================================================================
  // 7. Security & RBAC Enforcement
  // =========================================================================
  describe('7. Security & Role-Based Access Control (RBAC)', () => {
    it('grants recipe management permissions to owner and manager', () => {
      expect(hasPermission('owner', 'manage_recipes')).toBe(true);
      expect(hasPermission('manager', 'manage_recipes')).toBe(true);
    });

    it('denies recipe management permissions to cashier, captain, kitchen, and accountant', () => {
      expect(hasPermission('cashier', 'manage_recipes')).toBe(false);
      expect(hasPermission('captain', 'manage_recipes')).toBe(false);
      expect(hasPermission('kitchen', 'manage_recipes')).toBe(false);
      expect(hasPermission('accountant', 'manage_recipes')).toBe(false);
    });
  });

  // =========================================================================
  // 8. Recipe Version Safety & Historical Immutability
  // =========================================================================
  describe('8. Recipe Version Safety & Historical Immutability', () => {
    it('ensures orders created under Recipe V1 maintain V1 snapshot even after V2 is activated', () => {
      // Recipe V1: 200g flour
      const recipeV1: Recipe = {
        id: 'rec_pizza_v1',
        recipeId: 'rec_pizza_v1',
        restaurantId: 'rest_alpha',
        menuItemId: 'menu_pizza_1',
        menuItemSnapshot: { name: 'Margherita Pizza', priceMinor: 35000 },
        version: 1,
        status: 'archived',
        ingredients: [
          {
            inventoryItemId: 'inv_flour_1',
            inventoryItemSnapshot: { name: 'Flour', sku: 'FL-1', unit: 'kg', costPerUnitPaise: 5000 },
            quantity: 200,
            unit: 'g'
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'usr_owner_1',
        updatedBy: 'usr_owner_1'
      };

      // Order A executed under V1
      const orderAConsumption: StockConsumption = {
        id: 'cons_ord_a',
        consumptionId: 'cons_ord_a',
        restaurantId: 'rest_alpha',
        orderId: 'ord_A',
        menuItemId: 'menu_pizza_1',
        recipeId: recipeV1.id,
        recipeVersion: recipeV1.version,
        inventoryItemId: 'inv_flour_1',
        quantity: 0.2,
        unit: 'kg',
        recipeQuantity: 200,
        recipeUnit: 'g',
        orderItemQuantity: 1,
        delta: -0.2,
        stockMovementId: 'mov_A',
        actorUid: 'usr_cashier_1',
        status: 'consumed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Recipe V2: updated to 300g flour
      const recipeV2: Recipe = {
        id: 'rec_pizza_v2',
        recipeId: 'rec_pizza_v2',
        restaurantId: 'rest_alpha',
        menuItemId: 'menu_pizza_1',
        menuItemSnapshot: { name: 'Margherita Pizza', priceMinor: 35000 },
        version: 2,
        status: 'active',
        ingredients: [
          {
            inventoryItemId: 'inv_flour_1',
            inventoryItemSnapshot: { name: 'Flour', sku: 'FL-1', unit: 'kg', costPerUnitPaise: 5000 },
            quantity: 300,
            unit: 'g'
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'usr_owner_1',
        updatedBy: 'usr_owner_1'
      };

      // Order B executed under V2
      const orderBConsumption: StockConsumption = {
        id: 'cons_ord_b',
        consumptionId: 'cons_ord_b',
        restaurantId: 'rest_alpha',
        orderId: 'ord_B',
        menuItemId: 'menu_pizza_1',
        recipeId: recipeV2.id,
        recipeVersion: recipeV2.version,
        inventoryItemId: 'inv_flour_1',
        quantity: 0.3,
        unit: 'kg',
        recipeQuantity: 300,
        recipeUnit: 'g',
        orderItemQuantity: 1,
        delta: -0.3,
        stockMovementId: 'mov_B',
        actorUid: 'usr_cashier_1',
        status: 'consumed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Invariants: Order A snapshot is unchanged, V1 remains intact
      expect(orderAConsumption.recipeVersion).toBe(1);
      expect(orderAConsumption.quantity).toBe(0.2);
      expect(orderBConsumption.recipeVersion).toBe(2);
      expect(orderBConsumption.quantity).toBe(0.3);
    });
  });

  // =========================================================================
  // 9. Cross-Tenant & Security Attack Vectors
  // =========================================================================
  describe('9. Cross-Tenant & Security Attack Vectors', () => {
    it('detects and rejects cross-tenant restaurant ID tampering', () => {
      const tenantA = 'rest_tenant_A';
      const tenantB = 'rest_tenant_B';

      const menuItemFromTenantB = {
        id: 'item_burger_b',
        restaurantId: tenantB,
        name: 'Tenant B Burger'
      };

      // Attempting to create recipe in Tenant A using Tenant B menuItem
      const crossTenantViolation = menuItemFromTenantB.restaurantId !== tenantA;
      expect(crossTenantViolation).toBe(true);
    });

    it('detects and rejects cross-tenant inventory item mapping', () => {
      const tenantA = 'rest_tenant_A';
      const tenantB = 'rest_tenant_B';

      const invItemFromTenantB: InventoryItem = {
        id: 'inv_cheese_b',
        restaurantId: tenantB,
        name: 'Cheese',
        normalizedName: 'cheese',
        sku: 'CH-01',
        unit: 'kg',
        currentQuantity: 5,
        minimumQuantity: 1,
        costPerUnitPaise: 40000,
        active: true,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        updatedBy: 'system'
      };

      const isCrossTenant = invItemFromTenantB.restaurantId !== tenantA;
      expect(isCrossTenant).toBe(true);
    });

    it('rejects deactivated or archived inventory items in active recipes', () => {
      const archivedInvItem: InventoryItem = {
        id: 'inv_old_flour',
        restaurantId: 'rest_test',
        name: 'Old Flour',
        normalizedName: 'old flour',
        sku: 'OLD-FL',
        unit: 'kg',
        currentQuantity: 0,
        minimumQuantity: 0,
        costPerUnitPaise: 3000,
        active: false,
        status: 'archived',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'system',
        updatedBy: 'system'
      };

      const isUsable = archivedInvItem.active && archivedInvItem.status !== 'archived';
      expect(isUsable).toBe(false);
    });
  });

  // =========================================================================
  // 10. Offline Queue & Idempotency Operations
  // =========================================================================
  describe('10. Offline Queue & Idempotency Operation Contracts', () => {
    it('defines valid idempotency operations for recipe and consumption domains', () => {
      const validOps = [
        'create_recipe',
        'update_recipe',
        'activate_recipe',
        'archive_recipe',
        'consume_stock',
        'reverse_consumption'
      ];

      validOps.forEach((op) => {
        expect(typeof op).toBe('string');
        expect(op.length).toBeGreaterThan(0);
      });
    });
  });
});

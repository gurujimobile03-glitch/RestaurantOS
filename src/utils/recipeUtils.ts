/**
 * Pure Utility Functions for Recipe Validation, Status Transitions,
 * Recipe Costing, and Order Stock Consumption Mathematics in RestaurantOS M7-7D.
 */

import {
  RecipeStatus,
  RecipeIngredientInput,
  RecipeIngredient,
  Recipe,
  ConsumeStockForOrderItem
} from '../types/recipe';
import { InventoryItem, InventoryUnit } from '../types/inventory';
import {
  isValidUnit,
  areUnitsCompatible,
  convertQuantity,
  roundQuantity
} from './units';

export interface IngredientValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates raw recipe ingredient inputs for non-emptiness, positive quantities,
 * valid units, and duplicate inventory item references.
 */
export function validateRecipeIngredients(
  ingredients: RecipeIngredientInput[]
): IngredientValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return {
      isValid: false,
      errors: ['Recipe must contain at least one ingredient.']
    };
  }

  const seenItemIds = new Set<string>();

  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    const prefix = `Ingredient #${i + 1}`;

    if (!ing.inventoryItemId || typeof ing.inventoryItemId !== 'string' || ing.inventoryItemId.trim() === '') {
      errors.push(`${prefix}: Valid inventoryItemId is required.`);
      continue;
    }

    const cleanItemId = ing.inventoryItemId.trim();
    if (seenItemIds.has(cleanItemId)) {
      errors.push(`${prefix}: Duplicate inventory item "${cleanItemId}" detected in recipe.`);
    }
    seenItemIds.add(cleanItemId);

    if (typeof ing.quantity !== 'number' || !Number.isFinite(ing.quantity) || ing.quantity <= 0) {
      errors.push(`${prefix}: Quantity must be a positive number greater than 0.`);
    }

    if (!isValidUnit(ing.unit)) {
      errors.push(`${prefix}: Invalid or unsupported unit "${String(ing.unit)}".`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Deterministic status state-machine transitions for Recipes:
 * draft -> active | archived
 * active -> archived
 * archived -> terminal (immutable)
 */
export function isValidRecipeStatusTransition(
  current: RecipeStatus,
  next: RecipeStatus
): boolean {
  if (current === next) return true;

  switch (current) {
    case 'draft':
      return next === 'active' || next === 'archived';
    case 'active':
      return next === 'archived';
    case 'archived':
      return false; // Terminal state
    default:
      return false;
  }
}

/**
 * Calculates estimated recipe cost in integer paise based on snapshot costPerUnitPaise.
 */
export function calculateRecipeCostPaise(ingredients: RecipeIngredient[]): number {
  if (!Array.isArray(ingredients)) return 0;

  let totalPaise = 0;
  for (const ing of ingredients) {
    const costPerBase = ing.inventoryItemSnapshot?.costPerUnitPaise || 0;
    const baseUnit = ing.inventoryItemSnapshot?.unit;

    if (costPerBase > 0 && baseUnit && areUnitsCompatible(ing.unit, baseUnit)) {
      try {
        const qtyInBaseUnit = convertQuantity(ing.quantity, ing.unit, baseUnit);
        totalPaise += qtyInBaseUnit * costPerBase;
      } catch {
        // Fallback safely if unit conversion fails
      }
    }
  }

  return Math.round(totalPaise);
}

export interface ConsumedIngredientRequirement {
  inventoryItemId: string;
  inventoryItemName: string;
  baseUnit: InventoryUnit;
  totalRequiredQuantity: number; // in inventory base unit
  currentStock: number;
  isSufficient: boolean;
  shortageQuantity: number;
  breakdown: Array<{
    menuItemId: string;
    menuItemName: string;
    orderItemId?: string;
    orderQuantity: number;
    recipeQuantity: number;
    recipeUnit: InventoryUnit;
    convertedQuantityInBaseUnit: number;
    recipeId: string;
    recipeVersion: number;
  }>;
}

export interface OrderConsumptionResolution {
  isValid: boolean;
  errors: string[];
  totalRequirements: Map<string, ConsumedIngredientRequirement>;
  unmappedMenuItems: Array<{ itemId: string; name?: string }>;
}

/**
 * Resolves recipe requirements and computes aggregate inventory consumption across order line items.
 */
export function resolveOrderStockRequirements(
  orderItems: ConsumeStockForOrderItem[],
  activeRecipesMap: Map<string, Recipe>,
  inventoryItemsMap: Map<string, InventoryItem>
): OrderConsumptionResolution {
  const errors: string[] = [];
  const unmappedMenuItems: Array<{ itemId: string; name?: string }> = [];
  const totalRequirements = new Map<string, ConsumedIngredientRequirement>();

  for (const orderItem of orderItems) {
    const menuItemId = orderItem.itemId;
    const orderQty = orderItem.quantity;

    if (typeof orderQty !== 'number' || orderQty <= 0) {
      continue;
    }

    const recipe = activeRecipesMap.get(menuItemId);
    if (!recipe || recipe.status !== 'active') {
      unmappedMenuItems.push({ itemId: menuItemId, name: orderItem.nameSnapshot });
      continue;
    }

    for (const ing of recipe.ingredients) {
      const invItem = inventoryItemsMap.get(ing.inventoryItemId);
      if (!invItem) {
        errors.push(
          `Inventory item "${ing.inventoryItemId}" referenced by recipe for "${recipe.menuItemSnapshot.name}" does not exist.`
        );
        continue;
      }

      if (!invItem.active) {
        errors.push(
          `Inventory item "${invItem.name}" referenced by recipe for "${recipe.menuItemSnapshot.name}" is inactive.`
        );
        continue;
      }

      if (!areUnitsCompatible(ing.unit, invItem.unit)) {
        errors.push(
          `Incompatible units for "${invItem.name}": recipe unit (${ing.unit}) cannot be converted to base inventory unit (${invItem.unit}).`
        );
        continue;
      }

      // Convert recipe ingredient quantity for 1 dish to inventory base unit
      const singleItemBaseQty = convertQuantity(ing.quantity, ing.unit, invItem.unit);
      // Multiply by ordered line item count
      const lineItemBaseQty = roundQuantity(singleItemBaseQty * orderQty);

      let req = totalRequirements.get(invItem.id);
      if (!req) {
        req = {
          inventoryItemId: invItem.id,
          inventoryItemName: invItem.name,
          baseUnit: invItem.unit,
          totalRequiredQuantity: 0,
          currentStock: invItem.currentQuantity,
          isSufficient: true,
          shortageQuantity: 0,
          breakdown: []
        };
        totalRequirements.set(invItem.id, req);
      }

      req.totalRequiredQuantity = roundQuantity(req.totalRequiredQuantity + lineItemBaseQty);
      req.breakdown.push({
        menuItemId,
        menuItemName: orderItem.nameSnapshot || recipe.menuItemSnapshot.name,
        orderItemId: orderItem.orderItemId,
        orderQuantity: orderQty,
        recipeQuantity: ing.quantity,
        recipeUnit: ing.unit,
        convertedQuantityInBaseUnit: lineItemBaseQty,
        recipeId: recipe.id,
        recipeVersion: recipe.version
      });
    }
  }

  // Check stock sufficiency
  for (const [, req] of totalRequirements.entries()) {
    if (req.currentStock < req.totalRequiredQuantity) {
      req.isSufficient = false;
      req.shortageQuantity = roundQuantity(req.totalRequiredQuantity - req.currentStock);
      errors.push(
        `Insufficient stock for "${req.inventoryItemName}": required ${req.totalRequiredQuantity} ${req.baseUnit}, but only ${req.currentStock} ${req.baseUnit} available. Shortage: ${req.shortageQuantity} ${req.baseUnit}.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalRequirements,
    unmappedMenuItems
  };
}

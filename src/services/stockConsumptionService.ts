/**
 * Stock Consumption Service for RestaurantOS M7-7D.
 * 
 * Executes authoritative, multi-ingredient, atomic stock consumption via the M7-7B
 * Stock Ledger and Firestore transactions.
 * Handles deterministic idempotency, unit conversion, stock sufficiency validation,
 * and cancellation/refund reversal compensating movements.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import {
  StockConsumption,
  ConsumptionStatus,
  ConsumeStockForOrderDTO,
  ReverseStockConsumptionDTO,
  Recipe
} from '../types/recipe';
import { InventoryItem, StockMovement } from '../types/inventory';
import {
  stockConsumptionsPath,
  stockConsumptionDocPath,
  inventoryItemDocPath,
  stockMovementsPath,
  recipesPath
} from '../utils/paths';
import {
  convertQuantity,
  roundQuantity,
  areUnitsCompatible
} from '../utils/units';
import { enforcePermission } from '../utils/permissions';
import { auditService } from './auditService';
import { IdempotencyService } from './idempotencyService';

export class StockConsumptionService {
  private idempotency = new IdempotencyService();

  /**
   * Consumes stock for an order atomically across all mapped recipe ingredients.
   * If any ingredient has insufficient stock, the entire transaction is rejected with ZERO stock changes.
   * Idempotently returns cached consumption records if already executed for this order.
   */
  async consumeStockForOrder(
    restaurantId: string,
    data: ConsumeStockForOrderDTO
  ): Promise<{ consumptions: StockConsumption[]; movements: StockMovement[] }> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      throw new Error('restaurantId is required to consume stock');
    }

    const orderId = data.orderId?.trim();
    if (!orderId) {
      throw new Error('orderId is required to consume stock');
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      return { consumptions: [], movements: [] };
    }

    const actorUid = auth.currentUser?.uid || 'system';
    const idempotencyKey = data.clientRequestId?.trim() || `${cleanRestId}_consumption_${orderId}`;

    // 1. Check existing consumption records to prevent duplicate consumption
    const existingConsumptionsSnap = await getDocs(
      query(
        collection(db, stockConsumptionsPath(cleanRestId)),
        where('orderId', '==', orderId),
        where('status', '==', 'consumed')
      )
    );

    if (existingConsumptionsSnap && !existingConsumptionsSnap.empty) {
      const existingConsumptions: StockConsumption[] = [];
      const docs = existingConsumptionsSnap.docs || [];
      for (const d of docs) {
        existingConsumptions.push({ id: d.id, ...d.data() } as StockConsumption);
      }
      return { consumptions: existingConsumptions, movements: [] };
    }

    // 2. Fetch active recipes for all ordered menu items
    const distinctMenuItemIds = Array.from(new Set(data.items.map((i) => i.itemId.trim())));
    const activeRecipesMap = new Map<string, Recipe>();

    for (const mId of distinctMenuItemIds) {
      const q = query(
        collection(db, recipesPath(cleanRestId)),
        where('menuItemId', '==', mId),
        where('status', '==', 'active'),
        limit(1)
      );
      const recipeSnap = await getDocs(q);
      if (recipeSnap && !recipeSnap.empty && recipeSnap.docs && recipeSnap.docs.length > 0) {
        const rDoc = recipeSnap.docs[0];
        activeRecipesMap.set(mId, { id: rDoc.id, ...rDoc.data() } as Recipe);
      }
    }

    // If no ordered items have active recipes, no stock to consume
    const hasAnyRecipes = data.items.some((item) => activeRecipesMap.has(item.itemId.trim()));
    if (!hasAnyRecipes) {
      return { consumptions: [], movements: [] };
    }

    // 3. Pre-gather distinct inventory item IDs needed
    const distinctInventoryItemIds = new Set<string>();
    for (const item of data.items) {
      const recipe = activeRecipesMap.get(item.itemId.trim());
      if (recipe) {
        for (const ing of recipe.ingredients) {
          distinctInventoryItemIds.add(ing.inventoryItemId.trim());
        }
      }
    }

    // 4. Run atomic Firestore transaction
    const result = await runTransaction(db, async (tx) => {
      // Step A: Read all required inventory items inside transaction
      const inventoryItemsMap = new Map<string, InventoryItem>();
      for (const invId of distinctInventoryItemIds) {
        const invRef = doc(db, inventoryItemDocPath(cleanRestId, invId));
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) {
          throw new Error(`Inventory item "${invId}" referenced by recipe does not exist.`);
        }
        const invData = invSnap.data() as InventoryItem;
        if (invData.restaurantId !== cleanRestId) {
          throw new Error(`Inventory item "${invId}" belongs to a different restaurant.`);
        }
        if (!invData.active || invData.status === 'archived') {
          throw new Error(`Inventory item "${invData.name}" (${invData.id}) is inactive.`);
        }
        inventoryItemsMap.set(invId, invData);
      }

      // Step B: Calculate required quantities and verify unit compatibility
      // Map of inventoryItemId -> totalRequiredInBaseUnit
      const requiredQtyByItem = new Map<string, number>();

      interface ConsumptionLinePlan {
        orderItem: (typeof data.items)[0];
        recipe: Recipe;
        ingredient: Recipe['ingredients'][0];
        invItem: InventoryItem;
        requiredBaseQty: number;
      }

      const consumptionPlans: ConsumptionLinePlan[] = [];

      for (const item of data.items) {
        const orderQty = item.quantity;
        if (typeof orderQty !== 'number' || orderQty <= 0) continue;

        const recipe = activeRecipesMap.get(item.itemId.trim());
        if (!recipe) continue;

        for (const ing of recipe.ingredients) {
          const invItem = inventoryItemsMap.get(ing.inventoryItemId.trim());
          if (!invItem) continue;

          if (!areUnitsCompatible(ing.unit, invItem.unit)) {
            throw new Error(
              `Unit mismatch for "${invItem.name}": Recipe unit "${ing.unit}" cannot be converted to inventory base unit "${invItem.unit}".`
            );
          }

          const baseQtyPerDish = convertQuantity(ing.quantity, ing.unit, invItem.unit);
          const totalLineBaseQty = roundQuantity(baseQtyPerDish * orderQty);

          const currentTotal = requiredQtyByItem.get(invItem.id) || 0;
          requiredQtyByItem.set(invItem.id, roundQuantity(currentTotal + totalLineBaseQty));

          consumptionPlans.push({
            orderItem: item,
            recipe,
            ingredient: ing,
            invItem,
            requiredBaseQty: totalLineBaseQty
          });
        }
      }

      // Step C: Stock sufficiency validation - ALL OR NOTHING
      for (const [invId, requiredQty] of requiredQtyByItem.entries()) {
        const invItem = inventoryItemsMap.get(invId)!;
        if (invItem.currentQuantity < requiredQty) {
          const shortage = roundQuantity(requiredQty - invItem.currentQuantity);
          throw new Error(
            `Insufficient stock for "${invItem.name}": required ${requiredQty} ${invItem.unit}, but only ${invItem.currentQuantity} ${invItem.unit} available. Shortage: ${shortage} ${invItem.unit}. Consumption rejected.`
          );
        }
      }

      // Step D: Decrement stock for all inventory items
      const updatedStockMap = new Map<string, { prev: number; result: number }>();
      for (const [invId, requiredQty] of requiredQtyByItem.entries()) {
        const invItem = inventoryItemsMap.get(invId)!;
        const invRef = doc(db, inventoryItemDocPath(cleanRestId, invId));
        const newQty = roundQuantity(invItem.currentQuantity - requiredQty);

        tx.update(invRef, {
          currentQuantity: newQty,
          updatedAt: serverTimestamp(),
          updatedBy: actorUid
        });

        updatedStockMap.set(invId, {
          prev: invItem.currentQuantity,
          result: newQty
        });
      }

      // Step E: Create immutable StockMovement and StockConsumption records
      const createdConsumptions: StockConsumption[] = [];
      const createdMovements: StockMovement[] = [];
      const now = new Date();

      // Aggregate movements per inventory item to avoid multiple movements for the same item in one order,
      // or record distinct movement per item
      const movementByInvItem = new Map<string, string>(); // invId -> movementId

      for (const [invId, requiredQty] of requiredQtyByItem.entries()) {
        const invItem = inventoryItemsMap.get(invId)!;
        const stockState = updatedStockMap.get(invId)!;
        const movementCol = collection(db, stockMovementsPath(cleanRestId));
        const movementId = doc(movementCol).id;
        const movementRef = doc(db, `${stockMovementsPath(cleanRestId)}/${movementId}`);

        const movement: StockMovement = {
          id: movementId,
          movementId,
          restaurantId: cleanRestId,
          inventoryItemId: invId,
          type: 'stock_out',
          quantity: requiredQty,
          unit: invItem.unit,
          delta: -requiredQty,
          previousQuantity: stockState.prev,
          resultingQuantity: stockState.result,
          reason: `Recipe stock consumption for order #${data.orderNumber || orderId}`,
          actorUid,
          clientRequestId: idempotencyKey,
          referenceType: 'order',
          referenceId: orderId,
          createdAt: now
        };

        tx.set(movementRef, {
          ...movement,
          createdAt: serverTimestamp()
        });

        createdMovements.push(movement);
        movementByInvItem.set(invId, movementId);
      }

      // Record detailed StockConsumption documents
      for (const plan of consumptionPlans) {
        const consumptionCol = collection(db, stockConsumptionsPath(cleanRestId));
        const consumptionId = doc(consumptionCol).id;
        const consumptionRef = doc(db, stockConsumptionDocPath(cleanRestId, consumptionId));
        const movementId = movementByInvItem.get(plan.invItem.id)!;

        const consumption: StockConsumption = {
          id: consumptionId,
          consumptionId,
          restaurantId: cleanRestId,
          orderId,
          orderNumber: data.orderNumber,
          orderItemId: plan.orderItem.orderItemId,
          menuItemId: plan.orderItem.itemId.trim(),
          menuItemNameSnapshot: plan.orderItem.nameSnapshot || plan.recipe.menuItemSnapshot.name,
          recipeId: plan.recipe.id,
          recipeVersion: plan.recipe.version,
          inventoryItemId: plan.invItem.id,
          inventoryItemNameSnapshot: plan.invItem.name,
          quantity: plan.requiredBaseQty,
          unit: plan.invItem.unit,
          recipeQuantity: plan.ingredient.quantity,
          recipeUnit: plan.ingredient.unit,
          orderItemQuantity: plan.orderItem.quantity,
          delta: -plan.requiredBaseQty,
          stockMovementId: movementId,
          actorUid,
          clientRequestId: idempotencyKey,
          idempotencyKey,
          status: 'consumed',
          createdAt: now,
          updatedAt: now
        };

        tx.set(consumptionRef, {
          ...consumption,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        createdConsumptions.push(consumption);
      }

      return { consumptions: createdConsumptions, movements: createdMovements };
    });

    // 5. Audit Logging outside transaction
    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'inventory',
      entityId: orderId,
      action: 'stock_consumption_recorded',
      actorUid,
      metadata: {
        orderId,
        orderNumber: data.orderNumber,
        consumptionsCount: result.consumptions.length,
        movementsCount: result.movements.length
      }
    });

    return result;
  }

  /**
   * Reverses stock consumption for a cancelled, returned, or refunded order.
   * Creates compensating stock movements (type: 'stock_in') and transitions consumption status to 'reversed'.
   * Prevents double-reversals.
   */
  async reverseOrderStockConsumption(
    restaurantId: string,
    orderId: string,
    reason?: string,
    clientRequestId?: string
  ): Promise<{ reversedConsumptions: StockConsumption[]; compensatingMovements: StockMovement[] }> {
    const cleanRestId = restaurantId?.trim();
    const cleanOrderId = orderId?.trim();
    if (!cleanRestId || !cleanOrderId) {
      throw new Error('restaurantId and orderId are required to reverse consumption');
    }

    const actorUid = auth.currentUser?.uid || 'system';

    // 1. Fetch existing consumption documents for this order
    const consumptionsSnap = await getDocs(
      query(
        collection(db, stockConsumptionsPath(cleanRestId)),
        where('orderId', '==', cleanOrderId)
      )
    );

    if (!consumptionsSnap || consumptionsSnap.empty) {
      return { reversedConsumptions: [], compensatingMovements: [] };
    }

    const allConsumptions: StockConsumption[] = [];
    const activeConsumptions: StockConsumption[] = [];
    const docs = consumptionsSnap.docs || [];
    for (const d of docs) {
      const c = { id: d.id, ...d.data() } as StockConsumption;
      allConsumptions.push(c);
      if (c.status === 'consumed') {
        activeConsumptions.push(c);
      }
    }

    // If all already reversed, return them (idempotent replay)
    if (activeConsumptions.length === 0) {
      return { reversedConsumptions: allConsumptions, compensatingMovements: [] };
    }

    // 2. Run atomic reversal in transaction
    const result = await runTransaction(db, async (tx) => {
      // Group total return quantity per inventory item
      const returnQtyByItem = new Map<string, number>();
      for (const c of activeConsumptions) {
        const curr = returnQtyByItem.get(c.inventoryItemId) || 0;
        returnQtyByItem.set(c.inventoryItemId, roundQuantity(curr + c.quantity));
      }

      // Read inventory items
      const invItemsMap = new Map<string, InventoryItem>();
      for (const invId of returnQtyByItem.keys()) {
        const invRef = doc(db, inventoryItemDocPath(cleanRestId, invId));
        const invSnap = await tx.get(invRef);
        if (invSnap.exists()) {
          invItemsMap.set(invId, invSnap.data() as InventoryItem);
        }
      }

      // Update inventory stock & create compensating movements
      const compensatingMovements: StockMovement[] = [];
      const movementByInvItem = new Map<string, string>();
      const now = new Date();

      for (const [invId, returnQty] of returnQtyByItem.entries()) {
        const invItem = invItemsMap.get(invId);
        if (!invItem) continue;

        const invRef = doc(db, inventoryItemDocPath(cleanRestId, invId));
        const newQty = roundQuantity(invItem.currentQuantity + returnQty);

        tx.update(invRef, {
          currentQuantity: newQty,
          updatedAt: serverTimestamp(),
          updatedBy: actorUid
        });

        const movementCol = collection(db, stockMovementsPath(cleanRestId));
        const movementId = doc(movementCol).id;
        const movementRef = doc(db, `${stockMovementsPath(cleanRestId)}/${movementId}`);

        const movement: StockMovement = {
          id: movementId,
          movementId,
          restaurantId: cleanRestId,
          inventoryItemId: invId,
          type: 'stock_in',
          quantity: returnQty,
          unit: invItem.unit,
          delta: returnQty,
          previousQuantity: invItem.currentQuantity,
          resultingQuantity: newQty,
          reason: reason || `Compensating reversal for cancelled order #${cleanOrderId}`,
          actorUid,
          clientRequestId: clientRequestId?.trim() || null,
          referenceType: 'consumption_reversal',
          referenceId: cleanOrderId,
          createdAt: now
        };

        tx.set(movementRef, {
          ...movement,
          createdAt: serverTimestamp()
        });

        compensatingMovements.push(movement);
        movementByInvItem.set(invId, movementId);
      }

      // Update consumption records to reversed
      const updatedConsumptions: StockConsumption[] = [];
      for (const c of activeConsumptions) {
        const cRef = doc(db, stockConsumptionDocPath(cleanRestId, c.id));
        const compMovementId = movementByInvItem.get(c.inventoryItemId) || '';

        tx.update(cRef, {
          status: 'reversed',
          reversedAt: serverTimestamp(),
          reversedBy: actorUid,
          reversalMovementId: compMovementId,
          reversalReason: reason || 'Order cancelled',
          updatedAt: serverTimestamp()
        });

        updatedConsumptions.push({
          ...c,
          status: 'reversed',
          reversedAt: now,
          reversedBy: actorUid,
          reversalMovementId: compMovementId,
          reversalReason: reason || 'Order cancelled',
          updatedAt: now
        });
      }

      return { reversedConsumptions: updatedConsumptions, compensatingMovements };
    });

    // 3. Log audit event
    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'inventory',
      entityId: cleanOrderId,
      action: 'stock_consumption_reversed',
      actorUid,
      metadata: {
        orderId: cleanOrderId,
        reversedCount: result.reversedConsumptions.length,
        compensatingMovementsCount: result.compensatingMovements.length,
        reason: reason || 'Order cancelled'
      }
    });

    return result;
  }

  /**
   * Lists stock consumptions for an entire restaurant or filtered by order, menu item, or status.
   */
  async listStockConsumptions(
    restaurantId: string,
    options?: {
      orderId?: string;
      menuItemId?: string;
      inventoryItemId?: string;
      status?: ConsumptionStatus;
      limit?: number;
    }
  ): Promise<StockConsumption[]> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return [];

    await enforcePermission(cleanRestId, 'view_consumption');

    let q = query(collection(db, stockConsumptionsPath(cleanRestId)));

    if (options?.orderId?.trim()) {
      q = query(q, where('orderId', '==', options.orderId.trim()));
    }
    if (options?.menuItemId?.trim()) {
      q = query(q, where('menuItemId', '==', options.menuItemId.trim()));
    }
    if (options?.inventoryItemId?.trim()) {
      q = query(q, where('inventoryItemId', '==', options.inventoryItemId.trim()));
    }
    if (options?.status) {
      q = query(q, where('status', '==', options.status));
    }

    const snap = await getDocs(q);
    const list: StockConsumption[] = [];
    snap.forEach((d) => {
      const data = d.data() as StockConsumption;
      if (data.restaurantId === cleanRestId) {
        list.push({ id: d.id, ...data });
      }
    });

    // Sort descending by createdAt
    list.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    if (options?.limit && options.limit > 0) {
      return list.slice(0, options.limit);
    }

    return list;
  }

  /**
   * Subscribes to realtime stock consumption updates.
   */
  subscribeStockConsumptions(
    restaurantId: string,
    callback: (consumptions: StockConsumption[]) => void,
    options?: { orderId?: string; menuItemId?: string; inventoryItemId?: string; status?: ConsumptionStatus; limit?: number }
  ): Unsubscribe {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      callback([]);
      return () => {};
    }

    let q = query(collection(db, stockConsumptionsPath(cleanRestId)));

    if (options?.orderId?.trim()) {
      q = query(q, where('orderId', '==', options.orderId.trim()));
    }
    if (options?.menuItemId?.trim()) {
      q = query(q, where('menuItemId', '==', options.menuItemId.trim()));
    }
    if (options?.inventoryItemId?.trim()) {
      q = query(q, where('inventoryItemId', '==', options.inventoryItemId.trim()));
    }
    if (options?.status) {
      q = query(q, where('status', '==', options.status));
    }

    return onSnapshot(
      q,
      (snapshot) => {
        const list: StockConsumption[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as StockConsumption;
          if (data.restaurantId === cleanRestId) {
            list.push({ id: d.id, ...data });
          }
        });
        list.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        callback(options?.limit ? list.slice(0, options.limit) : list);
      },
      (error) => {
        console.error('Error in subscribeStockConsumptions:', error);
      }
    );
  }
}

export const stockConsumptionService = new StockConsumptionService();

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
  InventoryItem,
  StockMovement,
  StockMovementType,
  CreateInventoryItemDTO,
  UpdateInventoryItemDTO,
  RecordStockMovementDTO,
  InventoryItemStatus,
  StockLedgerQueryOptions,
  StockReconciliationSummary
} from '../types/inventory';
import {
  inventoryItemsPath,
  inventoryItemDocPath,
  stockMovementsPath,
  stockMovementDocPath
} from '../utils/paths';
import {
  roundQuantity,
  convertQuantity,
  isValidUnit,
  areUnitsCompatible,
  normalizeInventoryItemName
} from '../utils/units';
import { enforcePermission } from '../utils/permissions';
import { auditService } from './auditService';
import { IdempotencyService } from './idempotencyService';

export class InventoryService {
  private idempotency = new IdempotencyService();

  /**
   * Creates a new inventory item with optional initial opening stock.
   * Enforces tenant isolation, normalized name uniqueness for active items,
   * and logs auditable events.
   */
  async createInventoryItem(
    restaurantId: string,
    data: CreateInventoryItemDTO,
    clientRequestId?: string
  ): Promise<InventoryItem> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      throw new Error('restaurantId is required to create inventory item');
    }

    await enforcePermission(cleanRestId, 'manage_inventory');

    const name = data.name?.trim();
    if (!name) {
      throw new Error('Inventory item name is required');
    }

    if (!isValidUnit(data.unit)) {
      throw new Error(`Invalid inventory unit: "${String(data.unit)}"`);
    }

    const minQty = typeof data.minimumQuantity === 'number' ? roundQuantity(data.minimumQuantity) : 0;
    if (minQty < 0) {
      throw new Error('Minimum quantity cannot be negative');
    }

    const rawCurrentQty = typeof (data as any).currentQuantity === 'number' ? (data as any).currentQuantity : undefined;
    if (rawCurrentQty !== undefined && rawCurrentQty < 0) {
      throw new Error('Current quantity cannot be negative');
    }

    const openingQty = typeof data.openingQuantity === 'number' 
      ? roundQuantity(data.openingQuantity) 
      : (typeof rawCurrentQty === 'number' ? roundQuantity(rawCurrentQty) : 0);
    if (openingQty < 0) {
      throw new Error('Opening quantity cannot be negative');
    }

    if (typeof data.costPerUnitPaise === 'number' && data.costPerUnitPaise < 0) {
      throw new Error('Cost per unit cannot be negative');
    }

    // Idempotency check if key provided
    if (clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<InventoryItem>(
        cleanRestId,
        clientRequestId.trim(),
        'create_inventory_item',
        { ...data, restaurantId: cleanRestId }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    const normalizedName = normalizeInventoryItemName(name);

    // Duplicate active item check
    const existingSnap = await getDocs(
      query(
        collection(db, inventoryItemsPath(cleanRestId)),
        where('normalizedName', '==', normalizedName),
        where('active', '==', true)
      )
    );

    if (!existingSnap.empty) {
      throw new Error(`An active inventory item with the name "${name}" already exists.`);
    }

    const actorUid = auth.currentUser?.uid || 'system';
    const itemCol = collection(db, inventoryItemsPath(cleanRestId));
    const itemId = doc(itemCol).id;

    const newItem: InventoryItem = {
      id: itemId,
      restaurantId: cleanRestId,
      name,
      normalizedName,
      sku: data.sku?.trim() || undefined,
      unit: data.unit,
      currentQuantity: openingQty,
      minimumQuantity: minQty,
      reorderQuantity: typeof data.reorderQuantity === 'number' ? roundQuantity(data.reorderQuantity) : undefined,
      costPerUnitPaise: typeof data.costPerUnitPaise === 'number' ? Math.round(data.costPerUnitPaise) : undefined,
      status: 'active',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actorUid,
      updatedBy: actorUid
    };

    const itemRef = doc(db, inventoryItemDocPath(cleanRestId, itemId));
    await setDoc(itemRef, newItem);

    // If opening stock was specified > 0, create opening movement
    if (openingQty > 0) {
      const movementCol = collection(db, stockMovementsPath(cleanRestId));
      const movementId = doc(movementCol).id;
      const openingMovement: StockMovement = {
        id: movementId,
        movementId,
        restaurantId: cleanRestId,
        inventoryItemId: itemId,
        type: 'opening',
        quantity: openingQty,
        unit: data.unit,
        delta: openingQty,
        previousQuantity: 0,
        resultingQuantity: openingQty,
        reason: data.openingReason?.trim() || 'Initial opening stock',
        note: data.openingReason?.trim() || 'Initial opening stock balance',
        actorUid,
        clientRequestId: clientRequestId?.trim() || null,
        referenceType: 'opening',
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, stockMovementDocPath(cleanRestId, movementId)), openingMovement);

      await auditService.logEvent(cleanRestId, {
        restaurantId: cleanRestId,
        entityType: 'stockMovement',
        entityId: movementId,
        action: 'stock_opening_recorded',
        actorUid,
        metadata: {
          inventoryItemId: itemId,
          itemName: name,
          quantity: openingQty,
          unit: data.unit,
          delta: openingQty,
          previousQuantity: 0,
          resultingQuantity: openingQty
        }
      });
    }

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'inventoryItem',
      entityId: itemId,
      action: 'inventory_item_created',
      actorUid,
      metadata: {
        name,
        unit: data.unit,
        currentQuantity: openingQty,
        minimumQuantity: minQty
      }
    });

    if (clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        clientRequestId.trim(),
        'create_inventory_item',
        { ...data, restaurantId: cleanRestId },
        itemId,
        newItem
      );
    }

    return newItem;
  }

  /**
   * Retrieves an inventory item by ID, validating restaurant ownership.
   */
  async getInventoryItem(restaurantId: string, itemId: string): Promise<InventoryItem | null> {
    const cleanRestId = restaurantId?.trim();
    const cleanItemId = itemId?.trim();
    if (!cleanRestId || !cleanItemId) return null;

    const snap = await getDoc(doc(db, inventoryItemDocPath(cleanRestId, cleanItemId)));
    if (!snap.exists()) return null;
    const data = snap.data() as InventoryItem;
    if (data.restaurantId !== cleanRestId) {
      throw new Error('Cross-tenant inventory access rejected');
    }
    return { ...data, id: snap.id };
  }

  /**
   * Lists inventory items for a restaurant with optional filters.
   */
  async listInventoryItems(
    restaurantId: string,
    options?: { status?: InventoryItemStatus; activeOnly?: boolean; search?: string }
  ): Promise<InventoryItem[]> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return [];

    await enforcePermission(cleanRestId, 'view_inventory');

    const colRef = collection(db, inventoryItemsPath(cleanRestId));
    let q = query(colRef);

    if (options?.activeOnly) {
      q = query(colRef, where('active', '==', true));
    } else if (options?.status) {
      q = query(colRef, where('status', '==', options.status));
    }

    const snap = await getDocs(q);
    let items: InventoryItem[] = snap.docs.map(d => ({ ...(d.data() as InventoryItem), id: d.id }));

    // In-memory filter for search query
    if (options?.search?.trim()) {
      const term = options.search.trim().toLowerCase();
      items = items.filter(
        item =>
          item.name.toLowerCase().includes(term) ||
          (item.sku && item.sku.toLowerCase().includes(term))
      );
    }

    // Sort by name
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Updates an existing inventory item.
   * Protects immutable fields (restaurantId, id, currentQuantity).
   * Verifies unique active name if modified.
   */
  async updateInventoryItem(
    restaurantId: string,
    itemId: string,
    data: UpdateInventoryItemDTO
  ): Promise<InventoryItem> {
    const cleanRestId = restaurantId?.trim();
    const cleanItemId = itemId?.trim();
    if (!cleanRestId || !cleanItemId) {
      throw new Error('restaurantId and itemId are required');
    }

    await enforcePermission(cleanRestId, 'manage_inventory');

    const existing = await this.getInventoryItem(cleanRestId, cleanItemId);
    if (!existing) {
      throw new Error('Inventory item does not exist');
    }
    if (!existing.active || existing.status === 'inactive') {
      throw new Error('Cannot update a deactivated inventory item');
    }

    const updates: Partial<InventoryItem> = {
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || 'system'
    };

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new Error('Inventory item name cannot be empty');
      const normalizedName = normalizeInventoryItemName(name);

      if (normalizedName !== existing.normalizedName) {
        const dupSnap = await getDocs(
          query(
            collection(db, inventoryItemsPath(cleanRestId)),
            where('normalizedName', '==', normalizedName),
            where('active', '==', true)
          )
        );
        const hasOtherWithSameName = dupSnap.docs.some(d => d.id !== cleanItemId);
        if (hasOtherWithSameName) {
          throw new Error(`An active inventory item with the name "${name}" already exists.`);
        }
        updates.name = name;
        updates.normalizedName = normalizedName;
      }
    }

    if (data.sku !== undefined) {
      updates.sku = data.sku.trim() || undefined;
    }

    if (data.minimumQuantity !== undefined) {
      const minQty = roundQuantity(data.minimumQuantity);
      if (minQty < 0) throw new Error('Minimum quantity cannot be negative');
      updates.minimumQuantity = minQty;
    }

    if (data.reorderQuantity !== undefined) {
      const reorderQty = roundQuantity(data.reorderQuantity);
      if (reorderQty < 0) throw new Error('Reorder quantity cannot be negative');
      updates.reorderQuantity = reorderQty;
    }

    if (data.costPerUnitPaise !== undefined) {
      updates.costPerUnitPaise = Math.round(data.costPerUnitPaise);
    }

    if (data.unit !== undefined && data.unit !== existing.unit) {
      if (!isValidUnit(data.unit)) {
        throw new Error(`Invalid inventory unit: "${String(data.unit)}"`);
      }
      if (existing.currentQuantity > 0) {
        if (!areUnitsCompatible(existing.unit, data.unit)) {
          throw new Error(
            `Cannot change unit from ${existing.unit} to incompatible unit ${data.unit} while stock is non-zero`
          );
        }
        // Convert existing quantity to new unit
        updates.currentQuantity = convertQuantity(existing.currentQuantity, existing.unit, data.unit);
      }
      updates.unit = data.unit;
    }

    const itemRef = doc(db, inventoryItemDocPath(cleanRestId, cleanItemId));
    await updateDoc(itemRef, updates as any);

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'inventoryItem',
      entityId: cleanItemId,
      action: 'inventory_item_updated',
      actorUid: auth.currentUser?.uid || 'system',
      metadata: {
        updates: Object.keys(updates)
      }
    });

    return { ...existing, ...updates } as InventoryItem;
  }

  /**
   * Deactivates an inventory item (soft delete).
   * Preserves historical stock movements and records.
   */
  async deactivateInventoryItem(
    restaurantId: string,
    itemId: string,
    reason?: string
  ): Promise<InventoryItem> {
    const cleanRestId = restaurantId?.trim();
    const cleanItemId = itemId?.trim();
    if (!cleanRestId || !cleanItemId) {
      throw new Error('restaurantId and itemId are required');
    }

    await enforcePermission(cleanRestId, 'manage_inventory');

    const existing = await this.getInventoryItem(cleanRestId, cleanItemId);
    if (!existing) {
      throw new Error('Inventory item does not exist');
    }

    const actorUid = auth.currentUser?.uid || 'system';
    const itemRef = doc(db, inventoryItemDocPath(cleanRestId, cleanItemId));
    await updateDoc(itemRef, {
      active: false,
      status: 'inactive',
      updatedAt: serverTimestamp(),
      updatedBy: actorUid
    });

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'inventoryItem',
      entityId: cleanItemId,
      action: 'inventory_item_deactivated',
      actorUid,
      metadata: {
        itemName: existing.name,
        currentQuantity: existing.currentQuantity,
        reason: reason?.trim() || 'Manual deactivation'
      }
    });

    return {
      ...existing,
      active: false,
      status: 'inactive',
      updatedBy: actorUid
    };
  }

  /**
   * Records a stock movement atomically using a Firestore transaction.
   * Concurrency-safe, prevents negative stock, preserves immutable movement history,
   * and enforces idempotency.
   */
  async recordStockMovement(
    restaurantId: string,
    data: RecordStockMovementDTO
  ): Promise<StockMovement> {
    const cleanRestId = restaurantId?.trim();
    const itemId = data.inventoryItemId?.trim();
    if (!cleanRestId || !itemId) {
      throw new Error('restaurantId and inventoryItemId are required');
    }

    await enforcePermission(cleanRestId, 'manage_inventory');

    const validTypes: StockMovementType[] = [
      'opening',
      'stock_in',
      'stock_out',
      'adjustment',
      'wastage',
      'damage',
      'correction'
    ];
    if (!validTypes.includes(data.type)) {
      throw new Error(`Invalid stock movement type: "${data.type}"`);
    }

    if (typeof data.quantity !== 'number' || !Number.isFinite(data.quantity)) {
      throw new Error(`Movement quantity must be a finite number, received: ${String(data.quantity)}`);
    }

    const rawQty = roundQuantity(data.quantity);
    if (data.type !== 'adjustment' && data.type !== 'correction' && rawQty <= 0) {
      throw new Error('Movement quantity must be greater than 0');
    }
    if (data.type === 'adjustment' && rawQty < 0) {
      throw new Error('Adjustment quantity cannot be negative');
    }

    // Idempotency evaluation
    if (data.clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<StockMovement>(
        cleanRestId,
        data.clientRequestId.trim(),
        'record_stock_movement',
        { ...data, restaurantId: cleanRestId }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    const itemRef = doc(db, inventoryItemDocPath(cleanRestId, itemId));
    const movementCol = collection(db, stockMovementsPath(cleanRestId));
    const movementId = doc(movementCol).id;
    const movementRef = doc(db, stockMovementDocPath(cleanRestId, movementId));
    const actorUid = auth.currentUser?.uid || 'system';

    const recordedMovement = await runTransaction(db, async transaction => {
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists()) {
        throw new Error('Inventory item does not exist');
      }

      const itemData = itemSnap.data() as InventoryItem;
      if (itemData.restaurantId !== cleanRestId) {
        throw new Error('Cross-tenant inventory access rejected');
      }
      if (!itemData.active || itemData.status === 'inactive') {
        throw new Error('Cannot record stock movement for deactivated inventory item');
      }

      // Convert quantity if input unit differs but is compatible
      let effectiveQty = rawQty;
      if (data.unit && data.unit !== itemData.unit) {
        if (!areUnitsCompatible(data.unit, itemData.unit)) {
          throw new Error(
            `Cannot record movement: unit "${data.unit}" is incompatible with item unit "${itemData.unit}".`
          );
        }
        effectiveQty = convertQuantity(rawQty, data.unit, itemData.unit);
      }

      const prevQty = roundQuantity(itemData.currentQuantity || 0);
      let delta = 0;
      let resultingQty = 0;
      let recordedChangeQty = effectiveQty;
      let reversalRef: any = null;

      switch (data.type) {
        case 'opening': {
          if (prevQty > 0) {
            throw new Error(
              `Duplicate opening stock rejected: Item "${itemData.name}" already has existing stock of ${prevQty} ${itemData.unit}. Use adjustment or stock in instead.`
            );
          }
          if (effectiveQty < 0) {
            throw new Error('Opening quantity cannot be negative');
          }
          delta = effectiveQty;
          resultingQty = roundQuantity(prevQty + delta);
          recordedChangeQty = effectiveQty;
          break;
        }
        case 'stock_in': {
          if (effectiveQty <= 0) {
            throw new Error('Stock in quantity must be greater than 0');
          }
          delta = effectiveQty;
          resultingQty = roundQuantity(prevQty + delta);
          recordedChangeQty = effectiveQty;
          break;
        }
        case 'stock_out': {
          if (effectiveQty <= 0) {
            throw new Error('Stock out quantity must be greater than 0');
          }
          delta = -effectiveQty;
          resultingQty = roundQuantity(prevQty + delta);
          if (resultingQty < 0) {
            throw new Error(
              `Insufficient stock: current stock is ${prevQty} ${itemData.unit}, attempted to deduct ${effectiveQty} ${itemData.unit}`
            );
          }
          recordedChangeQty = effectiveQty;
          break;
        }
        case 'wastage': {
          if (effectiveQty <= 0) {
            throw new Error('Wastage quantity must be greater than 0');
          }
          delta = -effectiveQty;
          resultingQty = roundQuantity(prevQty + delta);
          if (resultingQty < 0) {
            throw new Error(
              `Insufficient stock: current stock is ${prevQty} ${itemData.unit}, attempted to deduct ${effectiveQty} ${itemData.unit}`
            );
          }
          recordedChangeQty = effectiveQty;
          break;
        }
        case 'damage': {
          if (effectiveQty <= 0) {
            throw new Error('Damage quantity must be greater than 0');
          }
          delta = -effectiveQty;
          resultingQty = roundQuantity(prevQty + delta);
          if (resultingQty < 0) {
            throw new Error(
              `Insufficient stock: current stock is ${prevQty} ${itemData.unit}, attempted to deduct ${effectiveQty} ${itemData.unit}`
            );
          }
          recordedChangeQty = effectiveQty;
          break;
        }
        case 'adjustment': {
          const mode = data.adjustmentMode || 'set_to';
          if (mode === 'set_to') {
            if (effectiveQty < 0) {
              throw new Error('Physical count / set_to quantity cannot be negative');
            }
            resultingQty = effectiveQty;
            delta = roundQuantity(resultingQty - prevQty);
            recordedChangeQty = roundQuantity(Math.abs(delta));
          } else if (mode === 'add') {
            if (effectiveQty <= 0) {
              throw new Error('Adjustment addition quantity must be greater than 0');
            }
            delta = effectiveQty;
            resultingQty = roundQuantity(prevQty + delta);
            recordedChangeQty = effectiveQty;
          } else if (mode === 'subtract') {
            if (effectiveQty <= 0) {
              throw new Error('Adjustment subtraction quantity must be greater than 0');
            }
            delta = -effectiveQty;
            resultingQty = roundQuantity(prevQty + delta);
            if (resultingQty < 0) {
              throw new Error(
                `Insufficient stock: current stock is ${prevQty} ${itemData.unit}, attempted to adjust below zero`
              );
            }
            recordedChangeQty = effectiveQty;
          }
          break;
        }
        case 'correction': {
          if (data.reversalOfMovementId) {
            const targetMovementRef = doc(
              db,
              stockMovementDocPath(cleanRestId, data.reversalOfMovementId)
            );
            const targetSnap = await transaction.get(targetMovementRef);
            if (!targetSnap.exists()) {
              throw new Error(`Target movement to reverse "${data.reversalOfMovementId}" does not exist.`);
            }
            const targetData = targetSnap.data() as StockMovement;
            if (targetData.restaurantId !== cleanRestId || targetData.inventoryItemId !== itemId) {
              throw new Error('Target movement does not belong to this restaurant or inventory item');
            }
            if (targetData.reversedByMovementId) {
              throw new Error(
                `Movement "${data.reversalOfMovementId}" has already been reversed by movement "${targetData.reversedByMovementId}".`
              );
            }
            if (targetData.reversalOfMovementId || targetData.type === 'correction') {
              throw new Error('Cannot reverse a compensating movement');
            }

            // Compensating delta flips the original movement delta
            const targetDelta =
              typeof targetData.delta === 'number'
                ? targetData.delta
                : targetData.type === 'stock_out' || targetData.type === 'wastage' || targetData.type === 'damage'
                  ? -targetData.quantity
                  : targetData.quantity;

            delta = -roundQuantity(targetDelta);
            resultingQty = roundQuantity(prevQty + delta);
            if (resultingQty < 0) {
              throw new Error(
                `Cannot reverse movement: resulting stock balance would be negative (${resultingQty} ${itemData.unit}).`
              );
            }
            recordedChangeQty = roundQuantity(Math.abs(delta));
            reversalRef = targetMovementRef;
          } else {
            // Manual correction
            if (data.adjustmentMode === 'subtract') {
              delta = -effectiveQty;
              resultingQty = roundQuantity(prevQty + delta);
              if (resultingQty < 0) {
                throw new Error(
                  `Insufficient stock: current stock is ${prevQty} ${itemData.unit}, attempted to adjust below zero`
                );
              }
              recordedChangeQty = effectiveQty;
            } else {
              delta = effectiveQty;
              resultingQty = roundQuantity(prevQty + delta);
              recordedChangeQty = effectiveQty;
            }
          }
          break;
        }
      }

      // Ledger Invariant Verification
      if (resultingQty !== roundQuantity(prevQty + delta)) {
        throw new Error(
          `Ledger invariant failure: resultingQuantity (${resultingQty}) must equal previousQuantity (${prevQty}) + delta (${delta})`
        );
      }
      if (resultingQty < 0) {
        throw new Error(`Negative stock invariant failure: resulting stock cannot be negative (${resultingQty})`);
      }

      if (reversalRef) {
        transaction.update(reversalRef, { reversedByMovementId: movementId });
      }

      const movement: StockMovement = {
        id: movementId,
        movementId,
        restaurantId: cleanRestId,
        inventoryItemId: itemId,
        type: data.type,
        quantity: recordedChangeQty,
        unit: itemData.unit,
        delta,
        previousQuantity: prevQty,
        resultingQuantity: resultingQty,
        reason: data.reason?.trim() || '',
        note: data.note?.trim() || data.reason?.trim() || '',
        actorUid,
        clientRequestId: data.clientRequestId?.trim() || null,
        referenceType:
          data.referenceType ||
          (data.type === 'correction'
            ? 'correction'
            : data.adjustmentMode
              ? 'physical_count'
              : data.type === 'opening'
                ? 'opening'
                : 'manual'),
        referenceId: data.referenceId || data.reversalOfMovementId || undefined,
        reversalOfMovementId: data.reversalOfMovementId || undefined,
        createdAt: serverTimestamp()
      };

      transaction.set(movementRef, movement);
      transaction.update(itemRef, {
        currentQuantity: resultingQty,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid
      });

      return movement;
    });

    // Mark idempotency completed
    if (data.clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        data.clientRequestId.trim(),
        'record_stock_movement',
        { ...data, restaurantId: cleanRestId },
        movementId,
        recordedMovement
      );
    }

    // Log audit event
    const actionMap: Record<string, any> = {
      opening: 'stock_opening_recorded',
      stock_in: 'stock_in_recorded',
      stock_out: 'stock_out_recorded',
      adjustment:
        data.referenceType === 'physical_count' || data.adjustmentMode
          ? 'physical_count_recorded'
          : 'stock_adjustment_recorded',
      wastage: 'stock_wastage_recorded',
      damage: 'stock_damage_recorded',
      correction: 'stock_correction_recorded'
    };

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'stockMovement',
      entityId: movementId,
      action: actionMap[data.type] || 'stock_adjustment_recorded',
      actorUid,
      metadata: {
        inventoryItemId: itemId,
        type: data.type,
        quantity: recordedMovement.quantity,
        unit: recordedMovement.unit,
        delta: recordedMovement.delta,
        previousQuantity: recordedMovement.previousQuantity,
        resultingQuantity: recordedMovement.resultingQuantity,
        reason: data.reason?.trim() || undefined,
        note: data.note?.trim() || undefined,
        referenceType: recordedMovement.referenceType,
        referenceId: recordedMovement.referenceId,
        reversalOfMovementId: recordedMovement.reversalOfMovementId
      }
    });

    return recordedMovement;
  }

  /**
   * Reverses an erroneous stock movement by generating a compensating correction movement.
   * Preserves immutable historical records.
   */
  async reverseStockMovement(
    restaurantId: string,
    movementId: string,
    reason?: string,
    clientRequestId?: string
  ): Promise<StockMovement> {
    const cleanRestId = restaurantId?.trim();
    const cleanMovementId = movementId?.trim();
    if (!cleanRestId || !cleanMovementId) {
      throw new Error('restaurantId and movementId are required to reverse a stock movement');
    }

    await enforcePermission(cleanRestId, 'manage_inventory');

    const snap = await getDoc(doc(db, stockMovementDocPath(cleanRestId, cleanMovementId)));
    if (!snap.exists()) {
      throw new Error(`Stock movement "${cleanMovementId}" not found`);
    }
    const mov = snap.data() as StockMovement;

    return await this.recordStockMovement(cleanRestId, {
      inventoryItemId: mov.inventoryItemId,
      type: 'correction',
      quantity: mov.quantity,
      unit: mov.unit,
      reversalOfMovementId: cleanMovementId,
      reason: reason?.trim() || `Reversal of movement ${cleanMovementId}`,
      clientRequestId
    });
  }

  /**
   * Retrieves read-only stock movement history, ordered chronologically descending.
   */
  async listStockMovements(
    restaurantId: string,
    inventoryItemId?: string,
    limitCount: number = 50
  ): Promise<StockMovement[]> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return [];

    await enforcePermission(cleanRestId, 'view_inventory');

    const colRef = collection(db, stockMovementsPath(cleanRestId));
    let q = query(colRef, orderBy('createdAt', 'desc'), limit(limitCount));

    if (inventoryItemId?.trim()) {
      q = query(
        colRef,
        where('inventoryItemId', '==', inventoryItemId.trim()),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
    }

    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data() as StockMovement;
      const delta =
        typeof data.delta === 'number'
          ? data.delta
          : data.type === 'stock_out' || data.type === 'wastage' || data.type === 'damage'
            ? -data.quantity
            : data.quantity;

      return {
        ...data,
        id: d.id,
        movementId: d.id,
        delta
      };
    });
  }

  /**
   * Queries the stock ledger with multi-parameter filtering, date ranges, and bounded limits.
   */
  async queryStockLedger(
    restaurantId: string,
    options?: StockLedgerQueryOptions
  ): Promise<{ movements: StockMovement[]; hasMore: boolean }> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return { movements: [], hasMore: false };

    await enforcePermission(cleanRestId, 'view_inventory');

    const colRef = collection(db, stockMovementsPath(cleanRestId));
    const limitCount = Math.min(Math.max(options?.limit || 50, 1), 100);

    let q = query(colRef, orderBy('createdAt', 'desc'), limit(limitCount + 1));

    if (options?.inventoryItemId?.trim()) {
      q = query(
        colRef,
        where('inventoryItemId', '==', options.inventoryItemId.trim()),
        orderBy('createdAt', 'desc'),
        limit(limitCount + 1)
      );
    }

    const snap = await getDocs(q);
    let docs: StockMovement[] = snap.docs.map(d => {
      const data = d.data() as StockMovement;
      const delta =
        typeof data.delta === 'number'
          ? data.delta
          : data.type === 'stock_out' || data.type === 'wastage' || data.type === 'damage'
            ? -data.quantity
            : data.quantity;

      return {
        ...data,
        id: d.id,
        movementId: d.id,
        delta
      };
    });

    // In-memory filters for flexible querying without compound index explosion
    if (options?.types && options.types.length > 0) {
      docs = docs.filter(m => options.types!.includes(m.type));
    } else if (options?.type) {
      docs = docs.filter(m => m.type === options.type);
    }

    if (options?.actorUid?.trim()) {
      docs = docs.filter(m => m.actorUid === options.actorUid?.trim());
    }

    if (options?.startDate) {
      const start = new Date(options.startDate).getTime();
      docs = docs.filter(m => {
        const t = m.createdAt?.toDate ? m.createdAt.toDate().getTime() : (m.createdAt ? new Date(m.createdAt).getTime() : 0);
        return t >= start;
      });
    }

    if (options?.endDate) {
      const end = new Date(options.endDate).getTime();
      docs = docs.filter(m => {
        const t = m.createdAt?.toDate ? m.createdAt.toDate().getTime() : (m.createdAt ? new Date(m.createdAt).getTime() : 0);
        return t <= end;
      });
    }

    if (options?.searchTerm?.trim()) {
      const term = options.searchTerm.trim().toLowerCase();
      docs = docs.filter(
        m =>
          (m.reason && m.reason.toLowerCase().includes(term)) ||
          (m.note && m.note.toLowerCase().includes(term)) ||
          m.id.toLowerCase().includes(term)
      );
    }

    const hasMore = docs.length > limitCount;
    const movements = hasMore ? docs.slice(0, limitCount) : docs;

    return { movements, hasMore };
  }

  /**
   * Reconciles stock for an inventory item against the authoritative ledger history.
   * Invariant: Opening balance + sum(positive deltas) - sum(negative deltas) == current balance.
   */
  async reconcileStockForItem(
    restaurantId: string,
    itemId: string
  ): Promise<StockReconciliationSummary> {
    const cleanRestId = restaurantId?.trim();
    const cleanItemId = itemId?.trim();
    if (!cleanRestId || !cleanItemId) {
      throw new Error('restaurantId and itemId are required for stock reconciliation');
    }

    await enforcePermission(cleanRestId, 'view_inventory');

    const item = await this.getInventoryItem(cleanRestId, cleanItemId);
    if (!item) {
      throw new Error('Inventory item does not exist');
    }

    // Retrieve ledger history (bounded to last 500 entries)
    const movements = await this.listStockMovements(cleanRestId, cleanItemId, 500);

    let openingQuantity = 0;
    let totalInflow = 0;
    let totalOutflow = 0;

    // Process movements chronologically ascending
    const chronological = [...movements].reverse();

    for (const m of chronological) {
      const d =
        typeof m.delta === 'number'
          ? m.delta
          : m.type === 'stock_out' || m.type === 'wastage' || m.type === 'damage'
            ? -m.quantity
            : m.quantity;

      if (m.type === 'opening') {
        openingQuantity = roundQuantity(openingQuantity + m.quantity);
      } else if (d > 0) {
        totalInflow = roundQuantity(totalInflow + d);
      } else if (d < 0) {
        totalOutflow = roundQuantity(totalOutflow + Math.abs(d));
      }
    }

    const netChange = roundQuantity(totalInflow - totalOutflow);
    const calculatedQuantity = roundQuantity(openingQuantity + netChange);
    const currentQuantity = roundQuantity(item.currentQuantity);
    const discrepancy = roundQuantity(currentQuantity - calculatedQuantity);
    const isReconciled = Math.abs(discrepancy) < 0.001;

    return {
      inventoryItemId: cleanItemId,
      itemName: item.name,
      unit: item.unit,
      openingQuantity,
      totalInflow,
      totalOutflow,
      netChange,
      calculatedQuantity,
      currentQuantity,
      isReconciled,
      discrepancy,
      movementsCount: movements.length
    };
  }

  /**
   * Realtime reactive subscription to restaurant inventory items.
   * Returns an unsubscribe function.
   */
  subscribeToInventoryItems(
    restaurantId: string,
    onUpdate: (items: InventoryItem[]) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      return () => {};
    }

    const colRef = collection(db, inventoryItemsPath(cleanRestId));
    const q = query(colRef);

    return onSnapshot(
      q,
      snapshot => {
        const items = snapshot.docs.map(d => ({ ...(d.data() as InventoryItem), id: d.id }));
        items.sort((a, b) => a.name.localeCompare(b.name));
        onUpdate(items);
      },
      error => {
        if (onError) onError(error);
      }
    );
  }
}

export const inventoryService = new InventoryService();

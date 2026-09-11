import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  runTransaction,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderItem,
  CreatePurchaseOrderDTO,
  ReceiveGoodsDTO,
  PurchaseReceiving,
  PurchaseReceivingItemLog,
  PurchaseOrderQueryOptions,
  SupplierSnapshot
} from '../types/purchaseOrder';
import { InventoryItem, StockMovement } from '../types/inventory';
import {
  purchaseOrdersPath,
  purchaseOrderDocPath,
  purchaseReceivingsPath,
  purchaseReceivingDocPath,
  inventoryItemsPath,
  inventoryItemDocPath,
  stockMovementsPath,
  stockMovementDocPath,
  supplierDocPath
} from '../utils/paths';
import {
  isValidPurchaseStatusTransition,
  calculatePurchaseLineTotal,
  calculatePurchaseOrderTotals
} from '../utils/supplierUtils';
import { roundQuantity, areUnitsCompatible, convertQuantity } from '../utils/units';
import { enforcePermission } from '../utils/permissions';
import { auditService } from './auditService';
import { IdempotencyService } from './idempotencyService';

export class PurchaseOrderService {
  private idempotency = new IdempotencyService();

  /**
   * Generates a human-friendly unique Purchase Order Number:
   * Format: PO-YYYYMMDD-XXXX
   */
  private generateOrderNumber(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PO-${yyyy}${mm}${dd}-${rand}`;
  }

  /**
   * Creates a new Purchase Order in 'draft' status.
   * Enforces supplier validation, inventory item snapshots, integer minor money calculation,
   * idempotency, and audit logging.
   */
  async createPurchaseOrder(
    restaurantId: string,
    data: CreatePurchaseOrderDTO,
    clientRequestId?: string
  ): Promise<PurchaseOrder> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      throw new Error('restaurantId is required to create purchase order');
    }

    await enforcePermission(cleanRestId, 'manage_purchases');

    if (!data.supplierId?.trim()) {
      throw new Error('supplierId is required');
    }

    if (!data.items || data.items.length === 0) {
      throw new Error('Purchase order must contain at least one item');
    }

    // Idempotency check
    if (clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<PurchaseOrder>(
        cleanRestId,
        clientRequestId.trim(),
        'create_purchase_order',
        { ...data, restaurantId: cleanRestId }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    // Verify supplier exists and is active
    const supplierSnap = await getDoc(
      doc(db, supplierDocPath(cleanRestId, data.supplierId.trim()))
    );
    if (!supplierSnap.exists()) {
      throw new Error('Selected supplier does not exist');
    }
    const supplierData = supplierSnap.data() as any;
    if (supplierData.restaurantId !== cleanRestId) {
      throw new Error('Cross-tenant supplier access rejected');
    }
    if (!supplierData.active) {
      throw new Error('Cannot create purchase order for an inactive supplier');
    }

    const supplierSnapshot: SupplierSnapshot = {
      supplierId: supplierData.supplierId,
      name: supplierData.name,
      phone: supplierData.phone,
      email: supplierData.email || undefined,
      contactPerson: supplierData.contactPerson || undefined,
      gstNumber: supplierData.gstNumber || undefined
    };

    // Validate each item and build snapshots
    const poItems: PurchaseOrderItem[] = [];
    for (let i = 0; i < data.items.length; i++) {
      const itemDTO = data.items[i];
      if (!itemDTO.inventoryItemId?.trim()) {
        throw new Error(`Item at position ${i + 1} is missing inventoryItemId`);
      }

      const qty = roundQuantity(itemDTO.quantityOrdered);
      if (qty <= 0) {
        throw new Error(`Item at position ${i + 1} ordered quantity must be > 0`);
      }

      // Read inventory item
      const itemRef = doc(db, inventoryItemDocPath(cleanRestId, itemDTO.inventoryItemId.trim()));
      const itemSnap = await getDoc(itemRef);
      if (!itemSnap.exists()) {
        throw new Error(`Inventory item ${itemDTO.inventoryItemId} does not exist`);
      }
      const invItem = itemSnap.data() as InventoryItem;
      if (invItem.restaurantId !== cleanRestId) {
        throw new Error('Cross-tenant inventory access rejected');
      }
      if (!invItem.active) {
        throw new Error(`Inventory item "${invItem.name}" is inactive`);
      }

      // Verify unit compatibility
      if (!areUnitsCompatible(itemDTO.unit, invItem.unit)) {
        throw new Error(
          `Incompatible units for "${invItem.name}": PO unit ${itemDTO.unit} cannot be converted to inventory base unit ${invItem.unit}`
        );
      }

      const lineTotalMinor = calculatePurchaseLineTotal(qty, itemDTO.unitPriceMinor);

      poItems.push({
        id: `poi_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        inventoryItemId: invItem.id,
        itemNameSnapshot: invItem.name,
        skuSnapshot: invItem.sku || undefined,
        quantityOrdered: qty,
        unit: itemDTO.unit,
        unitPriceMinor: itemDTO.unitPriceMinor,
        lineTotalMinor,
        receivedQuantity: 0,
        remainingQuantity: qty
      });
    }

    // Compute totals in integer minor units
    const { subtotalMinor, taxMinor, grandTotalMinor } = calculatePurchaseOrderTotals(
      poItems,
      data.taxRatePercent || 0
    );

    const poCol = collection(db, purchaseOrdersPath(cleanRestId));
    const purchaseOrderId = doc(poCol).id;
    const poRef = doc(db, purchaseOrderDocPath(cleanRestId, purchaseOrderId));
    const actorUid = auth.currentUser?.uid || 'system';
    const orderNumber = this.generateOrderNumber();
    const orderDate = data.orderDate || new Date().toISOString().split('T')[0];

    const newPO: PurchaseOrder = {
      purchaseOrderId,
      orderNumber,
      restaurantId: cleanRestId,
      supplierId: supplierData.supplierId,
      supplierSnapshot,
      status: 'draft',
      orderDate,
      expectedDate: data.expectedDate || undefined,
      items: poItems,
      notes: data.notes?.trim() || undefined,
      subtotalMinor,
      taxMinor,
      grandTotalMinor,
      currency: 'INR',
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
      clientRequestId: clientRequestId?.trim() || undefined
    };

    await setDoc(poRef, newPO);

    if (clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        clientRequestId.trim(),
        'create_purchase_order',
        { ...data, restaurantId: cleanRestId },
        purchaseOrderId,
        newPO
      );
    }

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'purchase_order',
      entityId: purchaseOrderId,
      action: 'purchase_order_created',
      actorUid,
      metadata: {
        orderNumber,
        supplierName: supplierSnapshot.name,
        itemCount: poItems.length,
        grandTotalMinor
      }
    });

    return newPO;
  }

  /**
   * Submits a Purchase Order ('draft' -> 'submitted').
   */
  async submitPurchaseOrder(
    restaurantId: string,
    purchaseOrderId: string,
    clientRequestId?: string
  ): Promise<PurchaseOrder> {
    const cleanRestId = restaurantId?.trim();
    const cleanPoId = purchaseOrderId?.trim();
    if (!cleanRestId || !cleanPoId) {
      throw new Error('restaurantId and purchaseOrderId are required');
    }

    await enforcePermission(cleanRestId, 'manage_purchases');

    if (clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<PurchaseOrder>(
        cleanRestId,
        clientRequestId.trim(),
        'submit_purchase_order',
        { purchaseOrderId: cleanPoId, restaurantId: cleanRestId }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    const poRef = doc(db, purchaseOrderDocPath(cleanRestId, cleanPoId));
    const poSnap = await getDoc(poRef);
    if (!poSnap.exists()) {
      throw new Error('Purchase order not found');
    }

    const po = poSnap.data() as PurchaseOrder;
    if (po.restaurantId !== cleanRestId) {
      throw new Error('Cross-tenant purchase order access rejected');
    }

    if (po.status === 'submitted') {
      return po; // Idempotent return
    }

    if (!isValidPurchaseStatusTransition(po.status, 'submitted')) {
      throw new Error(`Cannot submit purchase order in '${po.status}' status`);
    }

    const actorUid = auth.currentUser?.uid || 'system';
    const updates = {
      status: 'submitted' as PurchaseOrderStatus,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid
    };

    await updateDoc(poRef, updates);

    const updatedPO: PurchaseOrder = {
      ...po,
      ...updates
    };

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'purchase_order',
      entityId: cleanPoId,
      action: 'purchase_order_submitted',
      actorUid,
      metadata: {
        orderNumber: po.orderNumber,
        supplierName: po.supplierSnapshot.name
      }
    });

    if (clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        clientRequestId.trim(),
        'submit_purchase_order',
        { purchaseOrderId: cleanPoId, restaurantId: cleanRestId },
        cleanPoId,
        updatedPO
      );
    }

    return updatedPO;
  }

  /**
   * Cancels a Purchase Order ('draft' or 'submitted' -> 'cancelled').
   * Rejects cancellation if any goods have already been received.
   */
  async cancelPurchaseOrder(
    restaurantId: string,
    purchaseOrderId: string,
    reason?: string,
    clientRequestId?: string
  ): Promise<PurchaseOrder> {
    const cleanRestId = restaurantId?.trim();
    const cleanPoId = purchaseOrderId?.trim();
    if (!cleanRestId || !cleanPoId) {
      throw new Error('restaurantId and purchaseOrderId are required');
    }

    await enforcePermission(cleanRestId, 'manage_purchases');

    if (clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<PurchaseOrder>(
        cleanRestId,
        clientRequestId.trim(),
        'cancel_purchase_order',
        { purchaseOrderId: cleanPoId, restaurantId: cleanRestId, reason }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    const poRef = doc(db, purchaseOrderDocPath(cleanRestId, cleanPoId));
    const poSnap = await getDoc(poRef);
    if (!poSnap.exists()) {
      throw new Error('Purchase order not found');
    }

    const po = poSnap.data() as PurchaseOrder;
    if (po.restaurantId !== cleanRestId) {
      throw new Error('Cross-tenant purchase order access rejected');
    }

    if (po.status === 'cancelled') {
      return po; // already cancelled
    }

    if (po.status === 'received' || po.status === 'partiallyReceived') {
      throw new Error(
        `Cannot cancel purchase order with received goods (current status: '${po.status}')`
      );
    }

    const hasReceivedItems = po.items.some(it => (it.receivedQuantity || 0) > 0);
    if (hasReceivedItems) {
      throw new Error('Cannot cancel purchase order because some items have already been received');
    }

    if (!isValidPurchaseStatusTransition(po.status, 'cancelled')) {
      throw new Error(`Cannot cancel purchase order in '${po.status}' status`);
    }

    const actorUid = auth.currentUser?.uid || 'system';
    const updates = {
      status: 'cancelled' as PurchaseOrderStatus,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
      notes: reason ? `${po.notes ? po.notes + ' | ' : ''}Cancelled: ${reason}` : po.notes
    };

    await updateDoc(poRef, updates);

    const updatedPO: PurchaseOrder = {
      ...po,
      ...updates
    };

    if (clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        clientRequestId.trim(),
        'cancel_purchase_order',
        { purchaseOrderId: cleanPoId, reason, restaurantId: cleanRestId },
        cleanPoId,
        updatedPO
      );
    }

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'purchase_order',
      entityId: cleanPoId,
      action: 'purchase_order_cancelled',
      actorUid,
      metadata: {
        orderNumber: po.orderNumber,
        reason: reason?.trim() || 'Manual cancellation'
      }
    });

    return updatedPO;
  }

  /**
   * Atomically receives goods for a purchase order.
   *
   * Required conceptual transaction:
   * 1. Authenticate & Authorize ('receive_purchases')
   * 2. Read purchase order
   * 3. Validate status ('submitted' or 'partiallyReceived')
   * 4. Read inventory items
   * 5. Validate receiving quantities (quantity > 0, <= remainingQuantity)
   * 6. Calculate delta and unit conversion
   * 7. Update inventory quantities
   * 8. Create stock movement records (type: 'stock_in', referenceType: 'purchase_receiving')
   * 9. Update purchase order item received/remaining quantities
   * 10. Update purchase order status ('partiallyReceived' or 'received')
   * 11. Create purchase receiving record
   * 12. Commit atomically
   */
  async receiveGoods(
    restaurantId: string,
    data: ReceiveGoodsDTO,
    clientRequestId?: string
  ): Promise<{ purchaseOrder: PurchaseOrder; receiving: PurchaseReceiving }> {
    const cleanRestId = restaurantId?.trim();
    const cleanPoId = data.purchaseOrderId?.trim();
    if (!cleanRestId || !cleanPoId) {
      throw new Error('restaurantId and purchaseOrderId are required');
    }

    await enforcePermission(cleanRestId, 'receive_purchases');

    if (!data.items || data.items.length === 0) {
      throw new Error('Receiving payload must contain at least one item');
    }

    // Filter out items with 0 quantity if any, but ensure at least one positive receiving item
    const validReceivingItems = data.items.filter(
      it => roundQuantity(it.quantityReceived) > 0
    );
    if (validReceivingItems.length === 0) {
      throw new Error('No items with quantity > 0 to receive');
    }

    // Idempotency check
    if (clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<{
        purchaseOrder: PurchaseOrder;
        receiving: PurchaseReceiving;
      }>(
        cleanRestId,
        clientRequestId.trim(),
        'receive_purchase_order',
        { ...data, restaurantId: cleanRestId }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    const actorUid = auth.currentUser?.uid || 'system';

    const result = await runTransaction(db, async transaction => {
      // 1. READ PO
      const poRef = doc(db, purchaseOrderDocPath(cleanRestId, cleanPoId));
      const poSnap = await transaction.get(poRef);
      if (!poSnap.exists()) {
        throw new Error('Purchase order does not exist');
      }

      const po = poSnap.data() as PurchaseOrder;
      if (po.restaurantId !== cleanRestId) {
        throw new Error('Cross-tenant purchase order access rejected');
      }

      if (po.status !== 'submitted' && po.status !== 'partiallyReceived') {
        throw new Error(
          `Cannot receive goods on purchase order with status '${po.status}'. Expected 'submitted' or 'partiallyReceived'.`
        );
      }

      // 2. Map PO items by id
      const poItemMap = new Map<string, PurchaseOrderItem>();
      po.items.forEach(it => poItemMap.set(it.id, { ...it }));

      // 3. READ ALL REFERENCED INVENTORY ITEMS FIRST (Firestore transaction requirement)
      const invItemRefs = new Map<string, any>();
      const invItemSnaps = new Map<string, InventoryItem>();

      for (const recItem of validReceivingItems) {
        const targetPoItem = poItemMap.get(recItem.purchaseOrderItemId);
        if (!targetPoItem) {
          throw new Error(
            `Purchase order item ${recItem.purchaseOrderItemId} does not exist in this purchase order`
          );
        }

        const invId = targetPoItem.inventoryItemId;
        if (!invItemRefs.has(invId)) {
          const ref = doc(db, inventoryItemDocPath(cleanRestId, invId));
          invItemRefs.set(invId, ref);
          const snap = await transaction.get(ref);
          if (!snap.exists()) {
            throw new Error(`Inventory item ${invId} does not exist`);
          }
          const invData = snap.data() as InventoryItem;
          if (invData.restaurantId !== cleanRestId) {
            throw new Error('Cross-tenant inventory access rejected');
          }
          if (!invData.active) {
            throw new Error(`Inventory item "${invData.name}" is inactive`);
          }
          invItemSnaps.set(invId, invData);
        }
      }

      // 4. VALIDATE RECEIVING QUANTITIES & PREPARE MUTATIONS
      const receivingId = doc(collection(db, purchaseReceivingsPath(cleanRestId))).id;
      const receivingLogs: PurchaseReceivingItemLog[] = [];
      const stockMovementWrites: StockMovement[] = [];
      const inventoryUpdates: { ref: any; newQty: number }[] = [];

      for (const recItem of validReceivingItems) {
        const poItem = poItemMap.get(recItem.purchaseOrderItemId)!;
        const invItem = invItemSnaps.get(poItem.inventoryItemId)!;
        const invRef = invItemRefs.get(poItem.inventoryItemId)!;

        const qtyReceived = roundQuantity(recItem.quantityReceived);
        if (qtyReceived <= 0) {
          throw new Error('Received quantity must be greater than 0');
        }

        // Strict over-receiving prevention
        if (qtyReceived > poItem.remainingQuantity) {
          throw new Error(
            `Cannot receive ${qtyReceived} ${poItem.unit} for "${poItem.itemNameSnapshot}". Remaining ordered quantity is only ${poItem.remainingQuantity} ${poItem.unit}. Over-receiving rejected.`
          );
        }

        // Unit conversion to inventory base unit
        const convertedQty = roundQuantity(
          convertQuantity(qtyReceived, poItem.unit, invItem.unit)
        );

        const prevQty = roundQuantity(invItem.currentQuantity);
        const resultingQty = roundQuantity(prevQty + convertedQty);

        // Update inventory tracking snapshot for possible multi-line receives of same inventory item
        invItem.currentQuantity = resultingQty;

        const stockMovementId = doc(collection(db, stockMovementsPath(cleanRestId))).id;
        const movementDoc: StockMovement = {
          id: stockMovementId,
          restaurantId: cleanRestId,
          inventoryItemId: invItem.id,
          type: 'stock_in',
          quantity: convertedQty,
          unit: invItem.unit,
          delta: convertedQty,
          previousQuantity: prevQty,
          resultingQuantity: resultingQty,
          reason: `Purchase Order Receiving (${po.orderNumber})`,
          note: data.notes?.trim() || null,
          actorUid,
          clientRequestId: clientRequestId?.trim() || null,
          referenceType: 'purchase_receiving',
          referenceId: receivingId,
          reversalOfMovementId: null,
          reversedByMovementId: null,
          createdAt: serverTimestamp()
        };

        stockMovementWrites.push(movementDoc);

        inventoryUpdates.push({
          ref: invRef,
          newQty: resultingQty
        });

        // Update poItem counters
        poItem.receivedQuantity = roundQuantity((poItem.receivedQuantity || 0) + qtyReceived);
        poItem.remainingQuantity = roundQuantity((poItem.quantityOrdered || 0) - poItem.receivedQuantity);

        receivingLogs.push({
          purchaseOrderItemId: poItem.id,
          inventoryItemId: invItem.id,
          itemNameSnapshot: poItem.itemNameSnapshot,
          quantityReceived: qtyReceived,
          unit: poItem.unit,
          convertedQuantity: convertedQty,
          baseUnit: invItem.unit,
          stockMovementId
        });
      }

      // 5. DETERMINE NEW PO STATUS
      const updatedPoItems = Array.from(poItemMap.values());
      const allFullyReceived = updatedPoItems.every(it => it.remainingQuantity <= 0);
      const newPoStatus: PurchaseOrderStatus = allFullyReceived
        ? 'received'
        : 'partiallyReceived';

      // 6. EXECUTE WRITES ATOMICALLY
      // (a) Update inventory items
      for (const invUpd of inventoryUpdates) {
        transaction.update(invUpd.ref, {
          currentQuantity: invUpd.newQty,
          updatedAt: serverTimestamp()
        });
      }

      // (b) Write stock movements
      for (const sm of stockMovementWrites) {
        const smRef = doc(db, stockMovementDocPath(cleanRestId, sm.id));
        transaction.set(smRef, sm);
      }

      // (c) Write purchase receiving log
      const receivingDocRef = doc(db, purchaseReceivingDocPath(cleanRestId, receivingId));
      const receivingRecord: PurchaseReceiving = {
        receivingId,
        restaurantId: cleanRestId,
        purchaseOrderId: cleanPoId,
        orderNumber: po.orderNumber,
        supplierId: po.supplierId,
        supplierName: po.supplierSnapshot.name,
        items: receivingLogs,
        notes: data.notes?.trim() || undefined,
        actorUid,
        clientRequestId: clientRequestId?.trim() || undefined,
        createdAt: serverTimestamp()
      };
      transaction.set(receivingDocRef, receivingRecord);

      // (d) Update purchase order
      const poUpdateData = {
        status: newPoStatus,
        items: updatedPoItems,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid
      };
      transaction.update(poRef, poUpdateData);

      const finalPO: PurchaseOrder = {
        ...po,
        ...poUpdateData
      };

      return {
        purchaseOrder: finalPO,
        receiving: receivingRecord
      };
    });

    // Mark idempotency complete
    if (clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        clientRequestId.trim(),
        'receive_purchase_order',
        { ...data, restaurantId: cleanRestId },
        result.receiving.receivingId,
        result
      );
    }

    // Audit logs outside transaction
    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'purchase_receiving',
      entityId: result.receiving.receivingId,
      action: 'purchase_receiving_created',
      actorUid,
      metadata: {
        orderNumber: result.purchaseOrder.orderNumber,
        supplierName: result.receiving.supplierName,
        itemsReceivedCount: result.receiving.items.length,
        newPoStatus: result.purchaseOrder.status
      }
    });

    if (result.purchaseOrder.status === 'received') {
      await auditService.logEvent(cleanRestId, {
        restaurantId: cleanRestId,
        entityType: 'purchase_order',
        entityId: cleanPoId,
        action: 'purchase_received',
        actorUid,
        metadata: {
          orderNumber: result.purchaseOrder.orderNumber
        }
      });
    } else {
      await auditService.logEvent(cleanRestId, {
        restaurantId: cleanRestId,
        entityType: 'purchase_order',
        entityId: cleanPoId,
        action: 'purchase_partially_received',
        actorUid,
        metadata: {
          orderNumber: result.purchaseOrder.orderNumber
        }
      });
    }

    return result;
  }

  /**
   * Fetches a Purchase Order by ID.
   */
  async getPurchaseOrder(
    restaurantId: string,
    purchaseOrderId: string
  ): Promise<PurchaseOrder | null> {
    const cleanRestId = restaurantId?.trim();
    const cleanPoId = purchaseOrderId?.trim();
    if (!cleanRestId || !cleanPoId) return null;

    await enforcePermission(cleanRestId, 'access_purchases');

    const poRef = doc(db, purchaseOrderDocPath(cleanRestId, cleanPoId));
    const snap = await getDoc(poRef);
    if (!snap.exists()) return null;

    const data = snap.data() as PurchaseOrder;
    if (data.restaurantId !== cleanRestId) {
      throw new Error('Cross-tenant purchase order access rejected');
    }
    return data;
  }

  /**
   * Queries purchase orders with optional status, supplier, date, and search filters.
   */
  async getPurchaseOrders(
    restaurantId: string,
    options?: PurchaseOrderQueryOptions
  ): Promise<PurchaseOrder[]> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return [];

    await enforcePermission(cleanRestId, 'access_purchases');

    let q = query(collection(db, purchaseOrdersPath(cleanRestId)));

    if (options?.status) {
      q = query(q, where('status', '==', options.status));
    }
    if (options?.supplierId) {
      q = query(q, where('supplierId', '==', options.supplierId));
    }

    const snap = await getDocs(q);
    let orders: PurchaseOrder[] = [];
    snap.forEach(docSnap => {
      const po = docSnap.data() as PurchaseOrder;
      if (po.restaurantId === cleanRestId) {
        orders.push(po);
      }
    });

    if (options?.startDate) {
      orders = orders.filter(po => po.orderDate >= options.startDate!);
    }
    if (options?.endDate) {
      orders = orders.filter(po => po.orderDate <= options.endDate!);
    }

    if (options?.search?.trim()) {
      const term = options.search.trim().toLowerCase();
      orders = orders.filter(
        po =>
          po.orderNumber.toLowerCase().includes(term) ||
          po.supplierSnapshot.name.toLowerCase().includes(term) ||
          po.items.some(it => it.itemNameSnapshot.toLowerCase().includes(term))
      );
    }

    // Sort descending by orderDate/orderNumber
    return orders.sort((a, b) => b.orderNumber.localeCompare(a.orderNumber));
  }

  /**
   * Fetches receiving history for a purchase order.
   */
  async getReceivingHistory(
    restaurantId: string,
    purchaseOrderId: string
  ): Promise<PurchaseReceiving[]> {
    const cleanRestId = restaurantId?.trim();
    const cleanPoId = purchaseOrderId?.trim();
    if (!cleanRestId || !cleanPoId) return [];

    await enforcePermission(cleanRestId, 'access_purchases');

    const q = query(
      collection(db, purchaseReceivingsPath(cleanRestId)),
      where('purchaseOrderId', '==', cleanPoId)
    );

    const snap = await getDocs(q);
    const receivings: PurchaseReceiving[] = [];
    snap.forEach(docSnap => {
      const r = docSnap.data() as PurchaseReceiving;
      if (r.restaurantId === cleanRestId) {
        receivings.push(r);
      }
    });

    return receivings;
  }

  /**
   * Realtime subscription to purchase orders.
   */
  listenToPurchaseOrders(
    restaurantId: string,
    onUpdate: (orders: PurchaseOrder[]) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return () => {};

    const q = query(collection(db, purchaseOrdersPath(cleanRestId)));

    return onSnapshot(
      q,
      snap => {
        const orders: PurchaseOrder[] = [];
        snap.forEach(docSnap => {
          const po = docSnap.data() as PurchaseOrder;
          if (po.restaurantId === cleanRestId) {
            orders.push(po);
          }
        });
        orders.sort((a, b) => b.orderNumber.localeCompare(a.orderNumber));
        onUpdate(orders);
      },
      err => {
        console.error('listenToPurchaseOrders snapshot error:', err);
        if (onError) onError(err);
      }
    );
  }
}

export const purchaseOrderService = new PurchaseOrderService();

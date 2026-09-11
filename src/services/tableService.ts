import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { Table, TableFormData } from '../types/table';
import { ITableService } from './transactionInterfaces';
import { validateTable } from '../utils/transactionValidation';
import { tablesPath, tableDocPath } from '../utils/paths';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { auditService } from './auditService';

/**
 * Deterministically sorts tables:
 * 1. sortOrder ascending (treat undefined / null as 0)
 * 2. tableNumber ascending (numeric-aware natural sort)
 */
export function sortTables(tables: Table[]): Table[] {
  return [...tables].sort((a, b) => {
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const numA = (a.tableNumber || '').trim();
    const numB = (b.tableNumber || '').trim();
    return numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * TableService
 * 
 * Provides centralized physical Table CRUD operations.
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Multi-Tenant Restaurant Isolation: Every query and mutation is strictly scoped
 *    to `restaurants/{restaurantId}/tables/{tableId}`.
 * 2. Identity Decoupling: auth.uid is never assumed to be equal to restaurantId.
 * 3. Centralized Validation: All inputs are validated with validateTable before persistence.
 * 4. Deterministic Sort Order: Tables are ordered by sortOrder ascending, then tableNumber ascending.
 * 5. Safe Deactivation Policy: Physical tables can be deactivated (`isActive = false`) to preserve historical sessions.
 */
export class TableService implements ITableService {
  /**
   * Retrieves all physical tables for a given restaurant, sorted deterministically.
   */
  async getTables(restaurantId: string): Promise<Table[]> {
    const path = tablesPath(restaurantId);
    try {
      const colRef = collection(db, 'restaurants', restaurantId.trim(), 'tables');
      const q = query(colRef);
      const snapshot = await getDocs(q);
      const tables: Table[] = [];
      snapshot.forEach((d) => {
        tables.push({ id: d.id, ...d.data() } as Table);
      });
      return sortTables(tables);
    } catch (err: unknown) {
      const errCode = (err as any)?.code;
      if (errCode === 'permission-denied' || errCode === 'unavailable' || errCode === 'failed-precondition') {
        console.warn('[RestaurantOS] Tables subcollection restricted or indexing pending. Operating with local empty state.');
        return [];
      }
      throw handleFirestoreError(err, OperationType.LIST, path);
    }
  }

  /**
   * Retrieves a specific table by its table ID within a restaurant.
   */
  async getTableById(restaurantId: string, tableId: string): Promise<Table | null> {
    const path = tableDocPath(restaurantId, tableId);
    try {
      const docRef = doc(db, 'restaurants', restaurantId.trim(), 'tables', tableId.trim());
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return null;
      }
      return { id: snap.id, ...snap.data() } as Table;
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.GET, path);
    }
  }

  /**
   * Creates a new physical Table in the restaurant.
   */
  async createTable(restaurantId: string, data: TableFormData, createdBy: string): Promise<Table> {
    const path = tablesPath(restaurantId);
    
    // Domain validation
    const validation = validateTable(data);
    if (!validation.isValid) {
      throw new Error(`Table validation failed: ${validation.error}`);
    }

    try {
      const colRef = collection(db, 'restaurants', restaurantId.trim(), 'tables');
      const newDocRef = doc(colRef);
      const now = new Date();

      const tableData: Omit<Table, 'id'> = {
        restaurantId: restaurantId.trim(),
        name: data.name.trim(),
        tableNumber: data.tableNumber.trim(),
        floorOrArea: (data.floorOrArea || '').trim(),
        capacity: data.capacity,
        isActive: data.isActive !== undefined ? data.isActive : true,
        sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
        createdBy: createdBy || auth.currentUser?.uid || null,
        updatedBy: createdBy || auth.currentUser?.uid || null,
        createdAt: serverTimestamp() || now,
        updatedAt: serverTimestamp() || now
      };

      await setDoc(newDocRef, tableData);

      await auditService.logEvent(restaurantId.trim(), {
        restaurantId: restaurantId.trim(),
        entityType: 'table',
        entityId: newDocRef.id,
        action: 'table_created',
        actorUid: createdBy || auth.currentUser?.uid || 'system',
        metadata: {
          name: data.name.trim(),
          tableNumber: data.tableNumber.trim(),
          capacity: data.capacity
        }
      });

      return {
        id: newDocRef.id,
        ...tableData,
        createdAt: now,
        updatedAt: now
      };
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.CREATE, path);
    }
  }

  /**
   * Updates an existing physical table.
   */
  async updateTable(
    restaurantId: string,
    tableId: string,
    data: Partial<TableFormData>,
    updatedBy: string
  ): Promise<void> {
    const path = tableDocPath(restaurantId, tableId);

    // Validate partial data fields if supplied
    const validation = validateTable(data);
    // When updating partial data, only throw if explicitly present fields failed validation
    if (!validation.isValid && validation.errors) {
      const errorKeys = Object.keys(validation.errors);
      const relevantErrors = errorKeys.filter((k) => (data as Record<string, unknown>)[k] !== undefined);
      if (relevantErrors.length > 0) {
        throw new Error(`Table validation failed: ${validation.errors[relevantErrors[0]]}`);
      }
    }

    try {
      const docRef = doc(db, 'restaurants', restaurantId.trim(), 'tables', tableId.trim());
      const updatePayload: Record<string, unknown> = {
        updatedAt: serverTimestamp() || new Date(),
        updatedBy: updatedBy || auth.currentUser?.uid || null
      };

      if (data.name !== undefined) updatePayload.name = data.name.trim();
      if (data.tableNumber !== undefined) updatePayload.tableNumber = data.tableNumber.trim();
      if (data.floorOrArea !== undefined) updatePayload.floorOrArea = data.floorOrArea.trim();
      if (data.capacity !== undefined) updatePayload.capacity = data.capacity;
      if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
      if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;

      await updateDoc(docRef, updatePayload);

      await auditService.logEvent(restaurantId.trim(), {
        restaurantId: restaurantId.trim(),
        entityType: 'table',
        entityId: tableId.trim(),
        action: 'table_updated',
        actorUid: updatedBy || auth.currentUser?.uid || 'system',
        metadata: {
          updatedFields: Object.keys(data)
        }
      });
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  /**
   * Soft deactivation or hard delete of a table.
   * Note: Soft deactivation (`isActive = false`) is preferred in production to preserve historical table session links.
   */
  async deleteTable(restaurantId: string, tableId: string): Promise<void> {
    const path = tableDocPath(restaurantId, tableId);
    try {
      const docRef = doc(db, 'restaurants', restaurantId.trim(), 'tables', tableId.trim());
      await deleteDoc(docRef);

      await auditService.logEvent(restaurantId.trim(), {
        restaurantId: restaurantId.trim(),
        entityType: 'table',
        entityId: tableId.trim(),
        action: 'table_deleted',
        actorUid: auth.currentUser?.uid || 'system',
        metadata: {}
      });
    } catch (err: unknown) {
      throw handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  /**
   * Subscribes to real-time table updates for a restaurant.
   */
  subscribeToTables(
    restaurantId: string,
    onUpdate: (tables: Table[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    if (!restaurantId || !restaurantId.trim()) {
      throw new Error('restaurantId is required to subscribe to tables.');
    }
    const colRef = collection(db, 'restaurants', restaurantId.trim(), 'tables');
    const q = query(colRef);

    return onSnapshot(
      q,
      (snapshot) => {
        const tables: Table[] = [];
        snapshot.forEach((d) => {
          tables.push({ id: d.id, ...d.data() } as Table);
        });
        onUpdate(sortTables(tables));
      },
      (err) => {
        if (!auth.currentUser) return;
        const errCode = (err as any)?.code;
        if (errCode === 'permission-denied' || errCode === 'unavailable' || errCode === 'failed-precondition') {
          console.warn('[RestaurantOS Debug] Tables subscription notice (permissions, index, or offline mode):', (err as any)?.message);
          onUpdate([]);
        } else {
          console.error('[RestaurantOS Debug] Error listening to tables:', err);
          if (onError) onError(err as Error);
        }
      }
    );
  }
}

export const tableService = new TableService();

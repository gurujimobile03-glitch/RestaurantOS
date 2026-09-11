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
  Unsubscribe
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import {
  Supplier,
  CreateSupplierDTO,
  UpdateSupplierDTO,
  SupplierQueryOptions
} from '../types/supplier';
import { suppliersPath, supplierDocPath } from '../utils/paths';
import { normalizeSupplierName } from '../utils/supplierUtils';
import { enforcePermission } from '../utils/permissions';
import { auditService } from './auditService';
import { IdempotencyService } from './idempotencyService';

export class SupplierService {
  private idempotency = new IdempotencyService();

  /**
   * Creates a new supplier.
   * Enforces tenant isolation, normalized name uniqueness for active suppliers,
   * idempotency, and audit logging.
   */
  async createSupplier(
    restaurantId: string,
    data: CreateSupplierDTO,
    clientRequestId?: string
  ): Promise<Supplier> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      throw new Error('restaurantId is required to create supplier');
    }

    await enforcePermission(cleanRestId, 'manage_suppliers');

    const name = data.name?.trim();
    if (!name) {
      throw new Error('Supplier name is required');
    }

    const phone = data.phone?.trim();
    if (!phone) {
      throw new Error('Supplier phone is required');
    }

    // Idempotency check if key provided
    if (clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<Supplier>(
        cleanRestId,
        clientRequestId.trim(),
        'create_supplier',
        { ...data, restaurantId: cleanRestId }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    const normalizedName = normalizeSupplierName(name);

    // Duplicate active supplier check within the same restaurant
    const dupQuery = query(
      collection(db, suppliersPath(cleanRestId)),
      where('normalizedName', '==', normalizedName),
      where('active', '==', true)
    );
    const dupSnap = await getDocs(dupQuery);
    if (!dupSnap.empty) {
      throw new Error(`An active supplier with the name "${name}" already exists.`);
    }

    const supplierCol = collection(db, suppliersPath(cleanRestId));
    const supplierId = doc(supplierCol).id;
    const supplierRef = doc(db, supplierDocPath(cleanRestId, supplierId));
    const actorUid = auth.currentUser?.uid || 'system';

    const newSupplier: Supplier = {
      supplierId,
      restaurantId: cleanRestId,
      name,
      normalizedName,
      phone,
      email: data.email?.trim() || undefined,
      address: data.address?.trim() || undefined,
      gstNumber: data.gstNumber?.trim() || undefined,
      contactPerson: data.contactPerson?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actorUid,
      updatedBy: actorUid
    };

    await setDoc(supplierRef, newSupplier);

    // Mark idempotency complete
    if (clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        clientRequestId.trim(),
        'create_supplier',
        { ...data, restaurantId: cleanRestId },
        supplierId,
        newSupplier
      );
    }

    // Audit event
    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'supplier',
      entityId: supplierId,
      action: 'supplier_created',
      actorUid,
      metadata: {
        supplierName: name,
        phone,
        contactPerson: data.contactPerson?.trim() || null
      }
    });

    return newSupplier;
  }

  /**
   * Fetches a supplier by ID.
   */
  async getSupplier(restaurantId: string, supplierId: string): Promise<Supplier | null> {
    const cleanRestId = restaurantId?.trim();
    const cleanSupplierId = supplierId?.trim();
    if (!cleanRestId || !cleanSupplierId) return null;

    await enforcePermission(cleanRestId, 'access_suppliers');

    const supplierRef = doc(db, supplierDocPath(cleanRestId, cleanSupplierId));
    const snap = await getDoc(supplierRef);
    if (!snap.exists()) return null;

    const data = snap.data() as Supplier;
    if (data.restaurantId !== cleanRestId) {
      throw new Error('Cross-tenant supplier access rejected');
    }
    return data;
  }

  /**
   * Fetches suppliers for a restaurant with optional activeOnly and search filters.
   */
  async getSuppliers(
    restaurantId: string,
    options?: SupplierQueryOptions
  ): Promise<Supplier[]> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return [];

    await enforcePermission(cleanRestId, 'access_suppliers');

    let q = query(collection(db, suppliersPath(cleanRestId)));
    if (options?.activeOnly) {
      q = query(q, where('active', '==', true));
    }

    const snap = await getDocs(q);
    let suppliers: Supplier[] = [];
    snap.forEach(docSnap => {
      const s = docSnap.data() as Supplier;
      if (s.restaurantId === cleanRestId) {
        suppliers.push(s);
      }
    });

    // In-memory filter for search query
    if (options?.search?.trim()) {
      const term = options.search.trim().toLowerCase();
      suppliers = suppliers.filter(
        s =>
          s.name.toLowerCase().includes(term) ||
          s.phone.toLowerCase().includes(term) ||
          (s.contactPerson && s.contactPerson.toLowerCase().includes(term)) ||
          (s.gstNumber && s.gstNumber.toLowerCase().includes(term))
      );
    }

    // Sort by name
    return suppliers.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Updates an existing supplier.
   * Protects immutable fields (restaurantId, supplierId, createdBy).
   * Verifies unique active name if modified.
   */
  async updateSupplier(
    restaurantId: string,
    supplierId: string,
    data: UpdateSupplierDTO
  ): Promise<Supplier> {
    const cleanRestId = restaurantId?.trim();
    const cleanSupplierId = supplierId?.trim();
    if (!cleanRestId || !cleanSupplierId) {
      throw new Error('restaurantId and supplierId are required');
    }

    await enforcePermission(cleanRestId, 'manage_suppliers');

    const existing = await this.getSupplier(cleanRestId, cleanSupplierId);
    if (!existing) {
      throw new Error('Supplier does not exist');
    }

    const updates: Partial<Supplier> = {
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid || 'system'
    };

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new Error('Supplier name cannot be empty');
      const normalizedName = normalizeSupplierName(name);

      if (normalizedName !== existing.normalizedName) {
        const dupSnap = await getDocs(
          query(
            collection(db, suppliersPath(cleanRestId)),
            where('normalizedName', '==', normalizedName),
            where('active', '==', true)
          )
        );
        const hasOtherWithSameName = dupSnap.docs.some(d => d.id !== cleanSupplierId);
        if (hasOtherWithSameName) {
          throw new Error(`An active supplier with the name "${name}" already exists.`);
        }
        updates.name = name;
        updates.normalizedName = normalizedName;
      }
    }

    if (data.phone !== undefined) {
      const phone = data.phone.trim();
      if (!phone) throw new Error('Supplier phone cannot be empty');
      updates.phone = phone;
    }

    if (data.email !== undefined) {
      updates.email = data.email.trim() || undefined;
    }

    if (data.address !== undefined) {
      updates.address = data.address.trim() || undefined;
    }

    if (data.gstNumber !== undefined) {
      updates.gstNumber = data.gstNumber.trim() || undefined;
    }

    if (data.contactPerson !== undefined) {
      updates.contactPerson = data.contactPerson.trim() || undefined;
    }

    if (data.notes !== undefined) {
      updates.notes = data.notes.trim() || undefined;
    }

    if (data.active !== undefined) {
      updates.active = data.active;
    }

    const supplierRef = doc(db, supplierDocPath(cleanRestId, cleanSupplierId));
    await updateDoc(supplierRef, updates as any);

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'supplier',
      entityId: cleanSupplierId,
      action: 'supplier_updated',
      actorUid: auth.currentUser?.uid || 'system',
      metadata: {
        supplierName: updates.name || existing.name,
        changedFields: Object.keys(updates)
      }
    });

    return {
      ...existing,
      ...updates
    } as Supplier;
  }

  /**
   * Soft deactivates a supplier to preserve historical purchase integrity.
   */
  async deactivateSupplier(
    restaurantId: string,
    supplierId: string,
    reason?: string
  ): Promise<Supplier> {
    const cleanRestId = restaurantId?.trim();
    const cleanSupplierId = supplierId?.trim();
    if (!cleanRestId || !cleanSupplierId) {
      throw new Error('restaurantId and supplierId are required');
    }

    await enforcePermission(cleanRestId, 'manage_suppliers');

    const existing = await this.getSupplier(cleanRestId, cleanSupplierId);
    if (!existing) {
      throw new Error('Supplier does not exist');
    }

    if (!existing.active) {
      return existing; // already inactive
    }

    const actorUid = auth.currentUser?.uid || 'system';
    const supplierRef = doc(db, supplierDocPath(cleanRestId, cleanSupplierId));

    await updateDoc(supplierRef, {
      active: false,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid
    });

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'supplier',
      entityId: cleanSupplierId,
      action: 'supplier_deactivated',
      actorUid,
      metadata: {
        supplierName: existing.name,
        reason: reason?.trim() || 'Manual soft deactivation'
      }
    });

    return {
      ...existing,
      active: false,
      updatedBy: actorUid
    };
  }

  /**
   * Realtime subscription to suppliers.
   */
  listenToSuppliers(
    restaurantId: string,
    onUpdate: (suppliers: Supplier[]) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return () => {};

    const q = query(collection(db, suppliersPath(cleanRestId)));

    return onSnapshot(
      q,
      snap => {
        const suppliers: Supplier[] = [];
        snap.forEach(docSnap => {
          const s = docSnap.data() as Supplier;
          if (s.restaurantId === cleanRestId) {
            suppliers.push(s);
          }
        });
        suppliers.sort((a, b) => a.name.localeCompare(b.name));
        onUpdate(suppliers);
      },
      err => {
        console.error('listenToSuppliers snapshot error:', err);
        if (onError) onError(err);
      }
    );
  }
}

export const supplierService = new SupplierService();

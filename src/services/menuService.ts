import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { Category, CategoryFormData, MenuItem, MenuItemFormData } from '../types/menu';
import { handleFirestoreError, OperationType } from '../utils/firestoreError';
import { enforcePermission } from '../utils/permissions';

// -------------------------------------------------------------
// CATEGORIES
// -------------------------------------------------------------

export function subscribeToCategories(
  restaurantId: string,
  callback: (categories: Category[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, 'restaurants', restaurantId, 'categories');
  const q = query(colRef, orderBy('sortOrder', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Category[] = [];
      snapshot.forEach((d) => {
        list.push({ categoryId: d.id, ...d.data() } as Category);
      });
      callback(list);
    },
    (err) => {
      if (!auth.currentUser) {
        console.log('[RestaurantOS Debug] Categories snapshot listener ended after auth logout');
        return;
      }
      console.error('[RestaurantOS Debug] Error listening to categories:', err);
      if (onError) onError(err);
    }
  );
}

export async function createCategory(
  restaurantId: string,
  data: CategoryFormData
): Promise<string> {
  await enforcePermission(restaurantId, 'access_categories');
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'categories');
    const newDoc = doc(colRef);

    const category: Category = {
      categoryId: newDoc.id,
      restaurantId,
      name: data.name.trim(),
      description: data.description.trim(),
      imageUrl: data.imageUrl || null,
      sortOrder: Number(data.sortOrder) || 0,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(newDoc, category);
    return newDoc.id;
  } catch (error) {
    throw handleFirestoreError(error, OperationType.CREATE, `restaurants/${restaurantId}/categories`);
  }
}

export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  data: Partial<CategoryFormData>
): Promise<void> {
  await enforcePermission(restaurantId, 'access_categories');
  try {
    const ref = doc(db, 'restaurants', restaurantId, 'categories', categoryId);
    await updateDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/categories/${categoryId}`);
  }
}

export async function deleteCategory(
  restaurantId: string,
  categoryId: string
): Promise<void> {
  await enforcePermission(restaurantId, 'access_categories');
  try {
    const ref = doc(db, 'restaurants', restaurantId, 'categories', categoryId);
    await deleteDoc(ref);
  } catch (error) {
    throw handleFirestoreError(error, OperationType.DELETE, `restaurants/${restaurantId}/categories/${categoryId}`);
  }
}

export async function toggleCategoryStatus(
  restaurantId: string,
  categoryId: string,
  isActive: boolean
): Promise<void> {
  await enforcePermission(restaurantId, 'access_categories');
  try {
    const ref = doc(db, 'restaurants', restaurantId, 'categories', categoryId);
    await updateDoc(ref, {
      isActive,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/categories/${categoryId}`);
  }
}

/**
 * Swaps or updates sort orders for two adjacent categories.
 */
export async function swapCategoryOrder(
  restaurantId: string,
  catA: { categoryId: string; sortOrder: number },
  catB: { categoryId: string; sortOrder: number }
): Promise<void> {
  try {
    const refA = doc(db, 'restaurants', restaurantId, 'categories', catA.categoryId);
    const refB = doc(db, 'restaurants', restaurantId, 'categories', catB.categoryId);
    
    const orderA = catA.sortOrder === catB.sortOrder ? catA.sortOrder : catB.sortOrder;
    const orderB = catA.sortOrder === catB.sortOrder ? catA.sortOrder + 1 : catA.sortOrder;

    await Promise.all([
      updateDoc(refA, { sortOrder: orderA, updatedAt: serverTimestamp() }),
      updateDoc(refB, { sortOrder: orderB, updatedAt: serverTimestamp() })
    ]);
  } catch (error) {
    throw handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/categories`);
  }
}

// -------------------------------------------------------------
// MENU ITEMS
// -------------------------------------------------------------

export function subscribeToMenuItems(
  restaurantId: string,
  callback: (items: MenuItem[]) => void,
  onError?: (err: unknown) => void
) {
  const colRef = collection(db, 'restaurants', restaurantId, 'items');
  const q = query(colRef, orderBy('sortOrder', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: MenuItem[] = [];
      snapshot.forEach((d) => {
        list.push({ itemId: d.id, ...d.data() } as MenuItem);
      });
      callback(list);
    },
    (err) => {
      if (!auth.currentUser) {
        console.log('[RestaurantOS Debug] Menu items snapshot listener ended after auth logout');
        return;
      }
      console.error('[RestaurantOS Debug] Error listening to items:', err);
      if (onError) onError(err);
    }
  );
}

export async function createMenuItem(
  restaurantId: string,
  data: MenuItemFormData
): Promise<string> {
  await enforcePermission(restaurantId, 'access_items');
  try {
    const colRef = collection(db, 'restaurants', restaurantId, 'items');
    const newDoc = doc(colRef);

    const item: MenuItem = {
      itemId: newDoc.id,
      restaurantId,
      categoryId: data.categoryId,
      name: data.name.trim(),
      shortName: data.shortName.trim() || data.name.trim().slice(0, 16),
      description: data.description.trim(),
      imageUrl: data.imageUrl || null,
      price: Math.max(0, Number(data.price) || 0),
      taxRate: Math.max(0, Number(data.taxRate) || 0),
      taxInclusive: !!data.taxInclusive,
      foodType: data.foodType || 'veg',
      isAvailable: data.isAvailable !== undefined ? data.isAvailable : true,
      sku: data.sku?.trim() || '',
      sortOrder: Number(data.sortOrder) || 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(newDoc, item);
    return newDoc.id;
  } catch (error) {
    throw handleFirestoreError(error, OperationType.CREATE, `restaurants/${restaurantId}/items`);
  }
}

export async function updateMenuItem(
  restaurantId: string,
  itemId: string,
  data: Partial<MenuItemFormData>
): Promise<void> {
  await enforcePermission(restaurantId, 'access_items');
  try {
    const ref = doc(db, 'restaurants', restaurantId, 'items', itemId);
    const payload: any = {
      ...data,
      updatedAt: serverTimestamp()
    };
    if (data.price !== undefined) {
      payload.price = Math.max(0, Number(data.price));
    }
    if (data.taxRate !== undefined) {
      payload.taxRate = Math.max(0, Number(data.taxRate));
    }
    await updateDoc(ref, payload);
  } catch (error) {
    throw handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/items/${itemId}`);
  }
}

export async function deleteMenuItem(
  restaurantId: string,
  itemId: string
): Promise<void> {
  await enforcePermission(restaurantId, 'access_items');
  try {
    const ref = doc(db, 'restaurants', restaurantId, 'items', itemId);
    await deleteDoc(ref);
  } catch (error) {
    throw handleFirestoreError(error, OperationType.DELETE, `restaurants/${restaurantId}/items/${itemId}`);
  }
}

export async function toggleItemAvailability(
  restaurantId: string,
  itemId: string,
  isAvailable: boolean
): Promise<void> {
  await enforcePermission(restaurantId, 'access_items');
  try {
    const ref = doc(db, 'restaurants', restaurantId, 'items', itemId);
    await updateDoc(ref, {
      isAvailable,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    throw handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/items/${itemId}`);
  }
}

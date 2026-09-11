/**
 * Recipe Service for RestaurantOS M7-7D.
 * 
 * Handles Bill of Materials (BOM), recipe lifecycle (draft -> active -> archived),
 * multi-versioning, ingredient validation, unit compatibility verification,
 * and menu item mapping.
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
  Recipe,
  RecipeStatus,
  RecipeIngredient,
  CreateRecipeDTO,
  UpdateRecipeDTO,
  RecipeIngredientSnapshot
} from '../types/recipe';
import { InventoryItem } from '../types/inventory';
import { MenuItem } from '../types/menu';
import {
  recipesPath,
  recipeDocPath,
  inventoryItemDocPath,
  itemDocPath
} from '../utils/paths';
import {
  validateRecipeIngredients,
  calculateRecipeCostPaise,
  isValidRecipeStatusTransition
} from '../utils/recipeUtils';
import { areUnitsCompatible, roundQuantity, isValidUnit } from '../utils/units';
import { enforcePermission } from '../utils/permissions';
import { auditService } from './auditService';
import { IdempotencyService } from './idempotencyService';

export class RecipeService {
  private idempotency = new IdempotencyService();

  /**
   * Creates a new recipe for a menu item.
   * If status is 'active', atomically deactivates/archives any existing active recipe for that menuItemId.
   */
  async createRecipe(
    restaurantId: string,
    data: CreateRecipeDTO,
    clientRequestId?: string
  ): Promise<Recipe> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      throw new Error('restaurantId is required to create a recipe');
    }

    await enforcePermission(cleanRestId, 'manage_recipes');

    const menuItemId = data.menuItemId?.trim();
    if (!menuItemId) {
      throw new Error('menuItemId is required to create a recipe');
    }

    // Validate raw ingredient format
    const valResult = validateRecipeIngredients(data.ingredients);
    if (!valResult.isValid) {
      throw new Error(`Recipe validation failed: ${valResult.errors.join('; ')}`);
    }

    // Idempotency check
    if (clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<Recipe>(
        cleanRestId,
        clientRequestId.trim(),
        'create_recipe',
        { ...data, restaurantId: cleanRestId }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    // 1. Fetch & validate MenuItem
    const menuDocRef = doc(db, itemDocPath(cleanRestId, menuItemId));
    const menuSnap = await getDoc(menuDocRef);
    if (!menuSnap.exists()) {
      throw new Error(`Menu item "${menuItemId}" does not exist in restaurant "${cleanRestId}".`);
    }
    const menuItemData = menuSnap.data() as MenuItem;
    if (menuItemData.restaurantId !== cleanRestId) {
      throw new Error(`Menu item "${menuItemId}" does not belong to restaurant "${cleanRestId}".`);
    }

    // 2. Fetch & validate each InventoryItem
    const resolvedIngredients: RecipeIngredient[] = [];
    for (const rawIng of data.ingredients) {
      const invDocRef = doc(db, inventoryItemDocPath(cleanRestId, rawIng.inventoryItemId.trim()));
      const invSnap = await getDoc(invDocRef);
      if (!invSnap.exists()) {
        throw new Error(`Inventory item "${rawIng.inventoryItemId}" does not exist in restaurant "${cleanRestId}".`);
      }
      const invData = invSnap.data() as InventoryItem;
      if (invData.restaurantId !== cleanRestId) {
        throw new Error(`Inventory item "${rawIng.inventoryItemId}" does not belong to restaurant "${cleanRestId}".`);
      }
      if (!invData.active || invData.status === 'archived') {
        throw new Error(`Inventory item "${invData.name}" (${invData.id}) is not active.`);
      }
      if (!areUnitsCompatible(rawIng.unit, invData.unit)) {
        throw new Error(
          `Unit mismatch for ingredient "${invData.name}": Recipe unit "${rawIng.unit}" is incompatible with inventory base unit "${invData.unit}".`
        );
      }

      const snapshot: RecipeIngredientSnapshot = {
        name: invData.name,
        sku: invData.sku,
        unit: invData.unit,
        costPerUnitPaise: invData.costPerUnitPaise || 0
      };

      resolvedIngredients.push({
        inventoryItemId: invData.id,
        inventoryItemSnapshot: snapshot,
        quantity: roundQuantity(rawIng.quantity),
        unit: rawIng.unit
      });
    }

    const actorUid = auth.currentUser?.uid || 'system';
    const targetStatus: RecipeStatus = data.status || 'draft';

    // 3. Query existing recipes for versioning and active conflict resolution
    const existingSnap = await getDocs(
      query(
        collection(db, recipesPath(cleanRestId)),
        where('menuItemId', '==', menuItemId)
      )
    );

    let maxVersion = 0;
    let existingActiveRecipe: Recipe | null = null;
    if (existingSnap?.forEach) {
      existingSnap.forEach((docSnap) => {
        const r = docSnap.data() as Recipe;
        if (r.version > maxVersion) {
          maxVersion = r.version;
        }
        if (r.status === 'active') {
          existingActiveRecipe = r;
        }
      });
    }

    const nextVersion = maxVersion + 1;
    const recipeCol = collection(db, recipesPath(cleanRestId));
    const newRecipeId = doc(recipeCol).id;
    const now = new Date();

    const estimatedCost = calculateRecipeCostPaise(resolvedIngredients);

    const newRecipe: Recipe = {
      id: newRecipeId,
      recipeId: newRecipeId,
      restaurantId: cleanRestId,
      menuItemId,
      menuItemSnapshot: {
        name: menuItemData.name,
        categoryName: undefined,
        priceMinor: Math.round((menuItemData.price || 0) * 100)
      },
      version: nextVersion,
      status: targetStatus,
      ingredients: resolvedIngredients,
      notes: data.notes?.trim() || undefined,
      estimatedCostPaise: estimatedCost,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid
    };

    // If activating, archive any previous active recipe atomically
    if (targetStatus === 'active' && existingActiveRecipe) {
      await runTransaction(db, async (tx) => {
        const prevDocRef = doc(db, recipeDocPath(cleanRestId, (existingActiveRecipe as Recipe).id));
        const newDocRef = doc(db, recipeDocPath(cleanRestId, newRecipeId));

        tx.update(prevDocRef, {
          status: 'archived',
          updatedAt: serverTimestamp(),
          updatedBy: actorUid
        });

        tx.set(newDocRef, {
          ...newRecipe,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    } else {
      await setDoc(doc(db, recipeDocPath(cleanRestId, newRecipeId)), {
        ...newRecipe,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'recipe',
      entityId: newRecipeId,
      action: 'recipe_created',
      actorUid,
      metadata: {
        menuItemId,
        menuItemName: menuItemData.name,
        version: nextVersion,
        status: targetStatus,
        ingredientsCount: resolvedIngredients.length,
        estimatedCostPaise: estimatedCost
      }
    });

    if (clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        clientRequestId.trim(),
        'create_recipe',
        { ...data, restaurantId: cleanRestId },
        newRecipeId,
        newRecipe
      );
    }

    return newRecipe;
  }

  /**
   * Updates an existing recipe.
   * If updating an 'active' recipe's ingredients, a new version is created and the old one archived
   * to guarantee historical snapshot immutability.
   * If updating a 'draft', updates in place.
   */
  async updateRecipe(
    restaurantId: string,
    recipeId: string,
    data: UpdateRecipeDTO,
    clientRequestId?: string
  ): Promise<Recipe> {
    const cleanRestId = restaurantId?.trim();
    const cleanRecipeId = recipeId?.trim();
    if (!cleanRestId || !cleanRecipeId) {
      throw new Error('restaurantId and recipeId are required to update a recipe');
    }

    await enforcePermission(cleanRestId, 'manage_recipes');

    const recipeRef = doc(db, recipeDocPath(cleanRestId, cleanRecipeId));
    const snap = await getDoc(recipeRef);
    if (!snap.exists()) {
      throw new Error(`Recipe "${cleanRecipeId}" does not exist in restaurant "${cleanRestId}".`);
    }

    const currentRecipe = snap.data() as Recipe;
    if (currentRecipe.restaurantId !== cleanRestId) {
      throw new Error(`Recipe "${cleanRecipeId}" does not belong to restaurant "${cleanRestId}".`);
    }

    if (currentRecipe.status === 'archived') {
      throw new Error('Archived recipes are immutable and cannot be modified.');
    }

    // Idempotency check
    if (clientRequestId?.trim()) {
      const checkResult = await this.idempotency.checkOrAcquire<Recipe>(
        cleanRestId,
        clientRequestId.trim(),
        'update_recipe',
        { recipeId: cleanRecipeId, ...data }
      );
      if (checkResult.action === 'return_cached') {
        return checkResult.cachedResult;
      }
    }

    const actorUid = auth.currentUser?.uid || 'system';

    // If ingredients provided, validate and resolve snapshots
    let resolvedIngredients = currentRecipe.ingredients;
    if (data.ingredients) {
      const valResult = validateRecipeIngredients(data.ingredients);
      if (!valResult.isValid) {
        throw new Error(`Recipe validation failed: ${valResult.errors.join('; ')}`);
      }

      resolvedIngredients = [];
      for (const rawIng of data.ingredients) {
        const invDocRef = doc(db, inventoryItemDocPath(cleanRestId, rawIng.inventoryItemId.trim()));
        const invSnap = await getDoc(invDocRef);
        if (!invSnap.exists()) {
          throw new Error(`Inventory item "${rawIng.inventoryItemId}" does not exist.`);
        }
        const invData = invSnap.data() as InventoryItem;
        if (invData.restaurantId !== cleanRestId) {
          throw new Error(`Inventory item "${rawIng.inventoryItemId}" does not belong to this restaurant.`);
        }
        if (!invData.active || invData.status === 'archived') {
          throw new Error(`Inventory item "${invData.name}" is not active.`);
        }
        if (!areUnitsCompatible(rawIng.unit, invData.unit)) {
          throw new Error(`Unit "${rawIng.unit}" is incompatible with "${invData.name}" base unit "${invData.unit}".`);
        }

        resolvedIngredients.push({
          inventoryItemId: invData.id,
          inventoryItemSnapshot: {
            name: invData.name,
            sku: invData.sku,
            unit: invData.unit,
            costPerUnitPaise: invData.costPerUnitPaise || 0
          },
          quantity: roundQuantity(rawIng.quantity),
          unit: rawIng.unit
        });
      }
    }

    const targetStatus = data.status || currentRecipe.status;
    if (!isValidRecipeStatusTransition(currentRecipe.status, targetStatus)) {
      throw new Error(`Invalid status transition from "${currentRecipe.status}" to "${targetStatus}".`);
    }

    const estimatedCost = calculateRecipeCostPaise(resolvedIngredients);
    const now = new Date();

    // If current recipe is ACTIVE and ingredients are changed, spawn new version to preserve history
    if (currentRecipe.status === 'active' && data.ingredients) {
      const newVersion = currentRecipe.version + 1;
      const newRecipeId = doc(collection(db, recipesPath(cleanRestId))).id;

      const newRecipe: Recipe = {
        id: newRecipeId,
        recipeId: newRecipeId,
        restaurantId: cleanRestId,
        menuItemId: currentRecipe.menuItemId,
        menuItemSnapshot: currentRecipe.menuItemSnapshot,
        version: newVersion,
        status: targetStatus,
        ingredients: resolvedIngredients,
        notes: data.notes !== undefined ? data.notes?.trim() || undefined : currentRecipe.notes,
        estimatedCostPaise: estimatedCost,
        createdAt: now,
        updatedAt: now,
        createdBy: actorUid,
        updatedBy: actorUid
      };

      await runTransaction(db, async (tx) => {
        const oldDocRef = doc(db, recipeDocPath(cleanRestId, cleanRecipeId));
        const newDocRef = doc(db, recipeDocPath(cleanRestId, newRecipeId));

        // Archive old version
        tx.update(oldDocRef, {
          status: 'archived',
          updatedAt: serverTimestamp(),
          updatedBy: actorUid
        });

        // Write new version
        tx.set(newDocRef, {
          ...newRecipe,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await auditService.logEvent(cleanRestId, {
        restaurantId: cleanRestId,
        entityType: 'recipe',
        entityId: newRecipeId,
        action: 'recipe_version_created',
        actorUid,
        metadata: {
          previousRecipeId: cleanRecipeId,
          version: newVersion,
          status: targetStatus
        }
      });

      return newRecipe;
    }

    // Otherwise, update draft in place
    const updates: Partial<Recipe> = {
      ingredients: resolvedIngredients,
      estimatedCostPaise: estimatedCost,
      status: targetStatus,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid
    };

    if (data.notes !== undefined) {
      updates.notes = data.notes?.trim() || undefined;
    }

    await updateDoc(recipeRef, updates);

    const updatedRecipe: Recipe = {
      ...currentRecipe,
      ...updates,
      updatedAt: now
    };

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'recipe',
      entityId: cleanRecipeId,
      action: 'recipe_updated',
      actorUid,
      metadata: {
        version: currentRecipe.version,
        status: targetStatus
      }
    });

    if (clientRequestId?.trim()) {
      await this.idempotency.recordSuccess(
        cleanRestId,
        clientRequestId.trim(),
        'update_recipe',
        { recipeId: cleanRecipeId, ...data },
        cleanRecipeId,
        updatedRecipe
      );
    }

    return updatedRecipe;
  }

  /**
   * Activates a recipe for its menu item.
   * Atomically archives any previously active recipe for the same menuItemId.
   */
  async activateRecipe(restaurantId: string, recipeId: string): Promise<Recipe> {
    const cleanRestId = restaurantId?.trim();
    const cleanRecipeId = recipeId?.trim();
    if (!cleanRestId || !cleanRecipeId) {
      throw new Error('restaurantId and recipeId are required');
    }

    await enforcePermission(cleanRestId, 'manage_recipes');

    const recipeRef = doc(db, recipeDocPath(cleanRestId, cleanRecipeId));
    const snap = await getDoc(recipeRef);
    if (!snap.exists()) {
      throw new Error(`Recipe "${cleanRecipeId}" does not exist.`);
    }

    const currentRecipe = snap.data() as Recipe;
    if (currentRecipe.restaurantId !== cleanRestId) {
      throw new Error(`Recipe does not belong to restaurant "${cleanRestId}".`);
    }

    if (currentRecipe.status === 'active') {
      return currentRecipe; // already active
    }

    if (currentRecipe.status === 'archived') {
      throw new Error('Archived recipes cannot be directly reactivated. Create a new recipe version instead.');
    }

    const actorUid = auth.currentUser?.uid || 'system';

    // Query for existing active recipe for this menu item
    const existingSnap = await getDocs(
      query(
        collection(db, recipesPath(cleanRestId)),
        where('menuItemId', '==', currentRecipe.menuItemId),
        where('status', '==', 'active')
      )
    );

    await runTransaction(db, async (tx) => {
      // Archive any currently active recipe
      if (existingSnap?.forEach) {
        existingSnap.forEach((activeSnap) => {
          if (activeSnap.id !== cleanRecipeId) {
            tx.update(activeSnap.ref, {
              status: 'archived',
              updatedAt: serverTimestamp(),
              updatedBy: actorUid
            });
          }
        });
      }

      // Mark target recipe active
      tx.update(recipeRef, {
        status: 'active',
        updatedAt: serverTimestamp(),
        updatedBy: actorUid
      });
    });

    const activatedRecipe: Recipe = {
      ...currentRecipe,
      status: 'active',
      updatedAt: new Date(),
      updatedBy: actorUid
    };

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'recipe',
      entityId: cleanRecipeId,
      action: 'recipe_activated',
      actorUid,
      metadata: {
        menuItemId: currentRecipe.menuItemId,
        version: currentRecipe.version
      }
    });

    return activatedRecipe;
  }

  /**
   * Archives an active or draft recipe.
   */
  async archiveRecipe(restaurantId: string, recipeId: string): Promise<Recipe> {
    const cleanRestId = restaurantId?.trim();
    const cleanRecipeId = recipeId?.trim();
    if (!cleanRestId || !cleanRecipeId) {
      throw new Error('restaurantId and recipeId are required');
    }

    await enforcePermission(cleanRestId, 'manage_recipes');

    const recipeRef = doc(db, recipeDocPath(cleanRestId, cleanRecipeId));
    const snap = await getDoc(recipeRef);
    if (!snap.exists()) {
      throw new Error(`Recipe "${cleanRecipeId}" does not exist.`);
    }

    const currentRecipe = snap.data() as Recipe;
    if (currentRecipe.restaurantId !== cleanRestId) {
      throw new Error(`Recipe does not belong to restaurant "${cleanRestId}".`);
    }

    if (currentRecipe.status === 'archived') {
      return currentRecipe;
    }

    const actorUid = auth.currentUser?.uid || 'system';

    await updateDoc(recipeRef, {
      status: 'archived',
      updatedAt: serverTimestamp(),
      updatedBy: actorUid
    });

    const archivedRecipe: Recipe = {
      ...currentRecipe,
      status: 'archived',
      updatedAt: new Date(),
      updatedBy: actorUid
    };

    await auditService.logEvent(cleanRestId, {
      restaurantId: cleanRestId,
      entityType: 'recipe',
      entityId: cleanRecipeId,
      action: 'recipe_archived',
      actorUid,
      metadata: {
        menuItemId: currentRecipe.menuItemId,
        version: currentRecipe.version
      }
    });

    return archivedRecipe;
  }

  /**
   * Retrieves a single recipe by ID.
   */
  async getRecipe(restaurantId: string, recipeId: string): Promise<Recipe | null> {
    const cleanRestId = restaurantId?.trim();
    const cleanRecipeId = recipeId?.trim();
    if (!cleanRestId || !cleanRecipeId) return null;

    await enforcePermission(cleanRestId, 'access_recipes');

    const ref = doc(db, recipeDocPath(cleanRestId, cleanRecipeId));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data = snap.data() as Recipe;
    if (data.restaurantId !== cleanRestId) return null;

    return { id: snap.id, ...data };
  }

  /**
   * Retrieves the currently active recipe for a menu item.
   */
  async getActiveRecipeForMenuItem(
    restaurantId: string,
    menuItemId: string
  ): Promise<Recipe | null> {
    const cleanRestId = restaurantId?.trim();
    const cleanItemId = menuItemId?.trim();
    if (!cleanRestId || !cleanItemId) return null;

    const q = query(
      collection(db, recipesPath(cleanRestId)),
      where('menuItemId', '==', cleanItemId),
      where('status', '==', 'active'),
      limit(1)
    );

    const snap = await getDocs(q);
    if (snap.empty) return null;

    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as Recipe;
  }

  /**
   * Lists all recipes for a restaurant with optional filtering.
   */
  async listRecipes(
    restaurantId: string,
    options?: { menuItemId?: string; status?: RecipeStatus }
  ): Promise<Recipe[]> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) return [];

    await enforcePermission(cleanRestId, 'access_recipes');

    let q = query(collection(db, recipesPath(cleanRestId)));

    if (options?.menuItemId?.trim()) {
      q = query(q, where('menuItemId', '==', options.menuItemId.trim()));
    }
    if (options?.status) {
      q = query(q, where('status', '==', options.status));
    }

    const snap = await getDocs(q);
    const results: Recipe[] = [];
    snap.forEach((d) => {
      const data = d.data() as Recipe;
      if (data.restaurantId === cleanRestId) {
        results.push({ id: d.id, ...data });
      }
    });

    // Sort descending by createdAt or version
    results.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    return results;
  }

  /**
   * Subscribes to realtime recipe updates.
   */
  subscribeRecipes(
    restaurantId: string,
    callback: (recipes: Recipe[]) => void,
    options?: { menuItemId?: string; status?: RecipeStatus }
  ): Unsubscribe {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      callback([]);
      return () => {};
    }

    let q = query(collection(db, recipesPath(cleanRestId)));

    if (options?.menuItemId?.trim()) {
      q = query(q, where('menuItemId', '==', options.menuItemId.trim()));
    }
    if (options?.status) {
      q = query(q, where('status', '==', options.status));
    }

    return onSnapshot(
      q,
      (snapshot) => {
        const items: Recipe[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as Recipe;
          if (data.restaurantId === cleanRestId) {
            items.push({ id: d.id, ...data });
          }
        });
        items.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        callback(items);
      },
      (error) => {
        console.error('Error in subscribeRecipes:', error);
      }
    );
  }
}

export const recipeService = new RecipeService();

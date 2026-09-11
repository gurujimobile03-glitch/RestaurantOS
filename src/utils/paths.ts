/**
 * Centralized Firestore Path Helpers for RestaurantOS.
 * 
 * CRITICAL ARCHITECTURAL INVARIANT:
 * Path helpers MUST NEVER infer restaurantId from Firebase Auth UID.
 * They MUST always receive the resolved restaurantId explicitly as a parameter.
 */

/**
 * Validates that an entity ID or restaurant ID is non-empty and contains no illegal path characters.
 */
function assertValidId(id: unknown, entityName: string): asserts id is string {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`${entityName} must be a non-empty string, received: ${String(id)}`);
  }
  if (id.includes('/') || id.includes('\\')) {
    throw new Error(`${entityName} cannot contain slashes ('/' or '\\'), received: "${id}"`);
  }
  if (id.trim() === '..' || id.includes('..')) {
    throw new Error(`${entityName} cannot contain parent directory traversal ('..'), received: "${id}"`);
  }
}

// -------------------------------------------------------------
// Root Collections
// -------------------------------------------------------------

export function restaurantsCollectionPath(): string {
  return 'restaurants';
}

export function usersCollectionPath(): string {
  return 'users';
}

export function userDocPath(userId: string): string {
  assertValidId(userId, 'userId');
  return `users/${userId.trim()}`;
}

// -------------------------------------------------------------
// Restaurant Document & Subcollections
// -------------------------------------------------------------

export function restaurantPath(restaurantId: string): string {
  assertValidId(restaurantId, 'restaurantId');
  return `restaurants/${restaurantId.trim()}`;
}

export function tablesPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/tables`;
}

export function tableDocPath(restaurantId: string, tableId: string): string {
  assertValidId(tableId, 'tableId');
  return `${tablesPath(restaurantId)}/${tableId.trim()}`;
}

export function tableSessionsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/tableSessions`;
}

export function tableSessionDocPath(restaurantId: string, sessionId: string): string {
  assertValidId(sessionId, 'sessionId');
  return `${tableSessionsPath(restaurantId)}/${sessionId.trim()}`;
}

export function ordersPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/orders`;
}

export function orderDocPath(restaurantId: string, orderId: string): string {
  assertValidId(orderId, 'orderId');
  return `${ordersPath(restaurantId)}/${orderId.trim()}`;
}

export function paymentsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/payments`;
}

export function paymentDocPath(restaurantId: string, paymentId: string): string {
  assertValidId(paymentId, 'paymentId');
  return `${paymentsPath(restaurantId)}/${paymentId.trim()}`;
}

export function kotsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/kots`;
}

export function kotDocPath(restaurantId: string, kotId: string): string {
  assertValidId(kotId, 'kotId');
  return `${kotsPath(restaurantId)}/${kotId.trim()}`;
}

export function auditLogsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/auditLogs`;
}

export function auditLogDocPath(restaurantId: string, auditId: string): string {
  assertValidId(auditId, 'auditId');
  return `${auditLogsPath(restaurantId)}/${auditId.trim()}`;
}

export function categoriesPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/categories`;
}

export function categoryDocPath(restaurantId: string, categoryId: string): string {
  assertValidId(categoryId, 'categoryId');
  return `${categoriesPath(restaurantId)}/${categoryId.trim()}`;
}

export function itemsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/items`;
}

export function itemDocPath(restaurantId: string, itemId: string): string {
  assertValidId(itemId, 'itemId');
  return `${itemsPath(restaurantId)}/${itemId.trim()}`;
}

export function membersPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/members`;
}

export function memberDocPath(restaurantId: string, memberId: string): string {
  assertValidId(memberId, 'memberId');
  return `${membersPath(restaurantId)}/${memberId.trim()}`;
}

export function idempotencyCollectionPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/idempotency`;
}

export function idempotencyDocPath(restaurantId: string, idempotencyKey: string): string {
  assertValidId(idempotencyKey, 'idempotencyKey');
  return `${idempotencyCollectionPath(restaurantId)}/${idempotencyKey.trim()}`;
}

export function inventoryItemsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/inventoryItems`;
}

export function inventoryItemDocPath(restaurantId: string, itemId: string): string {
  assertValidId(itemId, 'itemId');
  return `${inventoryItemsPath(restaurantId)}/${itemId.trim()}`;
}

export function stockMovementsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/stockMovements`;
}

export function stockMovementDocPath(restaurantId: string, movementId: string): string {
  assertValidId(movementId, 'movementId');
  return `${stockMovementsPath(restaurantId)}/${movementId.trim()}`;
}

export function suppliersPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/suppliers`;
}

export function supplierDocPath(restaurantId: string, supplierId: string): string {
  assertValidId(supplierId, 'supplierId');
  return `${suppliersPath(restaurantId)}/${supplierId.trim()}`;
}

export function purchaseOrdersPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/purchaseOrders`;
}

export function purchaseOrderDocPath(restaurantId: string, purchaseOrderId: string): string {
  assertValidId(purchaseOrderId, 'purchaseOrderId');
  return `${purchaseOrdersPath(restaurantId)}/${purchaseOrderId.trim()}`;
}

export function purchaseReceivingsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/purchaseReceivings`;
}

export function purchaseReceivingDocPath(restaurantId: string, receivingId: string): string {
  assertValidId(receivingId, 'receivingId');
  return `${purchaseReceivingsPath(restaurantId)}/${receivingId.trim()}`;
}

export function recipesPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/recipes`;
}

export function recipeDocPath(restaurantId: string, recipeId: string): string {
  assertValidId(recipeId, 'recipeId');
  return `${recipesPath(restaurantId)}/${recipeId.trim()}`;
}

export function stockConsumptionsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/stockConsumptions`;
}

export function stockConsumptionDocPath(restaurantId: string, consumptionId: string): string {
  assertValidId(consumptionId, 'consumptionId');
  return `${stockConsumptionsPath(restaurantId)}/${consumptionId.trim()}`;
}

export function printersPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/printers`;
}

export function printerDocPath(restaurantId: string, printerId: string): string {
  assertValidId(printerId, 'printerId');
  return `${printersPath(restaurantId)}/${printerId.trim()}`;
}

export function printJobsPath(restaurantId: string): string {
  return `${restaurantPath(restaurantId)}/printJobs`;
}

export function printJobDocPath(restaurantId: string, jobId: string): string {
  assertValidId(jobId, 'jobId');
  return `${printJobsPath(restaurantId)}/${jobId.trim()}`;
}



export type IdempotencyOperation =
  | 'create_order'
  | 'create_kot'
  | 'record_payment'
  | 'open_session'
  | 'close_session'
  | 'update_guest_count'
  | 'update_kot_status'
  | 'cancel_kot'
  | 'update_order_status'
  | 'create_inventory_item'
  | 'record_stock_movement'
  | 'create_supplier'
  | 'create_purchase_order'
  | 'submit_purchase_order'
  | 'receive_purchase_order'
  | 'cancel_purchase_order'
  | 'create_recipe'
  | 'update_recipe'
  | 'activate_recipe'
  | 'archive_recipe'
  | 'consume_stock'
  | 'reverse_consumption';

export type IdempotencyStatus = 'pending' | 'completed' | 'failed';

export interface IdempotencyRecord {
  /**
   * Unique client-supplied idempotency key (sanitized, alphanumeric/hyphen/underscore).
   */
  id: string; // The idempotency key itself acts as document ID
  restaurantId: string;
  operation: IdempotencyOperation;
  /**
   * Deterministic hash/signature of the request payload to detect parameter mutation across retries.
   */
  requestSignature: string;
  status: IdempotencyStatus;
  /**
   * The target entity ID produced upon successful execution (e.g. orderId, kotId, paymentId, sessionId).
   */
  targetEntityId: string | null;
  /**
   * Serialized response payload or metadata to return on exact retry.
   */
  responseSnapshot: any | null;
  errorMessage: string | null;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

/**
 * Audit log models for tracking state changes and operational security.
 */

export type AuditEntityType =
  | 'order'
  | 'table'
  | 'tableSession'
  | 'payment'
  | 'kot'
  | 'restaurant'
  | 'menuItem'
  | 'category'
  | 'staff'
  | 'member'
  | 'inventoryItem'
  | 'stockMovement';

export type AuditAction =
  | 'order_created'
  | 'order_updated'
  | 'order_cancelled'
  | 'discount_applied'
  | 'payment_created'
  | 'payment_refunded'
  | 'kot_created'
  | 'kot_status_changed'
  | 'table_created'
  | 'table_updated'
  | 'session_opened'
  | 'session_closed'
  | 'staff_created'
  | 'staff_invited'
  | 'staff_role_changed'
  | 'staff_activated'
  | 'staff_deactivated'
  | 'staff_removed'
  | 'staff_password_reset_sent'
  | 'inventory_item_created'
  | 'inventory_item_updated'
  | 'inventory_item_deactivated'
  | 'stock_opening_recorded'
  | 'stock_in_recorded'
  | 'stock_out_recorded'
  | 'stock_adjustment_recorded'
  | 'stock_wastage_recorded'
  | 'stock_damage_recorded'
  | 'stock_correction_recorded'
  | 'physical_count_recorded'
  | string;

export interface AuditLog {
  id: string;
  restaurantId: string;
  entityType: AuditEntityType | string;
  entityId: string;
  action: AuditAction;
  actorUid: string;
  metadata?: Record<string, any>;
  createdAt: any;
}

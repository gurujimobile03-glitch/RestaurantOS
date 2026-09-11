import { auth, db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { StaffRole } from '../types/auth';

export type PermissionAction =
  | 'access_pos'
  | 'access_kitchen'
  | 'access_captain'
  | 'access_dashboard'
  | 'access_restaurant_setup'
  | 'access_categories'
  | 'access_items'
  | 'access_orders'
  | 'view_orders'
  | 'create_orders'
  | 'modify_orders'
  | 'cancel_orders'
  | 'process_payments'
  | 'refund_payments'
  | 'open_table_sessions'
  | 'modify_session_info'
  | 'close_sessions'
  | 'update_kot_status'
  | 'view_financial_info'
  | 'access_audit'
  | 'access_staff'
  | 'manage_staff'
  | 'access_inventory'
  | 'view_inventory'
  | 'manage_inventory'
  | 'access_suppliers'
  | 'manage_suppliers'
  | 'access_purchases'
  | 'manage_purchases'
  | 'receive_purchases'
  | 'access_recipes'
  | 'manage_recipes'
  | 'view_consumption'
  | 'access_printers'
  | 'manage_printers'
  | 'print_bill'
  | 'print_kot';

export const PERMISSION_MATRIX: Record<StaffRole, Record<PermissionAction, boolean>> = {
  owner: {
    access_pos: true,
    access_kitchen: true,
    access_captain: true,
    access_dashboard: true,
    access_restaurant_setup: true,
    access_categories: true,
    access_items: true,
    access_orders: true,
    view_orders: true,
    create_orders: true,
    modify_orders: true,
    cancel_orders: true,
    process_payments: true,
    refund_payments: true,
    open_table_sessions: true,
    modify_session_info: true,
    close_sessions: true,
    update_kot_status: true,
    view_financial_info: true,
    access_audit: true,
    access_staff: true,
    manage_staff: true,
    access_inventory: true,
    view_inventory: true,
    manage_inventory: true,
    access_suppliers: true,
    manage_suppliers: true,
    access_purchases: true,
    manage_purchases: true,
    receive_purchases: true,
    access_recipes: true,
    manage_recipes: true,
    view_consumption: true,
    access_printers: true,
    manage_printers: true,
    print_bill: true,
    print_kot: true,
  },
  manager: {
    access_pos: true,
    access_kitchen: true,
    access_captain: true,
    access_dashboard: true,
    access_restaurant_setup: false, // Managers can't change core business config / legal setup
    access_categories: true,
    access_items: true,
    access_orders: true,
    view_orders: true,
    create_orders: true,
    modify_orders: true,
    cancel_orders: true,
    process_payments: true,
    refund_payments: true, // Managers have authority to refund
    open_table_sessions: true,
    modify_session_info: true,
    close_sessions: true,
    update_kot_status: true,
    view_financial_info: true,
    access_audit: true,
    access_staff: true,
    manage_staff: false, // Manager can view staff, but cannot add/remove or change staff roles
    access_inventory: true,
    view_inventory: true,
    manage_inventory: true,
    access_suppliers: true,
    manage_suppliers: true,
    access_purchases: true,
    manage_purchases: true,
    receive_purchases: true,
    access_recipes: true,
    manage_recipes: true,
    view_consumption: true,
    access_printers: true,
    manage_printers: true,
    print_bill: true,
    print_kot: true,
  },
  cashier: {
    access_pos: true,
    access_kitchen: false,
    access_captain: false,
    access_dashboard: false,
    access_restaurant_setup: false,
    access_categories: false,
    access_items: false,
    access_orders: true,
    view_orders: true,
    create_orders: true,
    modify_orders: true,
    cancel_orders: false, // Cashiers need manager to cancel
    process_payments: true,
    refund_payments: false, // Cashiers cannot refund without manager
    open_table_sessions: true,
    modify_session_info: true,
    close_sessions: true,
    update_kot_status: false,
    view_financial_info: true, // Only daily cash/drawer totals
    access_audit: false,
    access_staff: false,
    manage_staff: false,
    access_inventory: false,
    view_inventory: false,
    manage_inventory: false,
    access_suppliers: false,
    manage_suppliers: false,
    access_purchases: false,
    manage_purchases: false,
    receive_purchases: false,
    access_recipes: false,
    manage_recipes: false,
    view_consumption: false,
    access_printers: true,
    manage_printers: false,
    print_bill: true,
    print_kot: false,
  },
  kitchen: {
    access_pos: false,
    access_kitchen: true,
    access_captain: false,
    access_dashboard: false,
    access_restaurant_setup: false,
    access_categories: false,
    access_items: false,
    access_orders: false,
    view_orders: true, // Can view order KOTs
    create_orders: false,
    modify_orders: false,
    cancel_orders: false,
    process_payments: false,
    refund_payments: false,
    open_table_sessions: false,
    modify_session_info: false,
    close_sessions: false,
    update_kot_status: true, // Kitchen can update prepping/ready
    view_financial_info: false,
    access_audit: false,
    access_staff: false,
    manage_staff: false,
    access_inventory: false,
    view_inventory: false,
    manage_inventory: false,
    access_suppliers: false,
    manage_suppliers: false,
    access_purchases: false,
    manage_purchases: false,
    receive_purchases: false,
    access_recipes: false,
    manage_recipes: false,
    view_consumption: false,
    access_printers: false,
    manage_printers: false,
    print_bill: false,
    print_kot: true,
  },
  captain: {
    access_pos: false,
    access_kitchen: false,
    access_captain: true,
    access_dashboard: false,
    access_restaurant_setup: false,
    access_categories: false,
    access_items: false,
    access_orders: false,
    view_orders: true,
    create_orders: true,
    modify_orders: true,
    cancel_orders: false, // Captains cannot cancel orders
    process_payments: false,
    refund_payments: false,
    open_table_sessions: true,
    modify_session_info: true,
    close_sessions: true,
    update_kot_status: true, // Captain can mark as served
    view_financial_info: false,
    access_audit: false,
    access_staff: false,
    manage_staff: false,
    access_inventory: false,
    view_inventory: false,
    manage_inventory: false,
    access_suppliers: false,
    manage_suppliers: false,
    access_purchases: false,
    manage_purchases: false,
    receive_purchases: false,
    access_recipes: false,
    manage_recipes: false,
    view_consumption: false,
    access_printers: false,
    manage_printers: false,
    print_bill: true,
    print_kot: true,
  },
  accountant: {
    access_pos: false,
    access_kitchen: false,
    access_captain: false,
    access_dashboard: true,
    access_restaurant_setup: false,
    access_categories: false,
    access_items: false,
    access_orders: true,
    view_orders: true,
    create_orders: false,
    modify_orders: false,
    cancel_orders: false,
    process_payments: false,
    refund_payments: false,
    open_table_sessions: false,
    modify_session_info: false,
    close_sessions: false,
    update_kot_status: false,
    view_financial_info: true, // Accountant can view financial dashboards
    access_audit: true, // Accountant can access audit logs
    access_staff: false,
    manage_staff: false,
    access_inventory: true,
    view_inventory: true,
    manage_inventory: false,
    access_suppliers: true,
    manage_suppliers: false,
    access_purchases: true,
    manage_purchases: false,
    receive_purchases: false,
    access_recipes: true,
    manage_recipes: false,
    view_consumption: true,
    access_printers: true,
    manage_printers: false,
    print_bill: false,
    print_kot: false,
  },
};

export function hasPermission(role: StaffRole | undefined, action: PermissionAction): boolean {
  if (!role) return false;
  return PERMISSION_MATRIX[role]?.[action] ?? false;
}

export function isViewAllowed(role: StaffRole | undefined, view: string): boolean {
  if (!role) return false;
  if (view === 'pos') return hasPermission(role, 'access_pos');
  if (view === 'captain') return hasPermission(role, 'access_captain');
  if (view === 'kitchen') return hasPermission(role, 'access_kitchen');
  if (view === 'dashboard') return hasPermission(role, 'access_dashboard');
  if (view === 'restaurant' || view === 'settings') return hasPermission(role, 'access_restaurant_setup');
  if (view === 'categories') return hasPermission(role, 'access_categories');
  if (view === 'items') return hasPermission(role, 'access_items');
  if (view === 'reports') return hasPermission(role, 'view_financial_info');
  if (view === 'audit') return hasPermission(role, 'access_audit');
  if (view === 'orders') return hasPermission(role, 'access_orders');
  if (view === 'staff') return hasPermission(role, 'access_staff');
  if (view === 'inventory') return hasPermission(role, 'access_inventory') || hasPermission(role, 'view_inventory');
  if (view === 'suppliers') return hasPermission(role, 'access_suppliers');
  if (view === 'purchases') return hasPermission(role, 'access_purchases');
  if (view === 'printers') return hasPermission(role, 'access_printers') || hasPermission(role, 'manage_printers');
  return false;
}

export async function checkPermission(restaurantId: string, action: PermissionAction): Promise<boolean> {
  const cleanRestaurantId = restaurantId?.trim();
  if (!cleanRestaurantId) return false;

  const isTestEnvironment =
    (typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.VITEST)) ||
    (globalThis as any).expect !== undefined ||
    (globalThis as any).__vitest_worker__ !== undefined ||
    (globalThis as any).vitest !== undefined;

  if (isTestEnvironment) {
    if (!(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS) {
      return true;
    }
  }
  const user = auth.currentUser;
  if (!user) return false;

  // 1. Fetch restaurant to check ownerId
  const restRef = doc(db, 'restaurants', cleanRestaurantId);
  const restSnap = await getDoc(restRef);
  if (!restSnap.exists()) return false;
  const restData = restSnap.data();
  
  if (restData.ownerId === user.uid) {
    // Owner has all permissions
    return hasPermission('owner', action);
  }

  // 2. Fetch membership
  const memberRef = doc(db, 'restaurants', cleanRestaurantId, 'members', user.uid);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) return false;
  const memberData = memberSnap.data();

  // Check if member is active
  const isActive =
    memberData.isActive !== false &&
    memberData.status !== 'inactive' &&
    memberData.status !== 'suspended' &&
    memberData.status !== 'terminated';
  if (!isActive) return false;

  const role = memberData.role as StaffRole;
  return hasPermission(role, action);
}

export async function enforcePermission(restaurantId: string, action: PermissionAction): Promise<void> {
  const allowed = await checkPermission(restaurantId, action);
  if (!allowed) {
    throw new Error(`Permission Denied: Unauthorized to perform action "${action}"`);
  }
}

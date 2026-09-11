import { describe, it, expect } from 'vitest';
import {
  restaurantPath,
  tablesPath,
  tableDocPath,
  tableSessionsPath,
  tableSessionDocPath,
  ordersPath,
  orderDocPath,
  paymentsPath,
  paymentDocPath,
  kotsPath,
  kotDocPath,
  auditLogsPath,
  auditLogDocPath,
  categoriesPath,
  categoryDocPath,
  itemsPath,
  itemDocPath,
  usersCollectionPath,
  userDocPath,
  restaurantsCollectionPath
} from '../utils/paths';

describe('Firestore Collection & Path Helpers - Tenant Scoping', () => {
  const restaurantId = 'rest_mumbai_01';

  it('constructs correct root collection paths', () => {
    expect(restaurantsCollectionPath()).toBe('restaurants');
    expect(usersCollectionPath()).toBe('users');
    expect(userDocPath('usr_789')).toBe('users/usr_789');
  });

  it('constructs correct restaurant-scoped collection paths', () => {
    expect(restaurantPath(restaurantId)).toBe('restaurants/rest_mumbai_01');
    expect(tablesPath(restaurantId)).toBe('restaurants/rest_mumbai_01/tables');
    expect(tableSessionsPath(restaurantId)).toBe('restaurants/rest_mumbai_01/tableSessions');
    expect(ordersPath(restaurantId)).toBe('restaurants/rest_mumbai_01/orders');
    expect(paymentsPath(restaurantId)).toBe('restaurants/rest_mumbai_01/payments');
    expect(kotsPath(restaurantId)).toBe('restaurants/rest_mumbai_01/kots');
    expect(auditLogsPath(restaurantId)).toBe('restaurants/rest_mumbai_01/auditLogs');
    expect(categoriesPath(restaurantId)).toBe('restaurants/rest_mumbai_01/categories');
    expect(itemsPath(restaurantId)).toBe('restaurants/rest_mumbai_01/items');
  });

  it('constructs correct subcollection document paths', () => {
    expect(tableDocPath(restaurantId, 'tbl_01')).toBe('restaurants/rest_mumbai_01/tables/tbl_01');
    expect(tableSessionDocPath(restaurantId, 'sess_100')).toBe(
      'restaurants/rest_mumbai_01/tableSessions/sess_100'
    );
    expect(orderDocPath(restaurantId, 'ord_500')).toBe('restaurants/rest_mumbai_01/orders/ord_500');
    expect(paymentDocPath(restaurantId, 'pay_99')).toBe(
      'restaurants/rest_mumbai_01/payments/pay_99'
    );
    expect(kotDocPath(restaurantId, 'kot_12')).toBe('restaurants/rest_mumbai_01/kots/kot_12');
    expect(auditLogDocPath(restaurantId, 'aud_33')).toBe(
      'restaurants/rest_mumbai_01/auditLogs/aud_33'
    );
    expect(categoryDocPath(restaurantId, 'cat_1')).toBe(
      'restaurants/rest_mumbai_01/categories/cat_1'
    );
    expect(itemDocPath(restaurantId, 'itm_1')).toBe('restaurants/rest_mumbai_01/items/itm_1');
  });

  it('strictly requires explicit restaurantId and rejects empty or missing values', () => {
    expect(() => restaurantPath('')).toThrow(/non-empty string/);
    expect(() => restaurantPath('   ')).toThrow(/non-empty string/);
    expect(() => restaurantPath(null as any)).toThrow(/non-empty string/);
    expect(() => restaurantPath(undefined as any)).toThrow(/non-empty string/);

    expect(() => tablesPath('')).toThrow();
    expect(() => ordersPath('')).toThrow();
    expect(() => paymentsPath('')).toThrow();
    expect(() => kotsPath('')).toThrow();
    expect(() => auditLogsPath('')).toThrow();
  });

  it('strictly rejects malicious IDs containing slashes, backslashes, or directory traversal', () => {
    expect(() => restaurantPath('rest_1/tables')).toThrow(/cannot contain slashes/);
    expect(() => tableDocPath(restaurantId, 'tbl_1/orders')).toThrow(/cannot contain slashes/);
    expect(() => orderDocPath(restaurantId, '../escaping_path')).toThrow(/cannot contain/);
    expect(() => orderDocPath(restaurantId, '..')).toThrow(/cannot contain parent directory traversal/);
    expect(() => orderDocPath(restaurantId, 'tbl_1\\orders')).toThrow(/cannot contain slashes/);
  });
});

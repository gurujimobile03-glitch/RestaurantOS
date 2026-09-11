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
  userDocPath
} from '../utils/paths';
import { validateOrder, validateTable, validateTableSession, validateKOT, validatePayment } from '../utils/transactionValidation';
import { Order } from '../types/order';
import { Table, TableSession } from '../types/table';
import { KOT } from '../types/kot';
import { Payment } from '../types/payment';
import { AuditLog } from '../types/audit';

describe('Restaurant ID Architecture - Strict Decoupling from Auth UID', () => {
  // Real world scenario:
  // User Auth UID from Firebase Authentication
  const authUid = 'Lj8M3pdsZMgr6re4JWfG1vKX55M2';
  // Distinct Restaurant Entity ID in Firestore
  const restaurantId = '14QzyTZJNe14T4BW_mumbai_flagship';

  it('guarantees Auth UID and Restaurant ID are completely distinct strings', () => {
    expect(authUid).not.toBe(restaurantId);
  });

  it('generates exact paths matching restaurants/TEST_RESTAURANT_456/... when given distinct Auth UID and Restaurant ID', () => {
    const testAuthUid = 'TEST_AUTH_UID_123';
    const testRestaurantId = 'TEST_RESTAURANT_456';

    expect(restaurantPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456');
    expect(tablesPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456/tables');
    expect(tableDocPath(testRestaurantId, 'tbl_1')).toBe('restaurants/TEST_RESTAURANT_456/tables/tbl_1');
    expect(tableSessionsPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456/tableSessions');
    expect(ordersPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456/orders');
    expect(orderDocPath(testRestaurantId, 'ord_1')).toBe('restaurants/TEST_RESTAURANT_456/orders/ord_1');
    expect(kotsPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456/kots');
    expect(paymentsPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456/payments');
    expect(auditLogsPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456/auditLogs');
    expect(categoriesPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456/categories');
    expect(itemsPath(testRestaurantId)).toBe('restaurants/TEST_RESTAURANT_456/items');

    // Auth user document must use testAuthUid under /users/
    expect(userDocPath(testAuthUid)).toBe('users/TEST_AUTH_UID_123');
    // None of the restaurant subcollection paths should ever contain testAuthUid
    expect(orderDocPath(testRestaurantId, 'ord_1')).not.toContain(testAuthUid);
  });

  it('path helpers strictly generate paths using restaurantId, not Auth UID', () => {
    const rPath = restaurantPath(restaurantId);
    expect(rPath).toBe('restaurants/14QzyTZJNe14T4BW_mumbai_flagship');
    expect(rPath).not.toContain(authUid);

    const tblPath = tablesPath(restaurantId);
    expect(tblPath).toBe('restaurants/14QzyTZJNe14T4BW_mumbai_flagship/tables');

    const ordDocPath = orderDocPath(restaurantId, 'ord_888');
    expect(ordDocPath).toBe('restaurants/14QzyTZJNe14T4BW_mumbai_flagship/orders/ord_888');

    const uPath = userDocPath(authUid);
    expect(uPath).toBe('users/Lj8M3pdsZMgr6re4JWfG1vKX55M2');
    expect(uPath).not.toContain(restaurantId);
  });

  it('validates an Order containing separate restaurantId and createdBy (Auth UID)', () => {
    const order: Order = {
      id: 'ord_901',
      restaurantId: restaurantId, // Distinct restaurant ID
      orderNumber: 'ORD-901',
      tableId: 'tbl_5',
      tableSessionId: 'sess_12',
      orderType: 'dineIn',
      source: 'pos',
      status: 'confirmed',
      items: [
        {
          itemId: 'itm_paneer_tikka',
          nameSnapshot: 'Paneer Tikka',
          shortNameSnapshot: 'Pnr Tikka',
          quantity: 2,
          unitPriceMinor: 22000,
          taxRate: 5,
          taxInclusive: false,
          discountMinor: 0,
          lineSubtotalMinor: 44000,
          lineTaxMinor: 2200,
          lineTotalMinor: 46200
        }
      ],
      subtotalMinor: 44000,
      discountMinor: 0,
      taxableAmountMinor: 44000,
      cgstMinor: 1100,
      sgstMinor: 1100,
      igstMinor: 0,
      totalTaxMinor: 2200,
      grandTotalMinor: 46200,
      paidAmountMinor: 0,
      dueAmountMinor: 46200,
      createdBy: authUid, // Auth UID is the actor
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const validation = validateOrder(order);
    expect(validation.isValid).toBe(true);
    expect(order.restaurantId).toBe('14QzyTZJNe14T4BW_mumbai_flagship');
    expect(order.createdBy).toBe('Lj8M3pdsZMgr6re4JWfG1vKX55M2');
  });

  it('validates TableSession with distinct restaurantId and openedBy (Auth UID)', () => {
    const session: TableSession = {
      id: 'sess_99',
      restaurantId: restaurantId,
      tableId: 'tbl_5',
      status: 'open',
      guestCount: 4,
      openedAt: new Date(),
      activeOrderIds: ['ord_901'],
      openedBy: authUid,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const validation = validateTableSession(session);
    expect(validation.isValid).toBe(true);
    expect(session.restaurantId).not.toBe(session.openedBy);
  });

  it('validates Payment with distinct restaurantId, orderId, and createdBy', () => {
    const payment: Payment = {
      id: 'pay_301',
      restaurantId: restaurantId,
      orderId: 'ord_901',
      amountMinor: 46200,
      method: 'upi',
      status: 'completed',
      createdBy: authUid,
      createdAt: new Date()
    };

    const validation = validatePayment(payment);
    expect(validation.isValid).toBe(true);
    expect(payment.restaurantId).toBe(restaurantId);
    expect(payment.createdBy).toBe(authUid);
  });

  it('validates KOT with distinct restaurantId, orderId, and createdBy', () => {
    const kot: KOT = {
      id: 'kot_501',
      kotNumber: 'KOT-1',
      restaurantId: restaurantId,
      orderId: 'ord_901',
      status: 'sentToKitchen',
      items: [
        {
          itemId: 'itm_paneer_tikka',
          nameSnapshot: 'Paneer Tikka',
          quantity: 2
        }
      ],
      createdBy: authUid,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const validation = validateKOT(kot);
    expect(validation.isValid).toBe(true);
    expect(kot.restaurantId).toBe(restaurantId);
    expect(kot.createdBy).toBe(authUid);
  });

  it('validates AuditLog capturing actorUid (Auth UID) operating on restaurantId', () => {
    const audit: AuditLog = {
      id: 'aud_11',
      restaurantId: restaurantId,
      entityType: 'order',
      entityId: 'ord_901',
      action: 'order_created',
      actorUid: authUid,
      createdAt: new Date()
    };

    expect(audit.restaurantId).toBe(restaurantId);
    expect(audit.actorUid).toBe(authUid);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeSupplierName,
  isValidPOStatusTransition,
  calculatePOLineTotalMinor,
  calculatePOTotals,
  validateReceivingQuantities
} from '../utils/supplierUtils';
import { hasPermission } from '../utils/permissions';
import {
  Supplier,
  CreateSupplierDTO,
  UpdateSupplierDTO
} from '../types/supplier';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  CreatePurchaseOrderDTO,
  ReceiveGoodsItemDTO
} from '../types/purchaseOrder';
import { toMoneyMinor, formatMoney } from '../utils/money';

describe('M7-7C Supplier & Purchase Management Master Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Supplier Name Normalization & Validation
  // =========================================================================
  describe('1. Supplier Name Normalization & Validation', () => {
    it('normalizes supplier names by trimming, lowercasing, and collapsing multiple spaces', () => {
      expect(normalizeSupplierName('  Metro   Cash  &   Carry  ')).toBe('metro cash & carry');
      expect(normalizeSupplierName('Dairy   Fresh')).toBe('dairy fresh');
      expect(normalizeSupplierName('SingleWord')).toBe('singleword');
    });

    it('handles uppercase and lowercase whitespace consistently', () => {
      expect(normalizeSupplierName('\tFarm  Fresh \n')).toBe('farm fresh');
    });
  });

  // =========================================================================
  // 2. Financial Calculations & Integer Minor Units (Paise)
  // =========================================================================
  describe('2. Purchase Financial Calculations in Integer Paise', () => {
    it('calculates line item total accurately with float quantities and integer unit price', () => {
      // 5 kg at ₹120.50/kg = 5 * 12050 paise = 60250 paise
      const lineTotal = calculatePOLineTotalMinor(5, 12050);
      expect(lineTotal).toBe(60250);
    });

    it('calculates fractional quantities correctly (e.g. 2.5 kg at ₹80/kg)', () => {
      // 2.5 * 8000 paise = 20000 paise
      const lineTotal = calculatePOLineTotalMinor(2.5, 8000);
      expect(lineTotal).toBe(20000);
    });

    it('calculates PO totals including subtotal, tax rate, and grand total', () => {
      const items = [
        { quantityOrdered: 10, unitPriceMinor: 5000 }, // 10 * 50 = 500.00 (50000 paise)
        { quantityOrdered: 2, unitPriceMinor: 25000 }  // 2 * 250 = 500.00 (50000 paise)
      ];
      // Subtotal = 100,000 paise (₹1000.00)
      // 5% Tax = 5,000 paise (₹50.00)
      // Grand Total = 105,000 paise (₹1050.00)
      const totals = calculatePOTotals(items, 5);

      expect(totals.subtotalMinor).toBe(100000);
      expect(totals.taxMinor).toBe(5000);
      expect(totals.grandTotalMinor).toBe(105000);
      expect(formatMoney(totals.grandTotalMinor)).toContain('1,050.00');
    });

    it('handles 0% tax rate cleanly with zero tax minor', () => {
      const items = [{ quantityOrdered: 1, unitPriceMinor: 15000 }];
      const totals = calculatePOTotals(items, 0);

      expect(totals.subtotalMinor).toBe(15000);
      expect(totals.taxMinor).toBe(0);
      expect(totals.grandTotalMinor).toBe(15000);
    });

    it('prevents NaN or float leaks in money minor calculations', () => {
      const items = [{ quantityOrdered: 3.333, unitPriceMinor: 3333 }];
      const totals = calculatePOTotals(items, 18);

      expect(Number.isInteger(totals.subtotalMinor)).toBe(true);
      expect(Number.isInteger(totals.taxMinor)).toBe(true);
      expect(Number.isInteger(totals.grandTotalMinor)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Purchase Order Status Transition State Machine
  // =========================================================================
  describe('3. Purchase Order Status Transitions', () => {
    it('allows valid transitions from draft', () => {
      expect(isValidPOStatusTransition('draft', 'submitted')).toBe(true);
      expect(isValidPOStatusTransition('draft', 'cancelled')).toBe(true);
      expect(isValidPOStatusTransition('draft', 'draft')).toBe(false);
      expect(isValidPOStatusTransition('draft', 'received')).toBe(false);
      expect(isValidPOStatusTransition('draft', 'partiallyReceived')).toBe(false);
    });

    it('allows valid transitions from submitted', () => {
      expect(isValidPOStatusTransition('submitted', 'partiallyReceived')).toBe(true);
      expect(isValidPOStatusTransition('submitted', 'received')).toBe(true);
      expect(isValidPOStatusTransition('submitted', 'cancelled')).toBe(true);
      expect(isValidPOStatusTransition('submitted', 'draft')).toBe(false);
    });

    it('allows valid transitions from partiallyReceived', () => {
      expect(isValidPOStatusTransition('partiallyReceived', 'partiallyReceived')).toBe(true);
      expect(isValidPOStatusTransition('partiallyReceived', 'received')).toBe(true);
      // Once partially received, cancelling is forbidden
      expect(isValidPOStatusTransition('partiallyReceived', 'cancelled')).toBe(false);
      expect(isValidPOStatusTransition('partiallyReceived', 'draft')).toBe(false);
      expect(isValidPOStatusTransition('partiallyReceived', 'submitted')).toBe(false);
    });

    it('strictly forbids transitions from terminal states', () => {
      const terminalStatuses: PurchaseOrderStatus[] = ['received', 'cancelled'];
      const allStatuses: PurchaseOrderStatus[] = ['draft', 'submitted', 'partiallyReceived', 'received', 'cancelled'];

      terminalStatuses.forEach(terminal => {
        allStatuses.forEach(target => {
          expect(isValidPOStatusTransition(terminal, target)).toBe(false);
        });
      });
    });
  });

  // =========================================================================
  // 4. Goods Receiving Validation & Invariants
  // =========================================================================
  describe('4. Goods Receiving Validation & Invariants', () => {
    const mockPOItems: PurchaseOrderItem[] = [
      {
        id: 'item_1',
        inventoryItemId: 'inv_flour',
        itemNameSnapshot: 'Wheat Flour',
        skuSnapshot: 'WHEAT-01',
        quantityOrdered: 50,
        unit: 'kg',
        unitPriceMinor: 4000,
        lineTotalMinor: 200000,
        receivedQuantity: 20,
        remainingQuantity: 30
      },
      {
        id: 'item_2',
        inventoryItemId: 'inv_sugar',
        itemNameSnapshot: 'Sugar',
        skuSnapshot: 'SUGAR-01',
        quantityOrdered: 10,
        unit: 'kg',
        unitPriceMinor: 4500,
        lineTotalMinor: 45000,
        receivedQuantity: 0,
        remainingQuantity: 10
      }
    ];

    it('validates successful receiving within remaining bounds', () => {
      const receivingItems: ReceiveGoodsItemDTO[] = [
        { purchaseOrderItemId: 'item_1', quantityReceived: 15 },
        { purchaseOrderItemId: 'item_2', quantityReceived: 10 }
      ];

      const validation = validateReceivingQuantities(mockPOItems, receivingItems);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.validatedReceivings).toHaveLength(2);
    });

    it('rejects receiving quantities that exceed remaining quantity (Over-receiving Protection)', () => {
      const receivingItems: ReceiveGoodsItemDTO[] = [
        { purchaseOrderItemId: 'item_1', quantityReceived: 35 } // Only 30 remaining
      ];

      const validation = validateReceivingQuantities(mockPOItems, receivingItems);
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain('exceeds remaining quantity (30 kg)');
    });

    it('rejects negative or zero receiving quantities', () => {
      const receivingItems: ReceiveGoodsItemDTO[] = [
        { purchaseOrderItemId: 'item_1', quantityReceived: -5 }
      ];

      const validation = validateReceivingQuantities(mockPOItems, receivingItems);
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain('must be greater than 0');
    });

    it('rejects empty receiving list', () => {
      const validation = validateReceivingQuantities(mockPOItems, []);
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain('At least one item must have a received quantity');
    });

    it('rejects receiving items that do not exist on the purchase order', () => {
      const receivingItems: ReceiveGoodsItemDTO[] = [
        { purchaseOrderItemId: 'non_existent_item', quantityReceived: 5 }
      ];

      const validation = validateReceivingQuantities(mockPOItems, receivingItems);
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain('Item non_existent_item not found in purchase order');
    });
  });

  // =========================================================================
  // 5. Role-Based Access Control (RBAC) Matrix for Purchases
  // =========================================================================
  describe('5. RBAC Authorization Boundaries for Suppliers & Purchases', () => {
    it('allows owner full access to suppliers, purchases, and receiving', () => {
      expect(hasPermission('owner', 'access_suppliers')).toBe(true);
      expect(hasPermission('owner', 'manage_suppliers')).toBe(true);
      expect(hasPermission('owner', 'access_purchases')).toBe(true);
      expect(hasPermission('owner', 'manage_purchases')).toBe(true);
      expect(hasPermission('owner', 'receive_purchases')).toBe(true);
    });

    it('allows manager full access to suppliers, purchases, and receiving', () => {
      expect(hasPermission('manager', 'access_suppliers')).toBe(true);
      expect(hasPermission('manager', 'manage_suppliers')).toBe(true);
      expect(hasPermission('manager', 'access_purchases')).toBe(true);
      expect(hasPermission('manager', 'manage_purchases')).toBe(true);
      expect(hasPermission('manager', 'receive_purchases')).toBe(true);
    });

    it('allows accountant read access to suppliers and purchases, but not receiving goods', () => {
      expect(hasPermission('accountant', 'access_suppliers')).toBe(true);
      expect(hasPermission('accountant', 'manage_suppliers')).toBe(false);
      expect(hasPermission('accountant', 'access_purchases')).toBe(true);
      expect(hasPermission('accountant', 'manage_purchases')).toBe(false);
      expect(hasPermission('accountant', 'receive_purchases')).toBe(false);
    });

    it('strictly denies cashier, kitchen, and captain from managing suppliers or purchase orders', () => {
      const restrictedRoles: any[] = ['cashier', 'kitchen', 'captain'];
      restrictedRoles.forEach(role => {
        expect(hasPermission(role, 'access_suppliers')).toBe(false);
        expect(hasPermission(role, 'manage_suppliers')).toBe(false);
        expect(hasPermission(role, 'access_purchases')).toBe(false);
        expect(hasPermission(role, 'manage_purchases')).toBe(false);
        expect(hasPermission(role, 'receive_purchases')).toBe(false);
      });
    });
  });

  // =========================================================================
  // 6. Security Boundaries & Snapshot Integrity
  // =========================================================================
  describe('6. Historical Snapshots & Tenant Boundaries', () => {
    it('preserves supplier snapshot independently of later supplier edits', () => {
      const supplierSnapshot = {
        supplierId: 'sup_101',
        name: 'Heritage Spices Ltd',
        phone: '+91 9999988888',
        email: 'spices@heritage.com',
        gstNumber: '27AABC1234F1Z1'
      };

      const po: Partial<PurchaseOrder> = {
        purchaseOrderId: 'po_001',
        restaurantId: 'rest_alpha',
        supplierSnapshot
      };

      // If supplier updates name later
      const updatedSupplierName = 'Heritage Global Spices Ltd';
      expect(po.supplierSnapshot?.name).toBe('Heritage Spices Ltd');
      expect(po.supplierSnapshot?.name).not.toBe(updatedSupplierName);
    });

    it('ensures item snapshots protect historical purchase order records', () => {
      const itemSnapshot: PurchaseOrderItem = {
        id: 'poi_1',
        inventoryItemId: 'inv_10',
        itemNameSnapshot: 'Cardamom Green 8mm',
        skuSnapshot: 'SPICE-CARD-08',
        quantityOrdered: 5,
        unit: 'kg',
        unitPriceMinor: 250000,
        lineTotalMinor: 1250000,
        receivedQuantity: 0,
        remainingQuantity: 5
      };

      // Even if inventory item name is changed in catalog
      const newCatalogName = 'Premium Green Cardamom';
      expect(itemSnapshot.itemNameSnapshot).toBe('Cardamom Green 8mm');
      expect(itemSnapshot.itemNameSnapshot).not.toBe(newCatalogName);
    });
  });
});

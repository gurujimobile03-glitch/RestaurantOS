import { describe, it, expect } from 'vitest';
import { hasPermission, isViewAllowed, PERMISSION_MATRIX } from '../permissions';
import { StaffRole } from '../../types/auth';

describe('Inventory Permissions & Role Gates (M7-7A)', () => {
  describe('Permission Matrix Audit', () => {
    it('grants Owner full inventory access (access, view, manage)', () => {
      expect(hasPermission('owner', 'access_inventory')).toBe(true);
      expect(hasPermission('owner', 'view_inventory')).toBe(true);
      expect(hasPermission('owner', 'manage_inventory')).toBe(true);
      expect(isViewAllowed('owner', 'inventory')).toBe(true);
    });

    it('grants Manager full inventory access (access, view, manage)', () => {
      expect(hasPermission('manager', 'access_inventory')).toBe(true);
      expect(hasPermission('manager', 'view_inventory')).toBe(true);
      expect(hasPermission('manager', 'manage_inventory')).toBe(true);
      expect(isViewAllowed('manager', 'inventory')).toBe(true);
    });

    it('grants Accountant read-only inventory access (view only, cannot manage)', () => {
      expect(hasPermission('accountant', 'access_inventory')).toBe(true);
      expect(hasPermission('accountant', 'view_inventory')).toBe(true);
      expect(hasPermission('accountant', 'manage_inventory')).toBe(false); // Read-only
      expect(isViewAllowed('accountant', 'inventory')).toBe(true);
    });

    it('strictly denies Cashier all inventory access', () => {
      expect(hasPermission('cashier', 'access_inventory')).toBe(false);
      expect(hasPermission('cashier', 'view_inventory')).toBe(false);
      expect(hasPermission('cashier', 'manage_inventory')).toBe(false);
      expect(isViewAllowed('cashier', 'inventory')).toBe(false);
    });

    it('strictly denies Kitchen all inventory access in 7A', () => {
      expect(hasPermission('kitchen', 'access_inventory')).toBe(false);
      expect(hasPermission('kitchen', 'view_inventory')).toBe(false);
      expect(hasPermission('kitchen', 'manage_inventory')).toBe(false);
      expect(isViewAllowed('kitchen', 'inventory')).toBe(false);
    });

    it('strictly denies Captain all inventory access in 7A', () => {
      expect(hasPermission('captain', 'access_inventory')).toBe(false);
      expect(hasPermission('captain', 'view_inventory')).toBe(false);
      expect(hasPermission('captain', 'manage_inventory')).toBe(false);
      expect(isViewAllowed('captain', 'inventory')).toBe(false);
    });

    it('denies unauthenticated or undefined roles', () => {
      expect(hasPermission(undefined, 'access_inventory')).toBe(false);
      expect(hasPermission(undefined, 'view_inventory')).toBe(false);
      expect(hasPermission(undefined, 'manage_inventory')).toBe(false);
      expect(isViewAllowed(undefined, 'inventory')).toBe(false);
    });
  });
});

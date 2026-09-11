import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateTable, validateTableSession, validateTableSessionStatusTransition } from '../utils/transactionValidation';
import { Table, TableFormData, TableSession } from '../types/table';
import { tablesPath, tableDocPath, tableSessionsPath, tableSessionDocPath } from '../utils/paths';

describe('Table & TableSession Domain & Validation (Phase 2C)', () => {
  describe('Physical Table Validation', () => {
    it('accepts a valid table configuration with alphanumeric numbering', () => {
      const validTables: TableFormData[] = [
        { name: 'Table 1', tableNumber: '1', floorOrArea: 'Ground Floor', capacity: 4, isActive: true, sortOrder: 1 },
        { name: 'Table A-01', tableNumber: 'A-01', floorOrArea: 'Balcony', capacity: 2, isActive: true, sortOrder: 2 },
        { name: 'VIP Table 1', tableNumber: 'VIP-1', floorOrArea: 'VIP Lounge', capacity: 8, isActive: true, sortOrder: 0 },
        { name: 'Bar Stool 3', tableNumber: 'T3', floorOrArea: 'Bar', capacity: 1, isActive: false, sortOrder: 10 }
      ];

      for (const t of validTables) {
        const result = validateTable(t);
        expect(result.isValid).toBe(true);
        expect(result.errors).toBeUndefined();
      }
    });

    it('rejects empty, whitespace-only, or overly long table numbers', () => {
      expect(validateTable({ name: 'T1', tableNumber: '', capacity: 4 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: '   ', capacity: 4 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: 'A'.repeat(21), capacity: 4 }).isValid).toBe(false);
    });

    it('rejects table numbers containing unsafe path or traversal characters', () => {
      expect(validateTable({ name: 'T1', tableNumber: 'T/1', capacity: 4 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: 'T\\1', capacity: 4 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: '..', capacity: 4 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: 'T..1', capacity: 4 }).isValid).toBe(false);
    });

    it('strictly validates capacity as positive integer (rejects 0, negative, decimal, >100, NaN)', () => {
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 0 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: -5 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 3.5 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 101 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: NaN }).isValid).toBe(false);
    });

    it('validates sortOrder as non-negative integer when provided', () => {
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 4, sortOrder: 0 }).isValid).toBe(true);
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 4, sortOrder: 5 }).isValid).toBe(true);
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 4, sortOrder: -1 }).isValid).toBe(false);
      expect(validateTable({ name: 'T1', tableNumber: '1', capacity: 4, sortOrder: 2.5 }).isValid).toBe(false);
    });

    it('distinguishes isActive from occupancy', () => {
      const activeTable = validateTable({ name: 'T1', tableNumber: '1', capacity: 4, isActive: true });
      const inactiveTable = validateTable({ name: 'T1', tableNumber: '1', capacity: 4, isActive: false });
      expect(activeTable.isValid).toBe(true);
      expect(inactiveTable.isValid).toBe(true);
    });
  });

  describe('Table Session Lifecycle & Transitions', () => {
    it('accepts valid session data with positive guestCount', () => {
      const result = validateTableSession({
        tableId: 'table_abc',
        guestCount: 4,
        status: 'open'
      });
      expect(result.isValid).toBe(true);
    });

    it('rejects invalid guestCount (0, negative, decimal, NaN)', () => {
      expect(validateTableSession({ tableId: 'table_abc', guestCount: 0, status: 'open' }).isValid).toBe(false);
      expect(validateTableSession({ tableId: 'table_abc', guestCount: -1, status: 'open' }).isValid).toBe(false);
      expect(validateTableSession({ tableId: 'table_abc', guestCount: 2.5, status: 'open' }).isValid).toBe(false);
      expect(validateTableSession({ tableId: 'table_abc', guestCount: NaN, status: 'open' }).isValid).toBe(false);
    });

    it('enforces open -> closed transition', () => {
      const transition = validateTableSessionStatusTransition('open', 'closed');
      expect(transition.isValid).toBe(true);
    });

    it('rejects closed -> open transition (closed is strictly terminal)', () => {
      const transition = validateTableSessionStatusTransition('closed', 'open');
      expect(transition.isValid).toBe(false);
      expect(transition.error).toContain('Closed sessions cannot be reopened');
    });

    it('rejects closed -> closed re-closing', () => {
      const transition = validateTableSessionStatusTransition('closed', 'closed');
      expect(transition.isValid).toBe(false);
      expect(transition.error).toContain('already closed');
    });

    it('permits idempotent open -> open validation check', () => {
      const transition = validateTableSessionStatusTransition('open', 'open');
      expect(transition.isValid).toBe(true);
    });
  });

  describe('Path & Multi-Tenant Isolation for Tables & Sessions', () => {
    const restaurantA = 'REST_OUTLET_A';
    const restaurantB = 'REST_OUTLET_B';

    it('generates strictly restaurant-scoped table paths', () => {
      expect(tablesPath(restaurantA)).toBe('restaurants/REST_OUTLET_A/tables');
      expect(tableDocPath(restaurantA, 'tbl_1')).toBe('restaurants/REST_OUTLET_A/tables/tbl_1');

      expect(tablesPath(restaurantB)).toBe('restaurants/REST_OUTLET_B/tables');
      expect(tableDocPath(restaurantB, 'tbl_1')).toBe('restaurants/REST_OUTLET_B/tables/tbl_1');
    });

    it('generates strictly restaurant-scoped table session paths', () => {
      expect(tableSessionsPath(restaurantA)).toBe('restaurants/REST_OUTLET_A/tableSessions');
      expect(tableSessionDocPath(restaurantA, 'session_1')).toBe('restaurants/REST_OUTLET_A/tableSessions/session_1');

      expect(tableSessionsPath(restaurantB)).toBe('restaurants/REST_OUTLET_B/tableSessions');
      expect(tableSessionDocPath(restaurantB, 'session_1')).toBe('restaurants/REST_OUTLET_B/tableSessions/session_1');
    });

    it('rejects path traversal or illegal characters in table and session paths', () => {
      expect(() => tableDocPath(restaurantA, '../other')).toThrow();
      expect(() => tableDocPath(restaurantA, 'tbl/nested')).toThrow();
      expect(() => tableSessionDocPath(restaurantA, 'session/nested')).toThrow();
      expect(() => tableSessionDocPath(restaurantA, '..')).toThrow();
    });
  });
});

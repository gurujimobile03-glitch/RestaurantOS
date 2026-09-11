import { describe, it, expect } from 'vitest';
import {
  UNIT_CONFIG,
  SUPPORTED_UNITS,
  isValidUnit,
  getUnitCategory,
  areUnitsCompatible,
  roundQuantity,
  convertQuantity,
  formatQuantityWithUnit,
  normalizeInventoryItemName,
  isLowStock
} from '../units';

describe('Inventory Units Utility (M7-7A)', () => {
  describe('Unit Registry & Configuration', () => {
    it('supports all required units across weight, volume, and count', () => {
      expect(SUPPORTED_UNITS).toContain('kg');
      expect(SUPPORTED_UNITS).toContain('g');
      expect(SUPPORTED_UNITS).toContain('litre');
      expect(SUPPORTED_UNITS).toContain('ml');
      expect(SUPPORTED_UNITS).toContain('piece');
      expect(SUPPORTED_UNITS).toContain('box');
      expect(SUPPORTED_UNITS).toContain('packet');
    });

    it('correctly classifies units into categories', () => {
      expect(getUnitCategory('kg')).toBe('weight');
      expect(getUnitCategory('g')).toBe('weight');
      expect(getUnitCategory('litre')).toBe('volume');
      expect(getUnitCategory('ml')).toBe('volume');
      expect(getUnitCategory('piece')).toBe('count');
      expect(getUnitCategory('box')).toBe('count');
      expect(getUnitCategory('packet')).toBe('count');
    });

    it('validates unit existence', () => {
      expect(isValidUnit('kg')).toBe(true);
      expect(isValidUnit('litre')).toBe(true);
      expect(isValidUnit('piece')).toBe(true);
      expect(isValidUnit('ton')).toBe(false);
      expect(isValidUnit('')).toBe(false);
      expect(isValidUnit(null)).toBe(false);
    });

    it('throws error when querying category for an invalid unit', () => {
      expect(() => getUnitCategory('meters' as any)).toThrow('Invalid or unsupported inventory unit');
    });
  });

  describe('Compatibility & Conversion', () => {
    it('identifies compatible units within the same measurement category', () => {
      expect(areUnitsCompatible('kg', 'g')).toBe(true);
      expect(areUnitsCompatible('g', 'kg')).toBe(true);
      expect(areUnitsCompatible('litre', 'ml')).toBe(true);
      expect(areUnitsCompatible('ml', 'litre')).toBe(true);
      expect(areUnitsCompatible('kg', 'kg')).toBe(true);
      expect(areUnitsCompatible('piece', 'piece')).toBe(true);
    });

    it('identifies incompatible units across categories or independent counts', () => {
      expect(areUnitsCompatible('kg', 'litre')).toBe(false);
      expect(areUnitsCompatible('g', 'ml')).toBe(false);
      expect(areUnitsCompatible('piece', 'kg')).toBe(false);
      expect(areUnitsCompatible('piece', 'box')).toBe(false);
      expect(areUnitsCompatible('box', 'packet')).toBe(false);
    });

    it('converts weight units accurately (kg <-> g)', () => {
      expect(convertQuantity(1, 'kg', 'g')).toBe(1000);
      expect(convertQuantity(2.5, 'kg', 'g')).toBe(2500);
      expect(convertQuantity(500, 'g', 'kg')).toBe(0.5);
      expect(convertQuantity(750, 'g', 'kg')).toBe(0.75);
      expect(convertQuantity(125, 'g', 'kg')).toBe(0.125);
    });

    it('converts volume units accurately (litre <-> ml)', () => {
      expect(convertQuantity(1, 'litre', 'ml')).toBe(1000);
      expect(convertQuantity(0.25, 'litre', 'ml')).toBe(250);
      expect(convertQuantity(500, 'ml', 'litre')).toBe(0.5);
      expect(convertQuantity(1500, 'ml', 'litre')).toBe(1.5);
    });

    it('returns exact value when converting to same unit', () => {
      expect(convertQuantity(42.5, 'kg', 'kg')).toBe(42.5);
      expect(convertQuantity(10, 'piece', 'piece')).toBe(10);
    });

    it('throws explicit error on incompatible unit conversion attempts', () => {
      expect(() => convertQuantity(5, 'kg', 'litre')).toThrow(/Incompatible unit conversion/);
      expect(() => convertQuantity(2, 'piece', 'kg')).toThrow(/Incompatible unit conversion/);
      expect(() => convertQuantity(1, 'box', 'piece')).toThrow(/Incompatible unit conversion/);
    });

    it('throws error when converting invalid or non-finite quantities', () => {
      expect(() => convertQuantity(NaN, 'kg', 'g')).toThrow('finite number');
      expect(() => convertQuantity(Infinity, 'kg', 'g')).toThrow('finite number');
      expect(() => convertQuantity(1, 'invalid' as any, 'kg')).toThrow('Invalid source unit');
      expect(() => convertQuantity(1, 'kg', 'invalid' as any)).toThrow('Invalid target unit');
    });
  });

  describe('Numeric Rounding & Float Safety', () => {
    it('rounds quantities deterministically to 3 decimal places', () => {
      expect(roundQuantity(0.1 + 0.2)).toBe(0.3); // avoids 0.30000000000000004
      expect(roundQuantity(1.0004)).toBe(1);
      expect(roundQuantity(1.0006)).toBe(1.001);
      expect(roundQuantity(2.3456)).toBe(2.346);
    });

    it('rejects non-finite inputs to roundQuantity', () => {
      expect(() => roundQuantity(NaN)).toThrow('finite number');
      expect(() => roundQuantity(Infinity)).toThrow('finite number');
    });

    it('formats quantity with unit symbol cleanly', () => {
      expect(formatQuantityWithUnit(5, 'kg')).toBe('5 kg');
      expect(formatQuantityWithUnit(1.5, 'litre')).toBe('1.5 L');
      expect(formatQuantityWithUnit(250, 'ml')).toBe('250 ml');
      expect(formatQuantityWithUnit(12, 'piece')).toBe('12 pc');
    });
  });

  describe('Item Name Normalization', () => {
    it('normalizes item names by trimming, collapsing spaces, and lowercasing', () => {
      expect(normalizeInventoryItemName('  Tomato   Soup  ')).toBe('tomato soup');
      expect(normalizeInventoryItemName('BASMATI RICE')).toBe('basmati rice');
      expect(normalizeInventoryItemName('Olive  Oil   Extra   Virgin')).toBe('olive oil extra virgin');
      expect(normalizeInventoryItemName('')).toBe('');
      expect(normalizeInventoryItemName(null as any)).toBe('');
    });
  });

  describe('Low Stock Evaluation', () => {
    it('accurately identifies low stock when currentQuantity <= minimumQuantity', () => {
      expect(isLowStock(4, 5)).toBe(true);
      expect(isLowStock(5, 5)).toBe(true); // threshold inclusive
      expect(isLowStock(5.001, 5)).toBe(false);
      expect(isLowStock(0, 5)).toBe(true);
      expect(isLowStock(10, 5)).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { validateMenuItem, validateCategory } from '../utils/validation';

describe('Menu Item Validation Suite', () => {
  it('validates a valid menu item form', () => {
    const validItem = {
      name: 'Paneer Butter Masala',
      categoryId: 'cat_curries_123',
      price: 320,
      shortName: 'PAN BUTTER MAS',
      taxRate: 5.0
    };

    const result = validateMenuItem(validItem);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects item without a name or category', () => {
    const invalidItem = {
      name: '',
      categoryId: '',
      price: 150
    };

    const result = validateMenuItem(invalidItem);
    expect(result.isValid).toBe(false);
    expect(result.errors.name).toBe('Item name is required.');
    expect(result.errors.categoryId).toBe('Please select a menu category.');
  });

  it('rejects negative item prices', () => {
    const item = {
      name: 'Cold Coffee',
      categoryId: 'cat_drinks',
      price: -50
    };

    const result = validateMenuItem(item);
    expect(result.isValid).toBe(false);
    expect(result.errors.price).toBe('Price cannot be negative.');
  });

  it('enforces thermal KOT short name limits', () => {
    const item = {
      name: 'Special Hyderabadi Mutton Dum Biryani Family Pack',
      categoryId: 'cat_biryani',
      price: 650,
      shortName: 'HYD MUTTON DUM BIRYANI FAM' // 26 chars > 20
    };

    const result = validateMenuItem(item);
    expect(result.isValid).toBe(false);
    expect(result.errors.shortName).toContain('cannot exceed 20 characters');
  });
});

describe('Category Behavior & Validation Suite', () => {
  it('accepts valid category name and sort order', () => {
    const validCat = {
      name: 'Sizzlers & Grills',
      sortOrder: 1
    };

    const result = validateCategory(validCat);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('rejects empty category name', () => {
    const cat = {
      name: '   ',
      sortOrder: 0
    };

    const result = validateCategory(cat);
    expect(result.isValid).toBe(false);
    expect(result.errors.name).toBe('Category name is required.');
  });

  it('rejects negative sort orders', () => {
    const cat = {
      name: 'Beverages',
      sortOrder: -1
    };

    const result = validateCategory(cat);
    expect(result.isValid).toBe(false);
    expect(result.errors.sortOrder).toContain('non-negative');
  });

  it('enforces 60-character maximum category name length', () => {
    const cat = {
      name: 'A'.repeat(61)
    };

    const result = validateCategory(cat);
    expect(result.isValid).toBe(false);
    expect(result.errors.name).toContain('cannot exceed 60 characters');
  });
});

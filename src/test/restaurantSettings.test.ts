import { describe, it, expect } from 'vitest';
import { validateRestaurantSettings } from '../utils/validation';

describe('Restaurant Settings Validation Suite', () => {
  it('validates a complete, accurate restaurant profile', () => {
    const validPayload = {
      name: 'Spice Symphony Bistro',
      phone: '+91 98765 43210',
      email: 'owner@spicesymphony.com',
      gstNumber: '27AABCU9603R1ZM',
      defaultTaxRate: 5.0
    };

    const result = validateRestaurantSettings(validPayload);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('fails when required brand name is missing or whitespace', () => {
    const payload = {
      name: '   ',
      phone: '+91 98765 43210',
      email: 'owner@spicesymphony.com'
    };

    const result = validateRestaurantSettings(payload);
    expect(result.isValid).toBe(false);
    expect(result.errors.name).toBe('Restaurant name is required.');
  });

  it('validates phone and email requirements', () => {
    const payload = {
      name: 'Urban Tandoor',
      phone: 'invalid-phone',
      email: 'not-an-email'
    };

    const result = validateRestaurantSettings(payload);
    expect(result.isValid).toBe(false);
    expect(result.errors.phone).toBeDefined();
    expect(result.errors.email).toBeDefined();
  });

  it('rejects invalid GST number when provided', () => {
    const payload = {
      name: 'Urban Tandoor',
      phone: '+91 98765 43210',
      email: 'contact@urbantandoor.com',
      gstNumber: 'INVALID_GST_123'
    };

    const result = validateRestaurantSettings(payload);
    expect(result.isValid).toBe(false);
    expect(result.errors.gstNumber).toContain('Invalid GSTIN format');
  });

  it('allows empty GST number for unregistered or exempt outlets', () => {
    const payload = {
      name: 'Small Chai Kiosk',
      phone: '+91 98765 43210',
      email: 'contact@chaikiosk.com',
      gstNumber: ''
    };

    const result = validateRestaurantSettings(payload);
    expect(result.isValid).toBe(true);
    expect(result.errors.gstNumber).toBeUndefined();
  });

  it('flags tax rates exceeding 100% or below 0%', () => {
    const resultHigh = validateRestaurantSettings({
      name: 'Chai Kiosk',
      phone: '9876543210',
      email: 'tea@kiosk.in',
      defaultTaxRate: 150
    });
    expect(resultHigh.isValid).toBe(false);
    expect(resultHigh.errors.defaultTaxRate).toContain('between 0% and 100%');

    const resultLow = validateRestaurantSettings({
      name: 'Chai Kiosk',
      phone: '9876543210',
      email: 'tea@kiosk.in',
      defaultTaxRate: -5
    });
    expect(resultLow.isValid).toBe(false);
    expect(resultLow.errors.defaultTaxRate).toContain('between 0% and 100%');
  });
});

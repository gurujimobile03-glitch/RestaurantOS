import { describe, it, expect } from 'vitest';
import {
  validateGSTIN,
  validateEmail,
  validatePhone,
  validatePrice,
  validateTaxRate,
  validateShortName,
  validateRestaurantSettings,
  validateMenuItem,
  validateCategory
} from '../utils/validation';

describe('GSTIN Validation', () => {
  it('accepts valid Indian GST numbers', () => {
    // Valid 15-char formats with valid state codes, PANs, and checksums
    const validGSTs = [
      '27AABCU9603R1ZM',
      '29AAAAA0000A1Z5',
      '07AAAAA0000A1Z5',
      '33AAAAA0000A1Z5'
    ];
    for (const gstin of validGSTs) {
      const result = validateGSTIN(gstin);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it('rejects invalid GST numbers', () => {
    const invalidGSTs = [
      '12345', // Too short
      '27AABCU9603R1ZM123', // Too long
      'XXAAAA0000A1Z5', // Invalid state code digits
      '2712345678A1Z5', // Numbers where PAN letters should be
      '27AABCU9603R1AM' // 'A' instead of 'Z' in 14th character
    ];
    for (const gstin of invalidGSTs) {
      const result = validateGSTIN(gstin);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    }
  });

  it('allows empty GSTIN when optional, but rejects when required', () => {
    expect(validateGSTIN('', false).isValid).toBe(true);
    expect(validateGSTIN('   ', false).isValid).toBe(true);
    expect(validateGSTIN('', true).isValid).toBe(false);
    expect(validateGSTIN('', true).error).toContain('required');
  });
});

describe('Email and Phone Validation', () => {
  it('validates standard email addresses correctly', () => {
    expect(validateEmail('manager@restaurant.com').isValid).toBe(true);
    expect(validateEmail('billing+kitchen@tandoor-bistro.in').isValid).toBe(true);
    expect(validateEmail('invalid-email').isValid).toBe(false);
    expect(validateEmail('user@').isValid).toBe(false);
    expect(validateEmail('@domain.com').isValid).toBe(false);
  });

  it('validates phone numbers across standard formats', () => {
    expect(validatePhone('+91 98765 43210').isValid).toBe(true);
    expect(validatePhone('9876543210').isValid).toBe(true);
    expect(validatePhone('+1 (555) 234-5678').isValid).toBe(true);
    expect(validatePhone('123').isValid).toBe(false); // too short
    expect(validatePhone('123456789012345678').isValid).toBe(false); // too long
  });
});

describe('Financial & Pricing Validation', () => {
  it('validates prices', () => {
    expect(validatePrice(0).isValid).toBe(true);
    expect(validatePrice(250.5).isValid).toBe(true);
    expect(validatePrice('499.00').isValid).toBe(true);
    expect(validatePrice(-10).isValid).toBe(false);
    expect(validatePrice('not-a-number').isValid).toBe(false);
  });

  it('validates tax percentages between 0 and 100', () => {
    expect(validateTaxRate(0).isValid).toBe(true);
    expect(validateTaxRate(5.0).isValid).toBe(true);
    expect(validateTaxRate(18).isValid).toBe(true);
    expect(validateTaxRate(100).isValid).toBe(true);
    expect(validateTaxRate(-1).isValid).toBe(false);
    expect(validateTaxRate(105).isValid).toBe(false);
  });
});

describe('Thermal KOT Short Name Validation', () => {
  it('enforces 20-character maximum for 3-inch ESC/POS thermal printers', () => {
    expect(validateShortName('PANEER TIKKA').isValid).toBe(true);
    expect(validateShortName('12345678901234567890').isValid).toBe(true); // exactly 20
    expect(validateShortName('123456789012345678901').isValid).toBe(false); // 21 chars
    expect(validateShortName('123456789012345678901').error).toContain('cannot exceed 20 characters');
  });
});

/**
 * Validation utilities for RestaurantOS entities
 */

/**
 * Standard Indian Goods and Services Tax Identification Number (GSTIN) regex.
 * Format: 15 alphanumeric characters:
 * - 2 digits (State code: 01-38)
 * - 5 letters (PAN letters)
 * - 4 digits (PAN numbers)
 * - 1 letter (PAN status/check)
 * - 1 alphanumeric (Entity number)
 * - 'Z' (Default character)
 * - 1 alphanumeric (Checksum)
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Validates an Indian GST number. Returns true if valid or if empty (GST is optional for exempt/unregistered outlets).
 * If required is true, empty strings are considered invalid.
 */
export function validateGSTIN(gstin: string, required = false): { isValid: boolean; error?: string } {
  const trimmed = (gstin || '').trim().toUpperCase();

  if (!trimmed) {
    if (required) {
      return { isValid: false, error: 'GSTIN is required.' };
    }
    return { isValid: true };
  }

  if (trimmed.length !== 15) {
    return { isValid: false, error: 'GSTIN must be exactly 15 alphanumeric characters.' };
  }

  if (!GSTIN_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: 'Invalid GSTIN format (e.g., 27AABCU9603R1ZM). Please verify state code and PAN structure.'
    };
  }

  return { isValid: true };
}

/**
 * Validates an email address.
 */
export function validateEmail(email: string, required = true): { isValid: boolean; error?: string } {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    if (required) return { isValid: false, error: 'Email address is required.' };
    return { isValid: true };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Please provide a valid email address.' };
  }

  return { isValid: true };
}

/**
 * Validates contact phone numbers (allows formats with +, spaces, and dashes).
 */
export function validatePhone(phone: string, required = true): { isValid: boolean; error?: string } {
  const trimmed = (phone || '').trim();
  if (!trimmed) {
    if (required) return { isValid: false, error: 'Phone number is required.' };
    return { isValid: true };
  }

  // Strip non-digit characters for length inspection
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return { isValid: false, error: 'Phone number must contain between 7 and 15 digits.' };
  }

  return { isValid: true };
}

/**
 * Validates monetary price values.
 */
export function validatePrice(price: number | string): { isValid: boolean; error?: string } {
  const num = typeof price === 'string' ? parseFloat(price) : price;

  if (isNaN(num)) {
    return { isValid: false, error: 'Price must be a valid number.' };
  }

  if (num < 0) {
    return { isValid: false, error: 'Price cannot be negative.' };
  }

  if (num > 10000000) {
    return { isValid: false, error: 'Price exceeds reasonable maximum limit.' };
  }

  return { isValid: true };
}

/**
 * Validates tax percentage rates (0% to 100%).
 */
export function validateTaxRate(rate: number | string): { isValid: boolean; error?: string } {
  const num = typeof rate === 'string' ? parseFloat(rate) : rate;

  if (isNaN(num)) {
    return { isValid: false, error: 'Tax rate must be a valid percentage.' };
  }

  if (num < 0 || num > 100) {
    return { isValid: false, error: 'Tax rate must be between 0% and 100%.' };
  }

  return { isValid: true };
}

/**
 * Validates menu item thermal printer short name (ESC/POS 3-inch limit: max 20 chars).
 */
export function validateShortName(shortName: string): { isValid: boolean; error?: string } {
  const trimmed = (shortName || '').trim();
  if (trimmed.length > 20) {
    return { isValid: false, error: 'Short name cannot exceed 20 characters for thermal KOT printing.' };
  }
  return { isValid: true };
}

/**
 * Validates restaurant profile settings payload.
 */
export function validateRestaurantSettings(data: {
  name: string;
  phone: string;
  email: string;
  gstNumber?: string;
  defaultTaxRate?: number;
}): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.name || !data.name.trim()) {
    errors.name = 'Restaurant name is required.';
  } else if (data.name.trim().length > 100) {
    errors.name = 'Restaurant name cannot exceed 100 characters.';
  }

  const phoneValidation = validatePhone(data.phone, true);
  if (!phoneValidation.isValid && phoneValidation.error) {
    errors.phone = phoneValidation.error;
  }

  const emailValidation = validateEmail(data.email, true);
  if (!emailValidation.isValid && emailValidation.error) {
    errors.email = emailValidation.error;
  }

  if (data.gstNumber) {
    const gstValidation = validateGSTIN(data.gstNumber, false);
    if (!gstValidation.isValid && gstValidation.error) {
      errors.gstNumber = gstValidation.error;
    }
  }

  if (data.defaultTaxRate !== undefined) {
    const taxValidation = validateTaxRate(data.defaultTaxRate);
    if (!taxValidation.isValid && taxValidation.error) {
      errors.defaultTaxRate = taxValidation.error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validates a Menu Item form.
 */
export function validateMenuItem(data: {
  name: string;
  categoryId: string;
  price: number | string;
  shortName?: string;
  taxRate?: number | string;
}): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.name || !data.name.trim()) {
    errors.name = 'Item name is required.';
  } else if (data.name.trim().length > 100) {
    errors.name = 'Item name cannot exceed 100 characters.';
  }

  if (!data.categoryId) {
    errors.categoryId = 'Please select a menu category.';
  }

  const priceVal = validatePrice(data.price);
  if (!priceVal.isValid && priceVal.error) {
    errors.price = priceVal.error;
  }

  if (data.shortName) {
    const shortVal = validateShortName(data.shortName);
    if (!shortVal.isValid && shortVal.error) {
      errors.shortName = shortVal.error;
    }
  }

  if (data.taxRate !== undefined && data.taxRate !== '') {
    const taxVal = validateTaxRate(data.taxRate);
    if (!taxVal.isValid && taxVal.error) {
      errors.taxRate = taxVal.error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Validates a Menu Category form.
 */
export function validateCategory(data: {
  name: string;
  sortOrder?: number | string;
}): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.name || !data.name.trim()) {
    errors.name = 'Category name is required.';
  } else if (data.name.trim().length > 60) {
    errors.name = 'Category name cannot exceed 60 characters.';
  }

  if (data.sortOrder !== undefined && data.sortOrder !== '') {
    const orderNum = typeof data.sortOrder === 'string' ? parseInt(data.sortOrder, 10) : data.sortOrder;
    if (isNaN(orderNum) || orderNum < 0) {
      errors.sortOrder = 'Sort order must be a non-negative number.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

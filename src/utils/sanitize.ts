/**
 * Robust utility to recursively sanitize objects for Firestore persistence.
 * Primarily ensures that no fields with 'undefined' values are passed, as Firestore
 * throws a fatal error for 'undefined' field values.
 */

function isPlainObject(value: any): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

export function sanitizeFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeFirestoreData) as any;
  }

  if (isPlainObject(data)) {
    const cleaned: any = {};
    for (const key of Object.keys(data as any)) {
      const val = (data as any)[key];
      if (val !== undefined) {
        cleaned[key] = sanitizeFirestoreData(val);
      }
    }
    return cleaned;
  }

  return data;
}

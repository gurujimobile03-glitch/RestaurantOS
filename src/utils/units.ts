import { InventoryUnit, UnitCategory } from '../types/inventory';

export const UNIT_CONFIG: Record<
  InventoryUnit,
  {
    name: string;
    symbol: string;
    category: UnitCategory;
    baseUnit: InventoryUnit;
    multiplierToBase: number;
  }
> = {
  kg: { name: 'Kilogram', symbol: 'kg', category: 'weight', baseUnit: 'g', multiplierToBase: 1000 },
  g: { name: 'Gram', symbol: 'g', category: 'weight', baseUnit: 'g', multiplierToBase: 1 },
  litre: { name: 'Litre', symbol: 'L', category: 'volume', baseUnit: 'ml', multiplierToBase: 1000 },
  ml: { name: 'Millilitre', symbol: 'ml', category: 'volume', baseUnit: 'ml', multiplierToBase: 1 },
  piece: { name: 'Piece', symbol: 'pc', category: 'count', baseUnit: 'piece', multiplierToBase: 1 },
  box: { name: 'Box', symbol: 'box', category: 'count', baseUnit: 'box', multiplierToBase: 1 },
  packet: { name: 'Packet', symbol: 'pkt', category: 'count', baseUnit: 'packet', multiplierToBase: 1 },
};

export const SUPPORTED_UNITS: InventoryUnit[] = ['kg', 'g', 'litre', 'ml', 'piece', 'box', 'packet'];

export function isValidUnit(unit: unknown): unit is InventoryUnit {
  return typeof unit === 'string' && unit in UNIT_CONFIG;
}

export function getUnitCategory(unit: InventoryUnit): UnitCategory {
  if (!isValidUnit(unit)) {
    throw new Error(`Invalid or unsupported inventory unit: "${String(unit)}"`);
  }
  return UNIT_CONFIG[unit].category;
}

export function areUnitsCompatible(unitA: InventoryUnit, unitB: InventoryUnit): boolean {
  if (!isValidUnit(unitA) || !isValidUnit(unitB)) return false;
  if (unitA === unitB) return true;
  const cfgA = UNIT_CONFIG[unitA];
  const cfgB = UNIT_CONFIG[unitB];
  return cfgA.category === cfgB.category && cfgA.baseUnit === cfgB.baseUnit;
}

/**
 * Deterministically rounds numeric quantities to 3 decimal places
 * preventing floating-point precision drift.
 */
export function roundQuantity(val: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new Error(`Quantity must be a finite number, received: ${String(val)}`);
  }
  return Math.round((val + Number.EPSILON) * 1000) / 1000;
}

/**
 * Converts a quantity between compatible units deterministically.
 * Throws an explicit error if units are incompatible or invalid.
 */
export function convertQuantity(
  quantity: number,
  fromUnit: InventoryUnit,
  toUnit: InventoryUnit
): number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    throw new Error(`Quantity must be a finite number, received: ${String(quantity)}`);
  }
  if (!isValidUnit(fromUnit)) {
    throw new Error(`Invalid source unit: "${String(fromUnit)}"`);
  }
  if (!isValidUnit(toUnit)) {
    throw new Error(`Invalid target unit: "${String(toUnit)}"`);
  }
  if (fromUnit === toUnit) {
    return roundQuantity(quantity);
  }

  const fromCfg = UNIT_CONFIG[fromUnit];
  const toCfg = UNIT_CONFIG[toUnit];

  if (fromCfg.category !== toCfg.category || fromCfg.baseUnit !== toCfg.baseUnit) {
    throw new Error(
      `Incompatible unit conversion: Cannot convert between ${fromCfg.category} (${fromUnit}) and ${toCfg.category} (${toUnit})`
    );
  }

  const inBase = quantity * fromCfg.multiplierToBase;
  const inTarget = inBase / toCfg.multiplierToBase;
  return roundQuantity(inTarget);
}

export function formatQuantityWithUnit(quantity: number, unit: InventoryUnit): string {
  const rounded = roundQuantity(quantity);
  const symbol = UNIT_CONFIG[unit]?.symbol || unit;
  return `${rounded} ${symbol}`;
}

export function normalizeInventoryItemName(name: string): string {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isLowStock(currentQuantity: number, minimumQuantity: number): boolean {
  return roundQuantity(currentQuantity) <= roundQuantity(minimumQuantity);
}

/**
 * Safely parses any value to a non-negative finite numeric quantity,
 * defaulting to 0 for null/undefined/invalid values.
 */
export function parseNumericQuantity(val: unknown): number {
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val < 0) return 0;
    return roundQuantity(val);
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val.trim());
    if (isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) return 0;
    return roundQuantity(parsed);
  }
  return 0;
}

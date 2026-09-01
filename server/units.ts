// Pragmatic unit handling: convert within a dimension (mass, volume, count);
// across dimensions we don't guess densities — callers treat quantities as
// unverifiable rather than silently wrong.

export type Dimension = "mass" | "volume" | "count";

interface UnitDef {
  dim: Dimension;
  toBase: number; // grams for mass, ml for volume, 1 for count
}

const UNITS: Record<string, UnitDef> = {
  g: { dim: "mass", toBase: 1 },
  kg: { dim: "mass", toBase: 1000 },
  oz: { dim: "mass", toBase: 28.3495 },
  lb: { dim: "mass", toBase: 453.592 },
  ml: { dim: "volume", toBase: 1 },
  l: { dim: "volume", toBase: 1000 },
  tsp: { dim: "volume", toBase: 4.929 },
  tbsp: { dim: "volume", toBase: 14.787 },
  cup: { dim: "volume", toBase: 236.588 },
  floz: { dim: "volume", toBase: 29.5735 },
  // Count-like units. They share a dimension so "2 each" can satisfy "1 each",
  // but a bunch vs. a clove is still just 1:1 — good enough for a kitchen.
  each: { dim: "count", toBase: 1 },
  bunch: { dim: "count", toBase: 1 },
  clove: { dim: "count", toBase: 1 },
  slice: { dim: "count", toBase: 1 },
  can: { dim: "count", toBase: 1 },
  loaf: { dim: "count", toBase: 1 },
  ear: { dim: "count", toBase: 1 },
  sprig: { dim: "count", toBase: 1 },
};

export const KNOWN_UNITS = Object.keys(UNITS);

export function unitDim(unit: string): Dimension | null {
  return UNITS[unit.toLowerCase()]?.dim ?? null;
}

export function toBase(qty: number, unit: string): { dim: Dimension; base: number } | null {
  const def = UNITS[unit.toLowerCase()];
  if (!def) return null;
  return { dim: def.dim, base: qty * def.toBase };
}

export function fromBase(base: number, unit: string): number | null {
  const def = UNITS[unit.toLowerCase()];
  if (!def) return null;
  return base / def.toBase;
}

/**
 * Convert a quantity between units. Returns null when the units aren't
 * honestly convertible: different dimensions, unknown units, or two different
 * count-like units (a loaf is not N slices — we refuse to guess).
 */
export function convert(qty: number, fromUnit: string, toUnit: string): number | null {
  const from = UNITS[fromUnit.toLowerCase()];
  const to = UNITS[toUnit.toLowerCase()];
  if (!from || !to || from.dim !== to.dim) return null;
  if (from.dim === "count" && fromUnit.toLowerCase() !== toUnit.toLowerCase()) return null;
  return (qty * from.toBase) / to.toBase;
}

/**
 * Can `haveQty haveUnit` cover `needQty needUnit`?
 * Returns true/false when comparable, null when we can't honestly say.
 */
export function covers(
  haveQty: number,
  haveUnit: string,
  needQty: number,
  needUnit: string,
): boolean | null {
  const haveInNeed = convert(haveQty, haveUnit, needUnit);
  if (haveInNeed === null) return null;
  return haveInNeed >= needQty * 0.999; // float tolerance
}

export function formatQty(qty: number, unit: string): string {
  const rounded = Math.round(qty * 100) / 100;
  return `${rounded} ${unit}`;
}

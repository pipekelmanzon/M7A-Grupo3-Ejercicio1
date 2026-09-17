export function round2(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError('value must be finite');
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}
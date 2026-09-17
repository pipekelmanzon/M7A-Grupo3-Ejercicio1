import type { Filter } from './filter.ts';

export const FILTER_ORDER = [
  'passenger-validation',
  'flight-validation',
  'exchange-rate',
  'base-price',
  'loyalty-discount',
  'passenger-type-adjustment',
  'taxes',
] as const;

export function createFilterRegistry(filters: readonly Filter[]): Filter[] {
  const byName = new Map<string, Filter>();
  for (const filter of filters) {
    if (!FILTER_ORDER.includes(filter.name as (typeof FILTER_ORDER)[number])) {
      throw new Error(`Unknown filter: ${filter.name}`);
    }
    if (byName.has(filter.name)) {
      throw new Error(`Duplicate filter: ${filter.name}`);
    }
    byName.set(filter.name, filter);
  }

  return FILTER_ORDER.flatMap((name) => {
    const filter = byName.get(name);
    return filter === undefined ? [] : [filter];
  });
}
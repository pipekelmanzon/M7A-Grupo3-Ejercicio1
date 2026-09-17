import { describe, expect, it } from '@jest/globals';
import type { Filter } from '../../../src/pipeline/filter';
import { createFilterRegistry } from '../../../src/pipeline/filter-registry';

function testFilter(name: string): Filter {
  return { name, requires: [], critical: false, run: async (context) => context };
}

describe('createFilterRegistry', () => {
  it('returns available filters in the fixed pipeline order', () => {
    const registry = createFilterRegistry([
      testFilter('taxes'),
      testFilter('base-price'),
      testFilter('passenger-validation'),
    ]);

    expect(registry.map((filter) => filter.name)).toEqual([
      'passenger-validation',
      'base-price',
      'taxes',
    ]);
  });

  it('rejects unknown and duplicate filters', () => {
    expect(() => createFilterRegistry([testFilter('unknown')])).toThrow('Unknown filter');
    expect(() => createFilterRegistry([testFilter('taxes'), testFilter('taxes')])).toThrow('Duplicate filter');
  });
});
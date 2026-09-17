import { describe, expect, it } from '@jest/globals';
import { defaultPipelineConfig } from '../../../src/pipeline/pipeline-config';
import { findBrokenDependencies, PipelineConfigStore } from '../../../src/pipeline/pipeline-config.store';

describe('PipelineConfigStore', () => {
  it('returns defensive copies and resets to defaults', () => {
    const store = new PipelineConfigStore();
    const config = store.get();
    config.filters.taxes.enabled = false;

    expect(store.get().filters.taxes.enabled).toBe(true);
    store.replace(config);
    expect(store.get().filters.taxes.enabled).toBe(false);
    store.reset();
    expect(store.get()).toEqual(defaultPipelineConfig);
  });

  it('validates replacement configurations', () => {
    const store = new PipelineConfigStore();

    expect(() => store.replace({})).toThrow();
  });
});

describe('findBrokenDependencies', () => {
  it('reports enabled filters whose providers are disabled', () => {
    const config = structuredClone(defaultPipelineConfig);
    config.filters['base-price'].enabled = true;
    config.filters['flight-validation'].enabled = false;
    config.filters['loyalty-discount'].enabled = true;
    config.filters['passenger-validation'].enabled = false;

    expect(findBrokenDependencies(config)).toEqual(expect.arrayContaining([
      { filter: 'base-price', dependency: 'flight', provider: 'flight-validation' },
      { filter: 'loyalty-discount', dependency: 'passenger', provider: 'passenger-validation' },
    ]));
  });

  it('does not warn when the dependent filter is disabled too', () => {
    const config = structuredClone(defaultPipelineConfig);
    config.filters['base-price'].enabled = false;
    config.filters['flight-validation'].enabled = false;

    expect(findBrokenDependencies(config)).not.toEqual(expect.arrayContaining([
      { filter: 'base-price', dependency: 'flight', provider: 'flight-validation' },
    ]));
  });
});
import {
  defaultPipelineConfig,
  pipelineConfigSchema,
  type PipelineConfig,
} from './pipeline-config.ts';

export interface BrokenDependency {
  filter: string;
  dependency: string;
  provider: string;
}

const dependencies = [
  { filter: 'flight-validation', dependency: 'flight', provider: 'flight-validation' },
  { filter: 'exchange-rate', dependency: 'flight', provider: 'flight-validation' },
  { filter: 'base-price', dependency: 'flight', provider: 'flight-validation' },
  { filter: 'loyalty-discount', dependency: 'passenger', provider: 'passenger-validation' },
  { filter: 'loyalty-discount', dependency: 'pricing.basePrice', provider: 'base-price' },
  { filter: 'passenger-type-adjustment', dependency: 'pricing.basePrice', provider: 'base-price' },
  { filter: 'taxes', dependency: 'pricing.basePrice', provider: 'base-price' },
  { filter: 'taxes', dependency: 'pricing.subtotal', provider: 'passenger-type-adjustment' },
] as const;

export function findBrokenDependencies(config: PipelineConfig): BrokenDependency[] {
  return dependencies.filter(({ filter, provider }) => (
    config.filters[filter as keyof PipelineConfig['filters']].enabled
    && !config.filters[provider as keyof PipelineConfig['filters']].enabled
  ));
}

export class PipelineConfigStore {
  private config: PipelineConfig;

  public constructor(initial: PipelineConfig = defaultPipelineConfig) {
    this.config = pipelineConfigSchema.parse(initial);
  }

  public get(): PipelineConfig {
    return structuredClone(this.config);
  }

  public replace(config: unknown): PipelineConfig {
    this.config = pipelineConfigSchema.parse(config);
    return this.get();
  }

  public reset(): PipelineConfig {
    this.config = pipelineConfigSchema.parse(defaultPipelineConfig);
    return this.get();
  }
}
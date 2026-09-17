import { performance } from 'node:perf_hooks';
import type { ReservationContext } from './context.ts';
import { reservationContextSchema } from './context.schema.ts';
import type { Filter, ContextField } from './filter.ts';
import { PipelineConfigStore } from './pipeline-config.ts';
import { buildResult, type ReservationResult } from './result-builder.ts';

function hasDependency(context: ReservationContext, dependency: ContextField): boolean {
  switch (dependency) {
    case 'passenger': return context.passenger !== undefined;
    case 'flight': return context.flight !== undefined;
    case 'pricing.basePrice': return context.pricing.basePrice !== undefined;
    case 'pricing.subtotal': return context.pricing.subtotal !== undefined;
  }
}

function appendTrace(context: ReservationContext, filter: string, outcome: 'ok' | 'rejected' | 'error' | 'skipped' | 'disabled', startedAt: number): ReservationContext {
  return { ...context, trace: [...context.trace, { filter, outcome, durationMs: performance.now() - startedAt }] };
}

export class Pipeline {
  private readonly filters: Filter[];
  private readonly configStore: PipelineConfigStore;

  public constructor(filters: Filter[], configStore = new PipelineConfigStore()) {
    this.filters = [...filters];
    this.configStore = configStore;
  }

  public use(filter: Filter): this {
    this.filters.push(filter);
    return this;
  }

  public async run(initialContext: ReservationContext): Promise<ReservationResult> {
    let context = initialContext;
    const config = this.configStore.get();

    for (const filter of this.filters) {
      const startedAt = performance.now();
      const configured = config.filters[filter.name as keyof typeof config.filters];
      if (context.halted) {
        context = appendTrace(context, filter.name, 'skipped', startedAt);
        continue;
      }
      if (configured?.enabled === false) {
        context = appendTrace(context, filter.name, 'disabled', startedAt);
        continue;
      }
      if (filter.requires.some((dependency) => !hasDependency(context, dependency))) {
        const issue = { code: 'MISSING_DEPENDENCY', message: `Missing dependency for filter ${filter.name}`, filter: filter.name };
        context = filter.critical
          ? appendTrace({ ...context, status: 'error', halted: true, errors: [...context.errors, issue] }, filter.name, 'skipped', startedAt)
          : appendTrace({ ...context, warnings: [...context.warnings, issue] }, filter.name, 'skipped', startedAt);
        continue;
      }

      const previous = context;
      try {
        const params = filter.name in config.params ? config.params[filter.name as keyof typeof config.params] : config.exchange;
        const next = await filter.run(context, params);
        if (config.validateContextBetweenFilters && !reservationContextSchema.safeParse(next).success) {
          context = appendTrace({ ...previous, status: 'error', halted: true, errors: [...previous.errors, { code: 'CORRUPTED_CONTEXT', message: `Filter ${filter.name} returned an invalid context`, filter: filter.name }] }, filter.name, 'error', startedAt);
          continue;
        }
        context = appendTrace(next, filter.name, next.halted ? 'rejected' : 'ok', startedAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown filter exception';
        context = appendTrace({ ...previous, status: 'error', halted: filter.critical, errors: [...previous.errors, { code: 'FILTER_EXCEPTION', message, filter: filter.name }] }, filter.name, 'error', startedAt);
      }
    }

    return buildResult(context);
  }
}
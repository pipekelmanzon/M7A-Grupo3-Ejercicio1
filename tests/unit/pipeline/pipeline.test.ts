import { createInitialContext, type ReservationContext } from '../../../src/pipeline/context';
import { Pipeline } from '../../../src/pipeline/pipeline';
import { defaultPipelineConfig } from '../../../src/pipeline/pipeline-config';
import { PipelineConfigStore } from '../../../src/pipeline/pipeline-config.store';
import type { Filter } from '../../../src/pipeline/filter';

const request = {
  reservationId: 'R-1',
  passengerId: 'P-1',
  flightCode: 'F-1',
  origin: 'MVD',
  destination: 'GRU',
  departureDate: '2099-01-01',
  seatClass: 'economy' as const,
  passengerType: 'adult' as const,
};

function filter(name: string, run: Filter['run'], options: Partial<Filter> = {}): Filter {
  return { name, requires: [], critical: false, run, ...options };
}

function context(): ReservationContext {
  return createInitialContext(request);
}

describe('Pipeline', () => {
  it('runs filters in order and records their trace', async () => {
    const calls: string[] = [];
    const pipeline = new Pipeline([
      filter('first', async (current) => { calls.push('first'); return current; }),
      filter('second', async (current) => { calls.push('second'); return current; }),
    ]);

    const result = await pipeline.run(context());

    expect(calls).toEqual(['first', 'second']);
    expect(result.status).toBe('completed');
    expect(result.trace.map((entry) => entry.filter)).toEqual(['first', 'second']);
  });

  it('marks disabled filters without executing them', async () => {
    const config = structuredClone(defaultPipelineConfig);
    config.filters.taxes.enabled = false;
    const run = jest.fn(async (current: ReservationContext) => current);
    const pipeline = new Pipeline([filter('taxes', run)], new PipelineConfigStore(config));

    const result = await pipeline.run(context());

    expect(run).not.toHaveBeenCalled();
    expect(result.trace).toEqual([expect.objectContaining({ filter: 'taxes', outcome: 'disabled' })]);
  });

  it('stops after a rejection and marks the remaining filters as skipped', async () => {
    const later = jest.fn(async (current: ReservationContext) => current);
    const pipeline = new Pipeline([
      filter('rejecting', async (current) => ({ ...current, halted: true, status: 'rejected' })),
      filter('later', later),
    ]);

    const result = await pipeline.run(context());

    expect(later).not.toHaveBeenCalled();
    expect(result.trace.map((entry) => entry.outcome)).toEqual(['rejected', 'skipped']);
    expect(result.status).toBe('rejected');
  });

  it('keeps going after a non-critical exception but ends in error', async () => {
    const later = jest.fn(async (current: ReservationContext) => current);
    const pipeline = new Pipeline([
      filter('optional', async () => { throw new Error('boom'); }),
      filter('later', later),
    ]);

    const result = await pipeline.run(context());

    expect(later).toHaveBeenCalled();
    expect(result.status).toBe('error');
    expect(result.errors[0]?.code).toBe('FILTER_EXCEPTION');
  });

  it('stops on a critical exception and preserves the previous context', async () => {
    const later = jest.fn(async (current: ReservationContext) => current);
    const pipeline = new Pipeline([
      filter('critical', async () => { throw new Error('boom'); }, { critical: true }),
      filter('later', later),
    ]);

    const result = await pipeline.run(context());

    expect(later).not.toHaveBeenCalled();
    expect(result.status).toBe('error');
    expect(result.trace.map((entry) => entry.outcome)).toEqual(['error', 'skipped']);
  });

  it('rejects a corrupt context returned by a filter', async () => {
    const pipeline = new Pipeline([
      filter('corrupt', async (current) => ({ ...current, pricing: { currency: 'USD', total: Number.NaN } })),
    ]);

    const result = await pipeline.run(context());

    expect(result.status).toBe('error');
    expect(result.errors[0]?.code).toBe('CORRUPTED_CONTEXT');
    expect(result.trace[0]?.outcome).toBe('error');
  });
});
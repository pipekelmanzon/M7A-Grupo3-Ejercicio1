import { describe, expect, it } from '@jest/globals';
import { createInitialContext } from '../../../src/pipeline/context';

const request = {
  reservationId: 'R-1001',
  passengerId: 'P001',
  flightCode: 'LA4567',
  origin: 'MVD',
  destination: 'GRU',
  departureDate: '2099-10-15',
  seatClass: 'business' as const,
  passengerType: 'adult' as const,
};

describe('createInitialContext', () => {
  it('creates an isolated processing context with empty collections', () => {
    const context = createInitialContext(request);

    expect(context).toEqual({
      request,
      status: 'processing',
      halted: false,
      pricing: { currency: 'USD' },
      metadata: {},
      errors: [],
      warnings: [],
      trace: [],
    });
    expect(context.request).toBe(request);
    expect(context.errors).not.toBe(context.warnings);
    expect(context.errors).not.toBe(context.trace);
  });

  it('does not share mutable collections between contexts', () => {
    const first = createInitialContext(request);
    const second = createInitialContext(request);

    first.errors.push({ code: 'TEST', message: 'test', filter: 'test' });

    expect(second.errors).toEqual([]);
  });
});
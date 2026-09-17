import { describe, expect, it } from '@jest/globals';
import { createInitialContext } from '../../../src/pipeline/context';
import { reservationContextSchema } from '../../../src/pipeline/context.schema';

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

describe('reservationContextSchema', () => {
  it('accepts an initial context', () => {
    expect(reservationContextSchema.safeParse(createInitialContext(request)).success).toBe(true);
  });

  it('rejects negative, non-finite, or invalid pricing values', () => {
    const context = createInitialContext(request);

    expect(reservationContextSchema.safeParse({ ...context, pricing: { currency: 'USD', total: -1 } }).success).toBe(false);
    expect(reservationContextSchema.safeParse({ ...context, pricing: { currency: 'USD', total: Number.NaN } }).success).toBe(false);
    expect(reservationContextSchema.safeParse({ ...context, pricing: { currency: 'EUR' } }).success).toBe(false);
  });

  it('rejects malformed trace entries and missing required fields', () => {
    const context = createInitialContext(request);

    expect(reservationContextSchema.safeParse({ ...context, trace: [{ filter: 'x', outcome: 'unknown', durationMs: 1 }] }).success).toBe(false);
    const { request: _request, ...withoutRequest } = context;
    expect(reservationContextSchema.safeParse(withoutRequest).success).toBe(false);
  });
});
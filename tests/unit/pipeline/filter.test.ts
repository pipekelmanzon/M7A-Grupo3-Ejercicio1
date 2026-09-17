import { describe, expect, it } from '@jest/globals';
import { createInitialContext } from '../../../src/pipeline/context';
import { reject, warn, withPricing } from '../../../src/pipeline/filter';

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

describe('filter helpers', () => {
  it('rejects without mutating the original context', () => {
    const original = createInitialContext(request);
    const result = reject(original, 'PASSENGER_NOT_FOUND', 'Passenger not found', 'passenger-validation');

    expect(original.halted).toBe(false);
    expect(original.errors).toEqual([]);
    expect(result).not.toBe(original);
    expect(result).toMatchObject({ status: 'rejected', halted: true });
    expect(result.errors).toEqual([{ code: 'PASSENGER_NOT_FOUND', message: 'Passenger not found', filter: 'passenger-validation' }]);
  });

  it('adds warnings without changing errors or the original context', () => {
    const original = createInitialContext(request);
    const result = warn(original, 'EXCHANGE_RATE_FALLBACK', 'Using USD fallback', 'exchange-rate');

    expect(original.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([{ code: 'EXCHANGE_RATE_FALLBACK', message: 'Using USD fallback', filter: 'exchange-rate' }]);
  });

  it('merges pricing fields and preserves existing pricing', () => {
    const original = createInitialContext(request);
    const withBasePrice = withPricing(original, { basePrice: 750 });
    const complete = withPricing(withBasePrice, { subtotal: 637.5, total: 799 });

    expect(original.pricing).toEqual({ currency: 'USD' });
    expect(withBasePrice.pricing).toEqual({ currency: 'USD', basePrice: 750 });
    expect(complete.pricing).toEqual({ currency: 'USD', basePrice: 750, subtotal: 637.5, total: 799 });
  });
});
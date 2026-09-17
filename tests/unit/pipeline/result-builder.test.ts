import { describe, expect, it } from '@jest/globals';
import { createInitialContext } from '../../../src/pipeline/context';
import { buildResult } from '../../../src/pipeline/result-builder';

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

describe('buildResult', () => {
  it('rounds pricing and calculates local pricing from the conversion rate', () => {
    const context = createInitialContext(request);
    context.pricing = {
      currency: 'USD',
      basePrice: 750.125,
      loyaltyDiscount: 112.505,
      subtotal: 637.625,
      taxes: 76.515,
      fuelSurcharge: 60.01,
      airportFee: 25,
      total: 799.15,
    };
    context.metadata.currencyConversion = {
      from: 'USD',
      to: 'BRL',
      rate: 5.4,
      source: 'api',
      originalBasePrice: 300,
      convertedBasePrice: 1620,
    };

    const result = buildResult(context);

    expect(result.status).toBe('completed');
    expect(result.pricing).toEqual({
      currency: 'USD',
      basePrice: 750.13,
      loyaltyDiscount: 112.51,
      subtotal: 637.63,
      taxes: 76.52,
      fuelSurcharge: 60.01,
      airportFee: 25,
      total: 799.15,
    });
    expect(result.localPricing).toEqual({ currency: 'BRL', rate: 5.4, total: 4315.41 });
  });

  it('returns completed_with_warnings when warnings exist', () => {
    const context = createInitialContext(request);
    context.warnings.push({ code: 'EXCHANGE_RATE_FALLBACK', message: 'Fallback', filter: 'exchange-rate' });

    expect(buildResult(context).status).toBe('completed_with_warnings');
  });

  it('keeps rejected status even when the rejection has errors', () => {
    const context = createInitialContext(request);
    context.status = 'rejected';
    context.halted = true;
    context.errors.push({ code: 'PASSENGER_NOT_FOUND', message: 'Passenger not found', filter: 'passenger-validation' });

    const result = buildResult(context);

    expect(result.status).toBe('rejected');
    expect(result.pricing).toBeUndefined();
  });

  it('returns error when an unexpected processing error exists', () => {
    const context = createInitialContext(request);
    context.status = 'error';
    context.errors.push({ code: 'FILTER_EXCEPTION', message: 'Boom', filter: 'taxes' });

    expect(buildResult(context).status).toBe('error');
  });
});
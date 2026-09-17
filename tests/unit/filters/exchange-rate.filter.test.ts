import { ExchangeRateFilter } from '../../../src/filters/exchange-rate.filter';
import { createInitialContext, type ReservationContext } from '../../../src/pipeline/context';
import type { Flight, ReservationRequest } from '../../../src/domain/types';
import type { ExchangeRateService } from '../../../src/services/exchange-rate.service';

const request: ReservationRequest = {
  reservationId: 'R-1',
  passengerId: 'P-1',
  flightCode: 'F-1',
  origin: 'MVD',
  destination: 'GRU',
  departureDate: '2099-01-01',
  seatClass: 'economy',
  passengerType: 'adult',
};

const flight: Flight = {
  code: 'F-1',
  origin: 'MVD',
  destination: 'GRU',
  destinationCountryCode: 'BR',
  departureDate: '2099-01-01',
  basePrice: 300,
  availableSeats: 10,
  durationMinutes: 160,
};

function context(destinationCountryCode = 'BR'): ReservationContext {
  return { ...createInitialContext(request), flight: { ...flight, destinationCountryCode } };
}

function service(source: 'api' | 'cache' | 'stale-cache' | 'fallback-usd', rates: Record<string, number>): ExchangeRateService {
  return {
    getRates: jest.fn(async () => ({ rates, date: '2026-09-17', source })),
    clearCache: jest.fn(),
  } as unknown as ExchangeRateService;
}

describe('ExchangeRateFilter', () => {
  it('adds currency conversion metadata for the destination currency', async () => {
    const exchangeService = service('api', { BRL: 5.4 });
    const filter = new ExchangeRateFilter(exchangeService);

    const result = await filter.run(context(), { timeoutMs: 100, maxAttempts: 1 });

    expect(result.metadata.currencyConversion).toEqual({
      from: 'USD',
      to: 'BRL',
      rate: 5.4,
      source: 'api',
      ratesDate: '2026-09-17',
      originalBasePrice: 300,
      convertedBasePrice: 1620,
    });
    expect(result.warnings).toEqual([]);
  });

  it('uses one-to-one conversion for USD destinations without calling the service', async () => {
    const exchangeService = service('api', { USD: 1 });
    const filter = new ExchangeRateFilter(exchangeService);

    const result = await filter.run(context('US'), { timeoutMs: 100, maxAttempts: 1 });

    expect(exchangeService.getRates).not.toHaveBeenCalled();
    expect(result.metadata.currencyConversion).toEqual(expect.objectContaining({ to: 'USD', rate: 1 }));
  });

  it('warns when destination country is not mapped', async () => {
    const filter = new ExchangeRateFilter(service('api', { BRL: 5.4 }));

    const result = await filter.run(context('ZZ'), { timeoutMs: 100, maxAttempts: 1 });

    expect(result.metadata.currencyConversion).toBeUndefined();
    expect(result.warnings[0]).toEqual(expect.objectContaining({ code: 'CURRENCY_NOT_SUPPORTED', filter: 'exchange-rate' }));
  });

  it('warns when API rates do not include the destination currency', async () => {
    const filter = new ExchangeRateFilter(service('api', { EUR: 0.9 }));

    const result = await filter.run(context('BR'), { timeoutMs: 100, maxAttempts: 1 });

    expect(result.metadata.currencyConversion).toBeUndefined();
    expect(result.warnings[0]).toEqual(expect.objectContaining({ code: 'CURRENCY_NOT_SUPPORTED' }));
  });

  it('marks stale cache as a warning while keeping conversion metadata', async () => {
    const filter = new ExchangeRateFilter(service('stale-cache', { BRL: 5.4 }));

    const result = await filter.run(context(), { timeoutMs: 100, maxAttempts: 1 });

    expect(result.metadata.currencyConversion).toEqual(expect.objectContaining({ source: 'stale-cache', to: 'BRL' }));
    expect(result.warnings[0]).toEqual(expect.objectContaining({ code: 'EXCHANGE_RATE_STALE' }));
  });

  it('falls back to USD with a warning when no rate is available', async () => {
    const filter = new ExchangeRateFilter(service('fallback-usd', { BRL: 5.4 }));

    const result = await filter.run(context(), { timeoutMs: 100, maxAttempts: 1 });

    expect(result.metadata.currencyConversion).toEqual(expect.objectContaining({ source: 'fallback-usd', to: 'USD', rate: 1 }));
    expect(result.warnings[0]).toEqual(expect.objectContaining({ code: 'EXCHANGE_RATE_FALLBACK' }));
  });
});

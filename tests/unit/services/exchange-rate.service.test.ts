import { ExchangeRateProviderError, type ExchangeRateProvider } from '../../../src/services/exchange-rate.provider';
import { ExchangeRateService, type ExchangeRateLogger } from '../../../src/services/exchange-rate.service';

function provider(responses: Array<Error | Record<string, number>>): ExchangeRateProvider {
  return {
    fetchRates: jest.fn(async () => {
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return { base: 'USD', date: '2026-09-17', rates: response ?? { BRL: 5 } };
    }),
  };
}

function logger(): ExchangeRateLogger {
  return { warn: jest.fn(), error: jest.fn() };
}

describe('ExchangeRateService', () => {
  it('returns API rates and caches the next request', async () => {
    let now = 0;
    const source = provider([{ BRL: 5.4 }]);
    const service = new ExchangeRateService(source, logger(), () => now);

    const first = await service.getRates({ timeoutMs: 100, maxAttempts: 3 });
    now = 1000;
    const second = await service.getRates({ timeoutMs: 100, maxAttempts: 3 });

    expect(first).toEqual({ rates: { BRL: 5.4 }, date: '2026-09-17', source: 'api' });
    expect(second).toEqual({ rates: { BRL: 5.4 }, date: '2026-09-17', source: 'cache' });
    expect(source.fetchRates).toHaveBeenCalledTimes(1);
  });

  it('retries retryable failures and then succeeds', async () => {
    const source = provider([
      new ExchangeRateProviderError('temporary', true),
      { BRL: 5.5 },
    ]);
    const waits: number[] = [];
    const service = new ExchangeRateService(source, logger(), Date.now, async (ms) => { waits.push(ms); });

    const result = await service.getRates({ timeoutMs: 100, maxAttempts: 3 });

    expect(result.source).toBe('api');
    expect(result.rates.BRL).toBe(5.5);
    expect(waits).toEqual([250]);
    expect(source.fetchRates).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable failures', async () => {
    const source = provider([new ExchangeRateProviderError('invalid payload', false)]);
    const service = new ExchangeRateService(source, logger(), Date.now, async () => undefined);

    const result = await service.getRates({ timeoutMs: 100, maxAttempts: 3 });

    expect(result.source).toBe('fallback-usd');
    expect(result.rates.USD).toBe(1);
    expect(source.fetchRates).toHaveBeenCalledTimes(1);
  });

  it('uses stale cache when a refresh fails', async () => {
    let now = 0;
    const source = provider([{ BRL: 5.4 }, new ExchangeRateProviderError('down', true)]);
    const service = new ExchangeRateService(source, logger(), () => now, async () => undefined);

    await service.getRates({ timeoutMs: 100, maxAttempts: 3 });
    now = 60 * 60 * 1000;
    const result = await service.getRates({ timeoutMs: 100, maxAttempts: 1 });

    expect(result).toEqual({ rates: { BRL: 5.4 }, date: '2026-09-17', source: 'stale-cache' });
  });

  it('shares one in-flight request between simultaneous calls', async () => {
    let resolveFetch: (value: { base: 'USD'; date: string; rates: Record<string, number> }) => void = () => undefined;
    const source: ExchangeRateProvider = {
      fetchRates: jest.fn(() => new Promise<{ base: 'USD'; date: string; rates: Record<string, number> }>((resolve) => { resolveFetch = resolve; })),
    };
    const service = new ExchangeRateService(source, logger());

    const first = service.getRates({ timeoutMs: 100, maxAttempts: 1 });
    const second = service.getRates({ timeoutMs: 100, maxAttempts: 1 });
    resolveFetch({ base: 'USD', date: '2026-09-17', rates: { BRL: 5.4 } });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { rates: { BRL: 5.4 }, date: '2026-09-17', source: 'api' },
      { rates: { BRL: 5.4 }, date: '2026-09-17', source: 'api' },
    ]);
    expect(source.fetchRates).toHaveBeenCalledTimes(1);
  });

  it('clears cache manually', async () => {
    let now = 0;
    const source = provider([{ BRL: 5.4 }, { BRL: 5.6 }]);
    const service = new ExchangeRateService(source, logger(), () => now);

    await service.getRates({ timeoutMs: 100, maxAttempts: 1 });
    now = 1000;
    service.clearCache();
    const result = await service.getRates({ timeoutMs: 100, maxAttempts: 1 });

    expect(result.rates.BRL).toBe(5.6);
    expect(source.fetchRates).toHaveBeenCalledTimes(2);
  });

  it('falls back directly when there are no attempts to make', async () => {
    const source = provider([{ BRL: 5.4 }]);
    const service = new ExchangeRateService(source, logger());

    const result = await service.getRates({ timeoutMs: 100, maxAttempts: 0 });

    expect(result.source).toBe('fallback-usd');
    expect(source.fetchRates).not.toHaveBeenCalled();
  });

  it('usa el logger de consola y el reintento real cuando no se inyecta ninguno', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const source = provider([new ExchangeRateProviderError('temporary', true), { BRL: 5.5 }]);
    const service = new ExchangeRateService(source);

    const result = await service.getRates({ timeoutMs: 100, maxAttempts: 2 });

    expect(result).toEqual({ rates: { BRL: 5.5 }, date: '2026-09-17', source: 'api' });
    expect(warnSpy).toHaveBeenCalledWith('Exchange rate attempt failed', expect.any(Object));

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

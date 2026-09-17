import { ExchangeRateProviderError, type ExchangeRateProvider } from '../../src/services/exchange-rate.provider.ts';
import { ExchangeRateService } from '../../src/services/exchange-rate.service.ts';
import type { ExchangeRateApiResponse } from '../../src/schemas/exchange-rate.schema.ts';

export interface FakeProvider extends ExchangeRateProvider {
  /** Cuantas veces se llamo de verdad al proveedor: sirve para probar la cache. */
  calls: number;
}

export function ratesResponse(rates: Record<string, number>, date = '2026-09-17'): ExchangeRateApiResponse {
  return { base: 'USD', date, rates };
}

/** Proveedor que siempre responde bien. */
export function workingProvider(response: ExchangeRateApiResponse = ratesResponse({ BRL: 5.4, EUR: 0.92, ARS: 1000, UYU: 40, GBP: 0.79, CLP: 950, MXN: 17 })): FakeProvider {
  const provider: FakeProvider = {
    calls: 0,
    async fetchRates() {
      provider.calls += 1;
      return response;
    },
  };
  return provider;
}

/** Proveedor que falla las primeras `failures` veces y despues responde bien. */
export function flakyProvider(failures: number, response: ExchangeRateApiResponse = ratesResponse({ BRL: 5.4 })): FakeProvider {
  const provider: FakeProvider = {
    calls: 0,
    async fetchRates() {
      provider.calls += 1;
      if (provider.calls <= failures) {
        throw new ExchangeRateProviderError('fetch failed', true);
      }
      return response;
    },
  };
  return provider;
}

/** Proveedor que siempre falla, con un error reintentable o no segun se pida. */
export function failingProvider(retryable = true): FakeProvider {
  const provider: FakeProvider = {
    calls: 0,
    async fetchRates() {
      provider.calls += 1;
      throw new ExchangeRateProviderError('network down', retryable);
    },
  };
  return provider;
}

/** Proveedor que nunca contesta: solo termina cuando el timeout aborta la senial. */
export function hangingProvider(): FakeProvider {
  const provider: FakeProvider = {
    calls: 0,
    async fetchRates(signal: AbortSignal) {
      provider.calls += 1;
      return new Promise<ExchangeRateApiResponse>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new ExchangeRateProviderError('timed out', true)));
      });
    },
  };
  return provider;
}

const silentLogger = { warn: () => {}, error: () => {} };

/**
 * Servicio real sobre un proveedor de prueba, con el reloj y las esperas
 * controlados para que los tests de vencimiento y de reintento corran en
 * milisegundos en lugar de esperar una hora.
 */
export function serviceOver(provider: ExchangeRateProvider, clock = { now: Date.now() }): ExchangeRateService {
  return new ExchangeRateService(provider, silentLogger, () => clock.now, async () => {});
}

export const UNA_HORA_MS = 60 * 60 * 1000;

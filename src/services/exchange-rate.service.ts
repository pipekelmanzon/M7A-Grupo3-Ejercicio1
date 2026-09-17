import type { CurrencySource } from '../pipeline/context.ts';
import { ExchangeRateProviderError, type ExchangeRateProvider } from './exchange-rate.provider.ts';
import type { ExchangeRateApiResponse } from '../schemas/exchange-rate.schema.ts';

export interface ExchangeRateServiceConfig {
  timeoutMs: number;
  maxAttempts: number;
}

export interface ExchangeRatesResult {
  rates: Record<string, number>;
  date: string;
  source: CurrencySource;
}

interface CacheEntry {
  rates: Record<string, number>;
  date: string;
  storedAt: number;
}

export interface ExchangeRateLogger {
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const RETRY_DELAYS_MS = [250, 500];
const consoleExchangeRateLogger: ExchangeRateLogger = {
  warn: (message, details) => console.warn(message, details),
  error: (message, details) => console.error(message, details),
};

export class ExchangeRateService {
  private cache?: CacheEntry;
  private inFlight?: Promise<ExchangeRatesResult>;
  private readonly provider: ExchangeRateProvider;
  private readonly logger: ExchangeRateLogger;
  private readonly now: () => number;
  private readonly wait: (ms: number) => Promise<void>;

  public constructor(
    provider: ExchangeRateProvider,
    logger: ExchangeRateLogger = consoleExchangeRateLogger,
    now: () => number = Date.now,
    wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.provider = provider;
    this.logger = logger;
    this.now = now;
    this.wait = wait;
  }

  public async getRates(config: ExchangeRateServiceConfig): Promise<ExchangeRatesResult> {
    const cached = this.getFreshCache();
    if (cached !== undefined) {
      return { ...cached, source: 'cache' };
    }

    if (this.inFlight !== undefined) {
      return this.inFlight;
    }

    this.inFlight = this.fetchWithFallback(config);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  public clearCache(): void {
    this.cache = undefined;
  }

  private getFreshCache(): Omit<ExchangeRatesResult, 'source'> | undefined {
    if (this.cache === undefined || this.now() - this.cache.storedAt >= CACHE_TTL_MS) {
      return undefined;
    }

    return { rates: this.cache.rates, date: this.cache.date };
  }

  private async fetchWithFallback(config: ExchangeRateServiceConfig): Promise<ExchangeRatesResult> {
    for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
      try {
        const response = await this.provider.fetchRates(AbortSignal.timeout(config.timeoutMs));
        this.store(response);
        return { rates: response.rates, date: response.date, source: 'api' };
      } catch (error) {
        const retryable = this.isRetryable(error);
        this.logger.warn('Exchange rate attempt failed', { attempt, retryable, error: this.errorMessage(error) });
        if (!retryable || attempt === config.maxAttempts) {
          this.logger.error('Exchange rate fallback activated', { attempts: attempt, error: this.errorMessage(error) });
          return this.fallback();
        }

        await this.wait(RETRY_DELAYS_MS[attempt - 1] ?? 0);
      }
    }

    return this.fallback();
  }

  private store(response: ExchangeRateApiResponse): void {
    this.cache = { rates: response.rates, date: response.date, storedAt: this.now() };
  }

  private fallback(): ExchangeRatesResult {
    if (this.cache !== undefined) {
      return { rates: this.cache.rates, date: this.cache.date, source: 'stale-cache' };
    }

    return { rates: { USD: 1 }, date: new Date(this.now()).toISOString().slice(0, 10), source: 'fallback-usd' };
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof ExchangeRateProviderError ? error.retryable : true;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown exchange rate error';
  }
}

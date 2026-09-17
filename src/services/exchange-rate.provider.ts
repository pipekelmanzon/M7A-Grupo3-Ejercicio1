import type { ExchangeRateApiResponse } from '../schemas/exchange-rate.schema.ts';

export interface ExchangeRateProvider {
  fetchRates(signal: AbortSignal): Promise<ExchangeRateApiResponse>;
}

export class ExchangeRateProviderError extends Error {
  public readonly retryable: boolean;

  public constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'ExchangeRateProviderError';
    this.retryable = retryable;
  }
}

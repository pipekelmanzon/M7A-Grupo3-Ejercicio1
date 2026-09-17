import { exchangeRateApiResponseSchema, type ExchangeRateApiResponse } from '../schemas/exchange-rate.schema.ts';
import { ExchangeRateProviderError, type ExchangeRateProvider } from './exchange-rate.provider.ts';

type FetchLike = typeof fetch;

const EXCHANGE_RATE_API_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

export class ExchangeRateApiProvider implements ExchangeRateProvider {
  private readonly fetchImpl: FetchLike;

  public constructor(fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  public async fetchRates(signal: AbortSignal): Promise<ExchangeRateApiResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(EXCHANGE_RATE_API_URL, { signal });
    } catch (error) {
      throw new ExchangeRateProviderError(error instanceof Error ? error.message : 'Network error', true);
    }

    if (!response.ok) {
      throw new ExchangeRateProviderError(`ExchangeRate-API returned ${response.status}`, response.status === 429 || response.status >= 500);
    }

    const parsed = exchangeRateApiResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new ExchangeRateProviderError('ExchangeRate-API response has an invalid shape', false);
    }

    return parsed.data;
  }
}

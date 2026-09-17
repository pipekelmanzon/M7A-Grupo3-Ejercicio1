import type { CurrencyConversion, ReservationContext } from '../pipeline/context.ts';
import type { Filter } from '../pipeline/filter.ts';
import { warn } from '../pipeline/filter.ts';
import type { ExchangeRateService, ExchangeRateServiceConfig } from '../services/exchange-rate.service.ts';
import { countryCurrency } from '../data/country-currency.ts';

const FILTER_NAME = 'exchange-rate';

export class ExchangeRateFilter implements Filter {
  public readonly name = FILTER_NAME;
  public readonly requires = ['flight'] satisfies Filter['requires'];
  public readonly critical = false;
  private readonly service: ExchangeRateService;

  public constructor(service: ExchangeRateService) {
    this.service = service;
  }

  public async run(context: ReservationContext, params: unknown): Promise<ReservationContext> {
    const destinationCountryCode = context.flight?.destinationCountryCode.toUpperCase();
    const targetCurrency = destinationCountryCode === undefined ? undefined : countryCurrency[destinationCountryCode];

    if (targetCurrency === undefined) {
      return warn(context, 'CURRENCY_NOT_SUPPORTED', `Currency is not configured for destination country ${destinationCountryCode ?? 'unknown'}`, FILTER_NAME);
    }

    if (targetCurrency === 'USD') {
      return this.withConversion(context, targetCurrency, 1, 'api', undefined);
    }

    const result = await this.service.getRates(params as ExchangeRateServiceConfig);
    if (result.source === 'fallback-usd') {
      return warn(this.withConversion(context, targetCurrency, 1, result.source, result.date), 'EXCHANGE_RATE_FALLBACK', `Exchange rate service failed; reservation remains in USD`, FILTER_NAME);
    }

    const rate = result.rates[targetCurrency];

    if (rate === undefined) {
      return warn(context, 'CURRENCY_NOT_SUPPORTED', `Exchange rate for ${targetCurrency} is not available`, FILTER_NAME);
    }

    const next = this.withConversion(context, targetCurrency, rate, result.source, result.date);
    if (result.source === 'stale-cache') {
      return warn(next, 'EXCHANGE_RATE_STALE', `Using stale exchange rate for ${targetCurrency}`, FILTER_NAME);
    }

    return next;
  }

  private withConversion(
    context: ReservationContext,
    targetCurrency: string,
    rate: number,
    source: CurrencyConversion['source'],
    ratesDate: string | undefined,
  ): ReservationContext {
    const originalBasePrice = context.flight?.basePrice ?? 0;
    const conversion: CurrencyConversion = {
      from: 'USD',
      to: source === 'fallback-usd' ? 'USD' : targetCurrency,
      rate: source === 'fallback-usd' ? 1 : rate,
      source,
      originalBasePrice,
      convertedBasePrice: originalBasePrice * (source === 'fallback-usd' ? 1 : rate),
      ...(ratesDate === undefined ? {} : { ratesDate }),
    };

    return {
      ...context,
      metadata: { ...context.metadata, currencyConversion: conversion },
    };
  }
}

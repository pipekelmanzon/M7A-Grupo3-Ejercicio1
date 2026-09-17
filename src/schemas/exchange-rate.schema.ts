import { z } from 'zod';

export const exchangeRateApiResponseSchema = z.object({
  base: z.literal('USD'),
  date: z.string(),
  rates: z.record(z.string(), z.number().finite().positive()),
});

export type ExchangeRateApiResponse = z.infer<typeof exchangeRateApiResponseSchema>;

import { z } from 'zod';

const filterConfigSchema = z.object({ enabled: z.boolean() });

export const pipelineConfigSchema = z.object({
  filters: z.object({
    'passenger-validation': filterConfigSchema,
    'flight-validation': filterConfigSchema,
    'exchange-rate': filterConfigSchema,
    'base-price': filterConfigSchema,
    'loyalty-discount': filterConfigSchema,
    'passenger-type-adjustment': filterConfigSchema,
    taxes: filterConfigSchema,
  }),
  params: z.object({
    'base-price': z.object({ economyMultiplier: z.number().positive(), businessMultiplier: z.number().positive(), firstMultiplier: z.number().positive() }),
    'loyalty-discount': z.object({ bronze: z.number().min(0).max(1), silver: z.number().min(0).max(1), gold: z.number().min(0).max(1) }),
    'passenger-type-adjustment': z.object({ child: z.number().min(0).max(1), senior: z.number().min(0).max(1) }),
    taxes: z.object({ taxRate: z.number().min(0).max(1), airportFee: z.number().nonnegative(), fuelSurchargeRate: z.number().min(0).max(1) }),
  }),
  exchange: z.object({ timeoutMs: z.number().int().min(100).max(5000), maxAttempts: z.number().int().min(1).max(3) }),
  validateContextBetweenFilters: z.boolean(),
});

export type PipelineConfig = z.infer<typeof pipelineConfigSchema>;

export const defaultPipelineConfig: PipelineConfig = {
  filters: {
    'passenger-validation': { enabled: true },
    'flight-validation': { enabled: true },
    'exchange-rate': { enabled: true },
    'base-price': { enabled: true },
    'loyalty-discount': { enabled: true },
    'passenger-type-adjustment': { enabled: true },
    taxes: { enabled: true },
  },
  params: {
    'base-price': { economyMultiplier: 1, businessMultiplier: 2.5, firstMultiplier: 4 },
    'loyalty-discount': { bronze: 0.05, silver: 0.1, gold: 0.15 },
    'passenger-type-adjustment': { child: 0.25, senior: 0.15 },
    taxes: { taxRate: 0.12, airportFee: 25, fuelSurchargeRate: 0.08 },
  },
  exchange: { timeoutMs: 5000, maxAttempts: 3 },
  validateContextBetweenFilters: true,
};
import { z } from 'zod';

const issueSchema = z.object({
  code: z.string(),
  message: z.string(),
  filter: z.string(),
});

const traceSchema = z.object({
  filter: z.string(),
  outcome: z.enum(['ok', 'rejected', 'error', 'skipped', 'disabled']),
  durationMs: z.number().finite().nonnegative(),
});

const passengerSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().finite().nonnegative(),
  type: z.enum(['adult', 'child', 'senior']),
  email: z.string(),
  active: z.boolean(),
  loyaltyTier: z.enum(['none', 'bronze', 'silver', 'gold']),
  countryCode: z.string(),
});

const flightSchema = z.object({
  code: z.string(),
  origin: z.string(),
  destination: z.string(),
  destinationCountryCode: z.string(),
  departureDate: z.string(),
  basePrice: z.number().finite().nonnegative(),
  availableSeats: z.number().finite().nonnegative(),
  durationMinutes: z.number().finite().nonnegative(),
});

const pricingSchema = z.object({
  currency: z.literal('USD'),
  basePrice: z.number().finite().nonnegative().optional(),
  loyaltyDiscount: z.number().finite().nonnegative().optional(),
  passengerTypeDiscount: z.number().finite().nonnegative().optional(),
  subtotal: z.number().finite().nonnegative().optional(),
  taxes: z.number().finite().nonnegative().optional(),
  fuelSurcharge: z.number().finite().nonnegative().optional(),
  airportFee: z.number().finite().nonnegative().optional(),
  total: z.number().finite().nonnegative().optional(),
});

const conversionSchema = z.object({
  from: z.literal('USD'),
  to: z.string(),
  rate: z.number().finite().positive(),
  source: z.enum(['api', 'cache', 'stale-cache', 'fallback-usd']),
  ratesDate: z.string().optional(),
  originalBasePrice: z.number().finite().nonnegative(),
  convertedBasePrice: z.number().finite().nonnegative(),
});

export const reservationContextSchema = z.object({
  request: z.object({
    reservationId: z.string(),
    passengerId: z.string(),
    flightCode: z.string(),
    origin: z.string(),
    destination: z.string(),
    departureDate: z.string(),
    seatClass: z.enum(['economy', 'business', 'first']),
    passengerType: z.enum(['adult', 'child', 'senior']),
  }),
  status: z.enum(['processing', 'completed', 'completed_with_warnings', 'rejected', 'error']),
  halted: z.boolean(),
  passenger: passengerSchema.optional(),
  flight: flightSchema.optional(),
  pricing: pricingSchema,
  metadata: z.object({ currencyConversion: conversionSchema.optional() }),
  errors: z.array(issueSchema),
  warnings: z.array(issueSchema),
  trace: z.array(traceSchema),
});
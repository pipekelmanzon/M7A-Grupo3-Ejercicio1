import type { ReservationContext, Issue, PriceBreakdown } from './context.ts';

export type ContextField = 'passenger' | 'flight' | 'pricing.basePrice' | 'pricing.subtotal';

export interface Filter {
  name: string;
  requires: ContextField[];
  critical: boolean;
  run(context: ReservationContext, params: unknown): Promise<ReservationContext>;
}

function issue(code: string, message: string, filter: string): Issue {
  return { code, message, filter };
}

export function reject(context: ReservationContext, code: string, message: string, filter: string): ReservationContext {
  return {
    ...context,
    status: 'rejected',
    halted: true,
    errors: [...context.errors, issue(code, message, filter)],
  };
}

export function warn(context: ReservationContext, code: string, message: string, filter: string): ReservationContext {
  return {
    ...context,
    warnings: [...context.warnings, issue(code, message, filter)],
  };
}

export function withPricing(context: ReservationContext, pricing: Partial<PriceBreakdown>): ReservationContext {
  return {
    ...context,
    pricing: { ...context.pricing, ...pricing },
  };
}
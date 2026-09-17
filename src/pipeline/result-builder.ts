import type { ReservationContext, PriceBreakdown, Issue, TraceEntry } from './context.ts';
import { round2 } from '../utils/money.ts';

export interface ReservationResult {
  reservationId: string;
  status: 'completed' | 'completed_with_warnings' | 'rejected' | 'error';
  pricing?: PriceBreakdown;
  localPricing?: { currency: string; rate: number; total: number };
  metadata: ReservationContext['metadata'];
  errors: Issue[];
  warnings: Issue[];
  trace: TraceEntry[];
}

function roundedPricing(pricing: PriceBreakdown): PriceBreakdown {
  const result: PriceBreakdown = { currency: 'USD' };
  for (const key of ['basePrice', 'loyaltyDiscount', 'passengerTypeDiscount', 'subtotal', 'taxes', 'fuelSurcharge', 'airportFee', 'total'] as const) {
    const value = pricing[key];
    if (value !== undefined) result[key] = round2(value);
  }
  return result;
}

export function buildResult(context: ReservationContext): ReservationResult {
  const status = context.status === 'rejected'
    ? 'rejected'
    : context.status === 'error' || context.errors.length > 0
      ? 'error'
      : context.halted
      ? 'rejected'
      : context.warnings.length > 0
        ? 'completed_with_warnings'
        : 'completed';
  const pricing = context.pricing.total === undefined ? undefined : roundedPricing(context.pricing);
  const conversion = context.metadata.currencyConversion;
  const localPricing = pricing?.total !== undefined && conversion
    ? { currency: conversion.to, rate: round2(conversion.rate), total: round2(pricing.total * conversion.rate) }
    : undefined;

  return {
    reservationId: context.request.reservationId,
    status,
    ...(pricing === undefined ? {} : { pricing }),
    ...(localPricing === undefined ? {} : { localPricing }),
    metadata: context.metadata,
    errors: context.errors,
    warnings: context.warnings,
    trace: context.trace,
  };
}
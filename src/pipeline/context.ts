import type { Flight, Passenger, ReservationRequest } from '../domain/types.ts';

export type ProcessingStatus = 'processing' | 'completed' | 'completed_with_warnings' | 'rejected' | 'error';
export type CurrencySource = 'api' | 'cache' | 'stale-cache' | 'fallback-usd';

export interface PriceBreakdown {
  currency: 'USD';
  basePrice?: number;
  loyaltyDiscount?: number;
  passengerTypeDiscount?: number;
  subtotal?: number;
  taxes?: number;
  fuelSurcharge?: number;
  airportFee?: number;
  total?: number;
}

export interface CurrencyConversion {
  from: 'USD';
  to: string;
  rate: number;
  source: CurrencySource;
  ratesDate?: string;
  originalBasePrice: number;
  convertedBasePrice: number;
}

export interface ReservationMetadata {
  currencyConversion?: CurrencyConversion;
}

export interface Issue {
  code: string;
  message: string;
  filter: string;
}

export type TraceOutcome = 'ok' | 'rejected' | 'error' | 'skipped' | 'disabled';

export interface TraceEntry {
  filter: string;
  outcome: TraceOutcome;
  durationMs: number;
}

export interface ReservationContext {
  request: ReservationRequest;
  status: ProcessingStatus;
  halted: boolean;
  passenger?: Passenger;
  flight?: Flight;
  pricing: PriceBreakdown;
  metadata: ReservationMetadata;
  errors: Issue[];
  warnings: Issue[];
  trace: TraceEntry[];
}

export function createInitialContext(request: ReservationRequest): ReservationContext {
  return {
    request,
    status: 'processing',
    halted: false,
    pricing: { currency: 'USD' },
    metadata: {},
    errors: [],
    warnings: [],
    trace: [],
  };
}
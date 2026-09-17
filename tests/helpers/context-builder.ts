import { createInitialContext } from '../../src/pipeline/context';
import type { PriceBreakdown, ReservationContext } from '../../src/pipeline/context';
import type { Flight, Passenger, ReservationRequest } from '../../src/domain/types';

export function buildRequest(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
  return {
    reservationId: 'R-1',
    passengerId: 'P-1',
    flightCode: 'F-1',
    origin: 'MVD',
    destination: 'GRU',
    departureDate: '2099-01-01',
    seatClass: 'economy',
    passengerType: 'adult',
    ...overrides,
  };
}

export function buildPassenger(overrides: Partial<Passenger> = {}): Passenger {
  return {
    id: 'P-1',
    name: 'Ana Perez',
    age: 30,
    type: 'adult',
    email: 'ana@example.com',
    active: true,
    loyaltyTier: 'none',
    countryCode: 'UY',
    ...overrides,
  };
}

export function buildFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    code: 'F-1',
    origin: 'MVD',
    destination: 'GRU',
    destinationCountryCode: 'BR',
    departureDate: '2099-01-01',
    basePrice: 300,
    availableSeats: 10,
    durationMinutes: 240,
    ...overrides,
  };
}

interface BuildContextOptions {
  request?: Partial<ReservationRequest>;
  /** Pasar `null` omite el pasajero del contexto, para probar dependencias faltantes. */
  passenger?: Partial<Passenger> | null;
  /** Pasar `null` omite el vuelo del contexto, para probar dependencias faltantes. */
  flight?: Partial<Flight> | null;
  pricing?: Partial<PriceBreakdown>;
}

/**
 * Arma un ReservationContext de prueba con valores por defecto razonables.
 * Por defecto incluye un pasajero y un vuelo válidos, para que los filtros
 * de precio puedan correr sin armar todo el objeto a mano en cada test.
 */
export function buildContext(options: BuildContextOptions = {}): ReservationContext {
  const request = buildRequest(options.request);
  const base = createInitialContext(request);
  const passenger = options.passenger === null ? undefined : buildPassenger(options.passenger);
  const flight = options.flight === null ? undefined : buildFlight(options.flight);

  return {
    ...base,
    ...(passenger ? { passenger } : {}),
    ...(flight ? { flight } : {}),
    pricing: { ...base.pricing, ...options.pricing },
  };
}

import { createApp } from '../../src/app.ts';
import { loadEnv } from '../../src/config/env.ts';
import { createContainer, type Container, type ContainerOverrides } from '../../src/container.ts';
import { mockFlights } from '../../src/data/mockFlights.ts';
import type { Flight } from '../../src/domain/types.ts';
import type { ReservationRequest } from '../../src/domain/types.ts';
import { serviceOver, workingProvider } from './fake-exchange-rate.ts';

/**
 * Levanta la app completa sobre un contenedor propio de cada test.
 *
 * Por defecto inyecta un servicio de tipo de cambio sobre un proveedor
 * simulado: ningun test toca la red, ni siquiera los que no hablan de tasas.
 */
export function buildTestApp(overrides: ContainerOverrides = {}): { app: ReturnType<typeof createApp>; container: Container } {
  const container = createContainer({
    env: loadEnv({ NODE_ENV: 'test' }),
    ...(overrides.exchangeRateService || overrides.exchangeRateProvider
      ? {}
      : { exchangeRateService: serviceOver(workingProvider()) }),
    ...overrides,
  });
  return { app: createApp(container), container };
}

export function flightByCode(code: string): Flight {
  const flight = mockFlights.find((candidate) => candidate.code === code);
  if (!flight) throw new Error(`El vuelo ${code} no esta en los datos mock`);
  return flight;
}

/**
 * Arma una reserva valida para un vuelo mock. Toma origen, destino y fecha del
 * propio vuelo, porque las fechas mock se calculan en relacion al arranque y
 * escribirlas a mano haria fallar la validacion de vuelo.
 */
export function reservationFor(
  flightCode: string,
  passengerId: string,
  overrides: Partial<ReservationRequest> = {},
): ReservationRequest {
  const flight = flightByCode(flightCode);
  return {
    reservationId: `R-${flightCode}-${passengerId}`,
    passengerId,
    flightCode: flight.code,
    origin: flight.origin,
    destination: flight.destination,
    departureDate: flight.departureDate,
    seatClass: 'economy',
    passengerType: 'adult',
    ...overrides,
  };
}

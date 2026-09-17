import { createFlightValidationFilter } from '../../../src/filters/flight-validation.filter.ts';
import { createInitialContext } from '../../../src/pipeline/context.ts';
import type { Flight, ReservationRequest } from '../../../src/domain/types.ts';
import type { FlightRepository } from '../../../src/repositories/flight.repository.ts';

function request(overrides: Partial<ReservationRequest> = {}): ReservationRequest {
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

function flight(overrides: Partial<Flight> = {}): Flight {
  return {
    code: 'F-1',
    origin: 'MVD',
    destination: 'GRU',
    destinationCountryCode: 'BR',
    departureDate: '2099-01-01',
    basePrice: 500,
    availableSeats: 10,
    durationMinutes: 200,
    ...overrides,
  };
}

function repoWith(found: Flight | undefined): FlightRepository {
  return { findByCode: jest.fn().mockResolvedValue(found) };
}

describe('flight-validation filter', () => {
  it('acepta un vuelo válido y agrega el vuelo al contexto', async () => {
    const filter = createFlightValidationFilter(repoWith(flight()));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.halted).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.flight).toEqual(flight());
  });

  it('rechaza si el vuelo no existe', async () => {
    const filter = createFlightValidationFilter(repoWith(undefined));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.halted).toBe(true);
    expect(result.status).toBe('rejected');
    expect(result.errors[0]?.code).toBe('FLIGHT_NOT_FOUND');
  });

  it('rechaza si no hay asientos disponibles', async () => {
    const filter = createFlightValidationFilter(repoWith(flight({ availableSeats: 0 })));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.errors[0]?.code).toBe('NO_SEATS_AVAILABLE');
  });

  it('rechaza si el origen no coincide', async () => {
    const filter = createFlightValidationFilter(repoWith(flight({ origin: 'EZE' })));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.errors[0]?.code).toBe('ROUTE_MISMATCH');
  });

  it('rechaza si el destino no coincide', async () => {
    const filter = createFlightValidationFilter(repoWith(flight({ destination: 'MAD' })));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.errors[0]?.code).toBe('ROUTE_MISMATCH');
  });

  it('rechaza si la fecha no coincide', async () => {
    const filter = createFlightValidationFilter(repoWith(flight({ departureDate: '2099-06-01' })));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.errors[0]?.code).toBe('FLIGHT_DATE_MISMATCH');
  });

  it('rechaza si la fecha ya pasó', async () => {
    const filter = createFlightValidationFilter(repoWith(flight({ departureDate: '2020-01-01' })));

    const result = await filter.run(
      createInitialContext(request({ departureDate: '2020-01-01' })),
      undefined,
    );

    expect(result.errors[0]?.code).toBe('FLIGHT_DATE_IN_PAST');
  });
});

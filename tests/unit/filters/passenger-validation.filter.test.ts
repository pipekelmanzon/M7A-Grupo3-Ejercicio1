import { createPassengerValidationFilter } from '../../../src/filters/passenger-validation.filter.ts';
import { createInitialContext } from '../../../src/pipeline/context.ts';
import type { Passenger, ReservationRequest } from '../../../src/domain/types.ts';
import type { PassengerRepository } from '../../../src/repositories/passenger.repository.ts';

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

function passenger(overrides: Partial<Passenger> = {}): Passenger {
  return {
    id: 'P-1',
    name: 'Passenger Test',
    age: 30,
    type: 'adult',
    email: 'test@example.com',
    active: true,
    loyaltyTier: 'none',
    countryCode: 'UY',
    ...overrides,
  };
}

function repoWith(found: Passenger | undefined): PassengerRepository {
  return { findById: jest.fn().mockResolvedValue(found) };
}

describe('passenger-validation filter', () => {
  it('acepta un pasajero válido y agrega el pasajero al contexto', async () => {
    const filter = createPassengerValidationFilter(repoWith(passenger()));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.halted).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.passenger).toEqual(passenger());
  });

  it('rechaza si el pasajero no existe', async () => {
    const filter = createPassengerValidationFilter(repoWith(undefined));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.halted).toBe(true);
    expect(result.status).toBe('rejected');
    expect(result.errors[0]?.code).toBe('PASSENGER_NOT_FOUND');
  });

  it('rechaza si el pasajero está inactivo', async () => {
    const filter = createPassengerValidationFilter(repoWith(passenger({ active: false })));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.errors[0]?.code).toBe('PASSENGER_INACTIVE');
  });

  it('rechaza si el email no es válido', async () => {
    const filter = createPassengerValidationFilter(repoWith(passenger({ email: 'sin-arroba' })));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.errors[0]?.code).toBe('INVALID_EMAIL');
  });

  it('rechaza si el nombre está vacío', async () => {
    const filter = createPassengerValidationFilter(repoWith(passenger({ name: '   ' })));

    const result = await filter.run(createInitialContext(request()), undefined);

    expect(result.errors[0]?.code).toBe('INVALID_NAME');
  });

  it('rechaza si un adulto declarado tiene menos de 12 años', async () => {
    const filter = createPassengerValidationFilter(repoWith(passenger({ age: 10 })));

    const result = await filter.run(createInitialContext(request({ passengerType: 'adult' })), undefined);

    expect(result.errors[0]?.code).toBe('PASSENGER_TYPE_MISMATCH');
  });

  it('rechaza si un adulto de 30 años se declara como child', async () => {
    const filter = createPassengerValidationFilter(repoWith(passenger({ age: 30 })));

    const result = await filter.run(createInitialContext(request({ passengerType: 'child' })), undefined);

    expect(result.errors[0]?.code).toBe('PASSENGER_TYPE_MISMATCH');
  });

  it('acepta un menor de 12 años declarado como child', async () => {
    const filter = createPassengerValidationFilter(repoWith(passenger({ age: 8 })));

    const result = await filter.run(createInitialContext(request({ passengerType: 'child' })), undefined);

    expect(result.halted).toBe(false);
  });

  it('acepta un mayor de 65 años declarado como senior', async () => {
    const filter = createPassengerValidationFilter(repoWith(passenger({ age: 70 })));

    const result = await filter.run(createInitialContext(request({ passengerType: 'senior' })), undefined);

    expect(result.halted).toBe(false);
  });
});

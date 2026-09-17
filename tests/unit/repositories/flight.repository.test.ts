import { InMemoryFlightRepository } from '../../../src/repositories/flight.repository.ts';
import type { Flight } from '../../../src/domain/types.ts';

const flight: Flight = {
  code: 'F1',
  origin: 'MVD',
  destination: 'GRU',
  destinationCountryCode: 'BR',
  departureDate: '2099-01-01',
  basePrice: 500,
  availableSeats: 10,
  durationMinutes: 200,
};

describe('InMemoryFlightRepository', () => {
  it('encuentra un vuelo por código', async () => {
    const repo = new InMemoryFlightRepository([flight]);

    await expect(repo.findByCode('F1')).resolves.toEqual(flight);
  });

  it('devuelve undefined si no existe', async () => {
    const repo = new InMemoryFlightRepository([flight]);

    await expect(repo.findByCode('nope')).resolves.toBeUndefined();
  });

  it('usa los vuelos mock por defecto', async () => {
    const repo = new InMemoryFlightRepository();

    await expect(repo.findByCode('AA001')).resolves.toBeDefined();
  });
});

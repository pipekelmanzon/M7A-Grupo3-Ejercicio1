import { InMemoryPassengerRepository } from '../../../src/repositories/passenger.repository.ts';
import type { Passenger } from '../../../src/domain/types.ts';

const passenger: Passenger = {
  id: 'P1',
  name: 'Test',
  age: 30,
  type: 'adult',
  email: 'test@example.com',
  active: true,
  loyaltyTier: 'none',
  countryCode: 'UY',
};

describe('InMemoryPassengerRepository', () => {
  it('encuentra un pasajero por id', async () => {
    const repo = new InMemoryPassengerRepository([passenger]);

    await expect(repo.findById('P1')).resolves.toEqual(passenger);
  });

  it('devuelve undefined si no existe', async () => {
    const repo = new InMemoryPassengerRepository([passenger]);

    await expect(repo.findById('nope')).resolves.toBeUndefined();
  });

  it('usa los pasajeros mock por defecto', async () => {
    const repo = new InMemoryPassengerRepository();

    await expect(repo.findById('P001')).resolves.toBeDefined();
  });
});

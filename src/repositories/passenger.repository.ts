import type { Passenger } from '../domain/types.ts';
import { mockPassengers } from '../data/mockPassengers.ts';

export interface PassengerRepository {
  findById(id: string): Promise<Passenger | undefined>;
}

export class InMemoryPassengerRepository implements PassengerRepository {
  private readonly passengers: Map<string, Passenger>;

  public constructor(passengers: Passenger[] = mockPassengers) {
    this.passengers = new Map(passengers.map((passenger) => [passenger.id, passenger]));
  }

  public async findById(id: string): Promise<Passenger | undefined> {
    return this.passengers.get(id);
  }
}

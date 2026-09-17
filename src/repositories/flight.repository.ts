import type { Flight } from '../domain/types.ts';
import { mockFlights } from '../data/mockFlights.ts';

export interface FlightRepository {
  findByCode(code: string): Promise<Flight | undefined>;
}

export class InMemoryFlightRepository implements FlightRepository {
  private readonly flights: Map<string, Flight>;

  public constructor(flights: Flight[] = mockFlights) {
    this.flights = new Map(flights.map((flight) => [flight.code, flight]));
  }

  public async findByCode(code: string): Promise<Flight | undefined> {
    return this.flights.get(code);
  }
}

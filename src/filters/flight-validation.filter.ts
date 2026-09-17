import type { Filter } from '../pipeline/filter.ts';
import { reject } from '../pipeline/filter.ts';
import type { FlightRepository } from '../repositories/flight.repository.ts';

const FILTER_NAME = 'flight-validation';

export function createFlightValidationFilter(repository: FlightRepository): Filter {
  return {
    name: FILTER_NAME,
    requires: [],
    critical: true,
    async run(context) {
      const { request } = context;
      const flight = await repository.findByCode(request.flightCode);

      if (!flight) {
        return reject(context, 'FLIGHT_NOT_FOUND', `No existe el vuelo ${request.flightCode}`, FILTER_NAME);
      }
      if (flight.availableSeats <= 0) {
        return reject(context, 'NO_SEATS_AVAILABLE', `El vuelo ${flight.code} no tiene asientos disponibles`, FILTER_NAME);
      }
      if (flight.origin !== request.origin || flight.destination !== request.destination) {
        return reject(context, 'ROUTE_MISMATCH', `La ruta solicitada no coincide con el vuelo ${flight.code}`, FILTER_NAME);
      }
      if (flight.departureDate !== request.departureDate) {
        return reject(context, 'FLIGHT_DATE_MISMATCH', `La fecha solicitada no coincide con el vuelo ${flight.code}`, FILTER_NAME);
      }
      if (new Date(flight.departureDate).getTime() <= Date.now()) {
        return reject(context, 'FLIGHT_DATE_IN_PAST', `El vuelo ${flight.code} ya partió`, FILTER_NAME);
      }

      return { ...context, flight };
    },
  };
}

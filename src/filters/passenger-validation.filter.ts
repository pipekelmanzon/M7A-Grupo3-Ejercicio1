import { z } from 'zod';
import type { Filter } from '../pipeline/filter.ts';
import { reject } from '../pipeline/filter.ts';
import type { PassengerRepository } from '../repositories/passenger.repository.ts';
import type { PassengerType } from '../domain/types.ts';

const FILTER_NAME = 'passenger-validation';
const emailSchema = z.string().email();

function expectedType(age: number): PassengerType {
  if (age < 12) return 'child';
  if (age > 65) return 'senior';
  return 'adult';
}

export function createPassengerValidationFilter(repository: PassengerRepository): Filter {
  return {
    name: FILTER_NAME,
    requires: [],
    critical: true,
    async run(context) {
      const passenger = await repository.findById(context.request.passengerId);

      if (!passenger) {
        return reject(context, 'PASSENGER_NOT_FOUND', `No existe el pasajero ${context.request.passengerId}`, FILTER_NAME);
      }
      if (!passenger.active) {
        return reject(context, 'PASSENGER_INACTIVE', `El pasajero ${passenger.id} no está activo`, FILTER_NAME);
      }
      if (!emailSchema.safeParse(passenger.email).success) {
        return reject(context, 'INVALID_EMAIL', `El email del pasajero ${passenger.id} no es válido`, FILTER_NAME);
      }
      if (passenger.name.trim().length === 0) {
        return reject(context, 'INVALID_NAME', `El nombre del pasajero ${passenger.id} está vacío`, FILTER_NAME);
      }
      if (expectedType(passenger.age) !== context.request.passengerType) {
        return reject(context, 'PASSENGER_TYPE_MISMATCH', `El tipo declarado no coincide con la edad del pasajero ${passenger.id}`, FILTER_NAME);
      }

      return { ...context, passenger };
    },
  };
}

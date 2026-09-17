import type { Flight } from '../domain/types.ts';

function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Fechas calculadas en relación con el arranque del proceso, salvo AA0999,
 * que siempre queda en el pasado para probar la validación de fecha.
 */
export const mockFlights: Flight[] = [
  { code: 'AA001', origin: 'JFK', destination: 'MIA', destinationCountryCode: 'US', departureDate: daysFromNow(10), basePrice: 300, availableSeats: 50, durationMinutes: 180 },
  { code: 'LA4567', origin: 'MVD', destination: 'GRU', destinationCountryCode: 'BR', departureDate: daysFromNow(15), basePrice: 620, availableSeats: 40, durationMinutes: 240 },
  { code: 'AR1140', origin: 'EZE', destination: 'MAD', destinationCountryCode: 'ES', departureDate: daysFromNow(20), basePrice: 950, availableSeats: 30, durationMinutes: 660 },
  { code: 'IB6844', origin: 'MAD', destination: 'EZE', destinationCountryCode: 'AR', departureDate: daysFromNow(18), basePrice: 980, availableSeats: 35, durationMinutes: 655 },
  { code: 'UX0045', origin: 'MVD', destination: 'MAD', destinationCountryCode: 'ES', departureDate: daysFromNow(12), basePrice: 900, availableSeats: 0, durationMinutes: 650 },
  { code: 'CM0201', origin: 'PTY', destination: 'MVD', destinationCountryCode: 'UY', departureDate: daysFromNow(9), basePrice: 410, availableSeats: 2, durationMinutes: 320 },
  { code: 'AA0999', origin: 'JFK', destination: 'MIA', destinationCountryCode: 'US', departureDate: daysFromNow(-5), basePrice: 300, availableSeats: 50, durationMinutes: 180 },
  { code: 'JL0006', origin: 'MVD', destination: 'NRT', destinationCountryCode: 'JP', departureDate: daysFromNow(25), basePrice: 1200, availableSeats: 20, durationMinutes: 780 },
];

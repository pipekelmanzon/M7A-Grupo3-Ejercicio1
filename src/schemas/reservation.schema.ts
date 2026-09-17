import { z } from 'zod';
import type { ReservationRequest } from '../domain/types.ts';

const iataCode = z.string().trim().regex(/^[A-Z]{3}$/, 'debe ser un codigo IATA de 3 letras mayusculas');

/**
 * Esquema de una reserva suelta. La validacion es en dos niveles a proposito:
 * el lote solo exige ser un array de 1 a 100 elementos, y cada elemento se
 * valida por separado. Asi una reserva mal formada se marca como rechazada
 * sin tumbar al resto del lote (ADR-003).
 */
export const reservationSchema = z.object({
  reservationId: z.string().trim().min(1),
  passengerId: z.string().trim().min(1),
  flightCode: z.string().trim().min(1),
  origin: iataCode,
  destination: iataCode,
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'debe tener formato YYYY-MM-DD'),
  seatClass: z.enum(['economy', 'business', 'first']),
  passengerType: z.enum(['adult', 'child', 'senior']),
});

/** Primer nivel: la forma del lote. Si esto falla, el endpoint responde 400. */
export const reservationBatchSchema = z.object({
  reservations: z.array(z.unknown()).min(1, 'el lote debe tener al menos 1 reserva').max(100, 'el lote no puede superar las 100 reservas'),
});

export type ReservationBatch = z.infer<typeof reservationBatchSchema>;

export interface ParsedReservation {
  index: number;
  reservationId: string;
  request?: ReservationRequest;
  problems?: string[];
}

/**
 * Saca un identificador utilizable incluso de una reserva mal formada, para
 * que el resultado rechazado se pueda correlacionar con lo que mando el
 * cliente. Si ni siquiera eso viene, se usa la posicion en el lote.
 */
function readReservationId(value: unknown, index: number): string {
  if (typeof value === 'object' && value !== null && 'reservationId' in value) {
    const raw = (value as { reservationId: unknown }).reservationId;
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  }
  return `desconocida-${index + 1}`;
}

/** Segundo nivel: valida cada reserva por separado. */
export function parseReservation(value: unknown, index: number): ParsedReservation {
  const parsed = reservationSchema.safeParse(value);
  if (parsed.success) {
    return { index, reservationId: parsed.data.reservationId, request: parsed.data };
  }
  return {
    index,
    reservationId: readReservationId(value, index),
    problems: parsed.error.issues.map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`),
  };
}

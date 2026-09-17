import { parseReservation, reservationBatchSchema } from '../../../src/schemas/reservation.schema.ts';
import { reservationFor } from '../../helpers/app-builder.ts';

describe('esquema del lote', () => {
  it('acepta un lote de entre 1 y 100 reservas sin mirar el contenido', () => {
    // El primer nivel solo valida la forma del lote: las reservas se validan
    // despues, una por una, para que una mala no tumbe a las demas.
    expect(reservationBatchSchema.safeParse({ reservations: [{ cualquiera: true }] }).success).toBe(true);
  });

  it.each([
    ['sin reservations', {}],
    ['con el lote vacio', { reservations: [] }],
    ['con reservations que no es array', { reservations: 'R-1' }],
    ['con 101 reservas', { reservations: Array.from({ length: 101 }, () => ({})) }],
  ])('rechaza el lote %s', (_caso, body) => {
    expect(reservationBatchSchema.safeParse(body).success).toBe(false);
  });
});

describe('esquema de una reserva', () => {
  it('acepta una reserva bien formada', () => {
    const reserva = reservationFor('LA4567', 'P001');
    expect(parseReservation(reserva, 0)).toEqual({ index: 0, reservationId: reserva.reservationId, request: reserva });
  });

  it('recorta los espacios de los identificadores', () => {
    const parsed = parseReservation({ ...reservationFor('LA4567', 'P001'), reservationId: '  R-9  ' }, 0);
    expect(parsed.request?.reservationId).toBe('R-9');
  });

  it.each([
    ['una clase inexistente', { seatClass: 'primera-clase' }],
    ['un tipo de pasajero inexistente', { passengerType: 'bebe' }],
    ['una fecha con otro formato', { departureDate: '15/10/2026' }],
    ['un origen que no es IATA', { origin: 'Montevideo' }],
    ['un id vacio', { reservationId: '   ' }],
  ])('rechaza una reserva con %s', (_caso, override) => {
    const parsed = parseReservation({ ...reservationFor('LA4567', 'P001'), ...override }, 0);
    expect(parsed.request).toBeUndefined();
    expect(parsed.problems?.length).toBeGreaterThan(0);
  });

  it('conserva el id de una reserva mal formada para poder correlacionarla', () => {
    expect(parseReservation({ reservationId: 'R-ROTA' }, 3).reservationId).toBe('R-ROTA');
  });

  it('usa la posicion en el lote cuando la reserva no tiene id usable', () => {
    expect(parseReservation({ reservationId: 42 }, 3).reservationId).toBe('desconocida-4');
    expect(parseReservation(null, 0).reservationId).toBe('desconocida-1');
  });
});

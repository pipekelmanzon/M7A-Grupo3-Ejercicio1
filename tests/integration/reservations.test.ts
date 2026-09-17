import request from 'supertest';
import { buildTestApp, flightByCode, reservationFor } from '../helpers/app-builder.ts';

/**
 * Casos de la letra: flujo basico y calculo de precios. Los totales estan
 * verificados a mano en cada test, con los parametros por defecto del pipeline
 * (economy 1, business 2,5, first 4; bronze 5 %, silver 10 %, gold 15 %;
 * child 25 %, senior 15 %; impuesto 12 %, aeropuerto 25, combustible 8 %).
 */
describe('POST /reservations/process', () => {
  it('procesa una reserva valida de un pasajero existente en un vuelo disponible', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001', { seatClass: 'business' })] });

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toEqual({ total: 1, completed: 1, completedWithWarnings: 0, rejected: 0, error: 0 });

    const [result] = response.body.data.results;
    expect(result.status).toBe('completed');
    // 620 * 2,5 = 1550; lealtad gold 232,5; subtotal 1317,5;
    // impuesto 158,1; combustible 124; aeropuerto 25 => 1624,6
    expect(result.pricing).toEqual({
      currency: 'USD',
      basePrice: 1550,
      loyaltyDiscount: 232.5,
      passengerTypeDiscount: 0,
      subtotal: 1317.5,
      taxes: 158.1,
      fuelSurcharge: 124,
      airportFee: 25,
      total: 1624.6,
    });
    expect(result.errors).toEqual([]);
    expect(result.trace.map((entry: { filter: string }) => entry.filter)).toEqual([
      'passenger-validation',
      'flight-validation',
      'exchange-rate',
      'base-price',
      'loyalty-discount',
      'passenger-type-adjustment',
      'taxes',
    ]);
  });

  it('rechaza una reserva de un pasajero inexistente', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'NO-EXISTE')] });

    expect(response.status).toBe(200);
    const [result] = response.body.data.results;
    expect(result.status).toBe('rejected');
    expect(result.errors[0].code).toBe('PASSENGER_NOT_FOUND');
    expect(result.pricing).toBeUndefined();
    // Los filtros que siguen al rechazo quedan salteados, no ejecutados.
    expect(result.trace.slice(1).every((entry: { outcome: string }) => entry.outcome === 'skipped')).toBe(true);
  });

  it('rechaza una reserva sobre un vuelo sin asientos', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('UX0045', 'P001')] });

    expect(response.status).toBe(200);
    const [result] = response.body.data.results;
    expect(result.status).toBe('rejected');
    expect(result.errors[0].code).toBe('NO_SEATS_AVAILABLE');
  });

  it('rechaza solo la reserva mal formada y procesa el resto del lote', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          { reservationId: 'R-ROTA', passengerId: 'P001', seatClass: 'primera-clase' },
          reservationFor('AA001', 'P004'),
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toMatchObject({ total: 2, rejected: 1, completed: 1 });

    const [malformed, valid] = response.body.data.results;
    expect(malformed.reservationId).toBe('R-ROTA');
    expect(malformed.status).toBe('rejected');
    expect(malformed.errors[0].code).toBe('MALFORMED_RESERVATION');
    expect(malformed.trace).toEqual([]);
    expect(valid.status).toBe('completed');
  });

  it.each([
    ['sin el array de reservas', {}],
    ['con el lote vacio', { reservations: [] }],
    ['con mas de 100 reservas', { reservations: Array.from({ length: 101 }, () => reservationFor('AA001', 'P004')) }],
    ['con reservations que no es array', { reservations: 'R-1' }],
  ])('responde 400 %s', async (_caso, body) => {
    const { app } = buildTestApp();

    const response = await request(app).post('/reservations/process').send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('El cuerpo debe ser un lote de reservas');
  });

  it('calcula economy sin descuentos', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('AA001', 'P004')] });

    const [result] = response.body.data.results;
    expect(result.status).toBe('completed');
    // 300 * 1 = 300; sin tier ni ajuste; impuesto 36; combustible 24; aeropuerto 25 => 385
    expect(result.pricing).toMatchObject({ basePrice: 300, loyaltyDiscount: 0, passengerTypeDiscount: 0, subtotal: 300, taxes: 36, fuelSurcharge: 24, airportFee: 25, total: 385 });
  });

  it('aplica el 15 % de descuento de un pasajero gold', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001')] });

    const [result] = response.body.data.results;
    // 620; lealtad 93; subtotal 527; impuesto 63,24; combustible 49,6; aeropuerto 25 => 664,84
    expect(result.pricing).toMatchObject({ basePrice: 620, loyaltyDiscount: 93, subtotal: 527, taxes: 63.24, fuelSurcharge: 49.6, total: 664.84 });
  });

  it('combina business y descuento de nino', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('CM0201', 'P005', { seatClass: 'business', passengerType: 'child' })] });

    const [result] = response.body.data.results;
    expect(result.status).toBe('completed');
    // 410 * 2,5 = 1025; sin tier; nino 25 % => 256,25; subtotal 768,75;
    // impuesto 92,25; combustible 82; aeropuerto 25 => 968
    expect(result.pricing).toMatchObject({ basePrice: 1025, loyaltyDiscount: 0, passengerTypeDiscount: 256.25, subtotal: 768.75, taxes: 92.25, fuelSurcharge: 82, total: 968 });
  });

  it('combina primera clase, tier silver y descuento senior', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('AA001', 'P006', { seatClass: 'first', passengerType: 'senior' })] });

    const [result] = response.body.data.results;
    expect(result.status).toBe('completed');
    // 300 * 4 = 1200; silver 120 => 1080; senior 15 % => 162; subtotal 918;
    // impuesto 110,16; combustible 96; aeropuerto 25 => 1149,16
    expect(result.pricing).toMatchObject({ basePrice: 1200, loyaltyDiscount: 120, passengerTypeDiscount: 162, subtotal: 918, taxes: 110.16, fuelSurcharge: 96, total: 1149.16 });
  });

  it('procesa las reservas de un lote sin que se afecten entre si', async () => {
    const { app } = buildTestApp();
    const futuro = flightByCode('AA001').departureDate;

    const response = await request(app)
      .post('/reservations/process')
      .send({
        reservations: [
          reservationFor('LA4567', 'P001'),
          reservationFor('LA4567', 'P007'),
          { ...reservationFor('AA001', 'P004'), departureDate: futuro },
        ],
      });

    expect(response.body.data.summary).toMatchObject({ total: 3, completed: 2, rejected: 1 });
    expect(response.body.data.processingTimeMs).toBeGreaterThan(0);
  });
});

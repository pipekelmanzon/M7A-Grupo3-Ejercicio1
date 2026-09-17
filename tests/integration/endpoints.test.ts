import request from 'supertest';
import { buildTestApp, reservationFor } from '../helpers/app-builder.ts';

describe('GET /health', () => {
  it('responde ok', async () => {
    const { app } = buildTestApp();
    await request(app).get('/health').expect(200, { status: 'ok' });
  });
});

describe('rutas inexistentes', () => {
  it('responden 404 con el metodo y la ruta', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/no-existe');
    expect(response.status).toBe(404);
    expect(response.body.error.message).toContain('GET /no-existe');
  });

  it('responden 400 ante un cuerpo que no es JSON valido', async () => {
    const { app } = buildTestApp();
    const response = await request(app)
      .post('/reservations/process')
      .set('Content-Type', 'application/json')
      .send('{"reservations":');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('El cuerpo no es JSON valido');
  });

  it('responde 413 ante un cuerpo que supera el limite de tamano, no 500', async () => {
    const { app } = buildTestApp();
    const cuerpoEnorme = { reservations: [{ reservationId: 'x'.repeat(2 * 1024 * 1024) }] };
    const response = await request(app)
      .post('/reservations/process')
      .set('Content-Type', 'application/json')
      .send(cuerpoEnorme);
    expect(response.status).toBe(413);
    expect(response.body.error.message).toMatch(/grande|large|tamano/i);
  });
});

describe('GET /reservations/:id/status', () => {
  it('devuelve el ultimo resultado de una reserva ya procesada', async () => {
    const { app } = buildTestApp();
    const reserva = reservationFor('LA4567', 'P001');
    await request(app).post('/reservations/process').send({ reservations: [reserva] });

    const response = await request(app).get(`/reservations/${reserva.reservationId}/status`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ reservationId: reserva.reservationId, status: 'completed' });
  });

  it('devuelve 404 para una reserva que nunca se proceso', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/reservations/R-INEXISTENTE/status');
    expect(response.status).toBe(404);
    expect(response.body.error.message).toContain('R-INEXISTENTE');
  });
});

describe('GET /pipeline/config', () => {
  it('devuelve la configuracion, el orden de los filtros y los que estan registrados', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/pipeline/config');

    expect(response.status).toBe(200);
    expect(response.body.data.config.filters['base-price']).toEqual({ enabled: true });
    expect(response.body.data.config.params['base-price']).toEqual({ economyMultiplier: 1, businessMultiplier: 2.5, firstMultiplier: 4 });
    expect(response.body.data.filterOrder).toEqual([
      'passenger-validation', 'flight-validation', 'exchange-rate',
      'base-price', 'loyalty-discount', 'passenger-type-adjustment', 'taxes',
    ]);
    expect(response.body.data.registeredFilters).toEqual(response.body.data.filterOrder);
  });
});

describe('PUT /pipeline/config', () => {
  it('reemplaza la configuracion y el cambio se ve en el siguiente procesamiento', async () => {
    const { app } = buildTestApp();
    const { body: actual } = await request(app).get('/pipeline/config');
    const config = actual.data.config;
    config.filters['loyalty-discount'].enabled = false;

    const put = await request(app).put('/pipeline/config').send(config);
    expect(put.status).toBe(200);
    expect(put.body.data.config.filters['loyalty-discount'].enabled).toBe(false);
    expect(put.body.data.warnings).toEqual([]);

    const proceso = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001')] });

    const [result] = proceso.body.data.results;
    // Sin descuento de lealtad, el pasajero gold paga el precio base completo.
    expect(result.pricing.loyaltyDiscount).toBeUndefined();
    expect(result.pricing.subtotal).toBe(620);
    expect(result.trace.find((entry: { filter: string }) => entry.filter === 'loyalty-discount').outcome).toBe('disabled');
  });

  it('acepta reparametrizar un filtro sin tocar codigo', async () => {
    const { app } = buildTestApp();
    const { body: actual } = await request(app).get('/pipeline/config');
    const config = actual.data.config;
    config.params['base-price'].businessMultiplier = 3;

    await request(app).put('/pipeline/config').send(config).expect(200);

    const proceso = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001', { seatClass: 'business' })] });

    expect(proceso.body.data.results[0].pricing.basePrice).toBe(1860);
  });

  it('avisa por warnings cuando se deshabilita un filtro del que otro depende', async () => {
    const { app } = buildTestApp();
    const { body: actual } = await request(app).get('/pipeline/config');
    const config = actual.data.config;
    config.filters['base-price'].enabled = false;

    const response = await request(app).put('/pipeline/config').send(config);

    expect(response.status).toBe(200);
    const codigos = response.body.data.warnings.map((warning: { filter: string; dependency: string }) => `${warning.filter}:${warning.dependency}`);
    expect(codigos).toEqual(expect.arrayContaining([
      'loyalty-discount:pricing.basePrice',
      'passenger-type-adjustment:pricing.basePrice',
      'taxes:pricing.basePrice',
    ]));
  });

  it('rechaza con 400 y detalle una configuracion invalida', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .put('/pipeline/config')
      .send({ filters: { 'base-price': { enabled: 'si' } } });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Configuracion de pipeline invalida');
    expect(response.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('no aplica una configuracion invalida', async () => {
    const { app } = buildTestApp();
    await request(app).put('/pipeline/config').send({ roto: true }).expect(400);

    const response = await request(app).get('/pipeline/config');
    expect(response.body.data.config.filters['base-price'].enabled).toBe(true);
  });
});

import request from 'supertest';
import type { Filter } from '../../src/pipeline/filter.ts';
import { buildTestApp, reservationFor } from '../helpers/app-builder.ts';

/**
 * Casos de robustez de la letra. Los filtros de prueba se inyectan por la raiz
 * de composicion, tal como preve el ADR-003, para no ensuciar `src/filters`.
 */
function explodingFilter(critical: boolean): Filter {
  return {
    name: 'filtro-que-explota',
    requires: [],
    critical,
    async run() {
      throw new Error('fallo a proposito');
    },
  };
}

const corruptingFilter: Filter = {
  name: 'filtro-que-corrompe',
  requires: [],
  critical: false,
  async run(context) {
    return { ...context, pricing: { ...context.pricing, basePrice: Number.NaN } };
  },
};

describe('robustez del pipeline vista desde la API', () => {
  it('deja la reserva en error cuando un filtro lanza una excepcion, sin afectar a las demas', async () => {
    const { app } = buildTestApp({ extraFilters: [explodingFilter(false)] });

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001'), reservationFor('AA001', 'P004')] });

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toMatchObject({ total: 2, error: 2 });

    const [primera] = response.body.data.results;
    expect(primera.status).toBe('error');
    expect(primera.errors[0]).toMatchObject({ code: 'FILTER_EXCEPTION', filter: 'filtro-que-explota' });
    // El precio calculado antes de la excepcion se conserva para diagnosticar.
    expect(primera.pricing.total).toBe(664.84);
    // El stack de la excepcion no se filtra en la respuesta.
    expect(JSON.stringify(response.body)).not.toContain('at ');
  });

  it('una excepcion en un filtro de una reserva no contamina a las otras del lote', async () => {
    const soloRompeUna: Filter = {
      name: 'filtro-selectivo',
      requires: [],
      critical: true,
      async run(context) {
        if (context.request.passengerId === 'P001') throw new Error('solo esta');
        return context;
      },
    };
    const { app } = buildTestApp({ extraFilters: [soloRompeUna] });

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001'), reservationFor('AA001', 'P004')] });

    expect(response.body.data.summary).toMatchObject({ total: 2, error: 1, completed: 1 });
    expect(response.body.data.results[1].status).toBe('completed');
  });

  it('descarta el contexto corrupto y deja la reserva en error', async () => {
    const { app } = buildTestApp({ extraFilters: [corruptingFilter] });

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001')] });

    const [result] = response.body.data.results;
    expect(result.status).toBe('error');
    expect(result.errors[0]).toMatchObject({ code: 'CORRUPTED_CONTEXT', filter: 'filtro-que-corrompe' });
    // Se conserva el contexto anterior al filtro, asi que el precio sigue sano.
    expect(result.pricing.basePrice).toBe(620);
  });

  it('marca error cuando falta una dependencia de un filtro critico', async () => {
    const { app, container } = buildTestApp();
    const config = container.configStore.get();
    config.filters['flight-validation'].enabled = false;
    container.configStore.replace(config);

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001')] });

    const [result] = response.body.data.results;
    expect(result.status).toBe('error');
    expect(result.errors[0]).toMatchObject({ code: 'MISSING_DEPENDENCY', filter: 'base-price' });
  });

  it('sigue con warning cuando falta una dependencia de un filtro no critico', async () => {
    const { app, container } = buildTestApp();
    const config = container.configStore.get();
    config.filters['passenger-type-adjustment'].enabled = false;
    container.configStore.replace(config);

    const response = await request(app)
      .post('/reservations/process')
      .send({ reservations: [reservationFor('LA4567', 'P001')] });

    const [result] = response.body.data.results;
    expect(result.status).toBe('completed_with_warnings');
    expect(result.warnings[0]).toMatchObject({ code: 'MISSING_DEPENDENCY', filter: 'taxes' });
    // Sin subtotal no hay impuestos ni total, pero el precio base sigue.
    expect(result.pricing).toBeUndefined();
  });
});

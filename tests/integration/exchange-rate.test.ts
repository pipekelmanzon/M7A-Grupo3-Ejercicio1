import request from 'supertest';
import { buildTestApp, reservationFor } from '../helpers/app-builder.ts';
import {
  UNA_HORA_MS, failingProvider, flakyProvider, hangingProvider,
  ratesResponse, serviceOver, workingProvider, type FakeProvider,
} from '../helpers/fake-exchange-rate.ts';

/**
 * Casos de tipo de cambio de la letra, vistos desde la API. Corren contra el
 * servicio real: lo unico simulado es el proveedor HTTP, mas el reloj y las
 * esperas, para no depender de internet ni tardar una hora.
 */
function appOver(provider: FakeProvider, clock = { now: Date.now() }) {
  const exchangeRateService = serviceOver(provider, clock);
  const { app, container } = buildTestApp({ exchangeRateService });
  return { app, container, provider, clock };
}

async function procesar(app: ReturnType<typeof buildTestApp>['app'], flightCode: string, passengerId = 'P001') {
  const response = await request(app)
    .post('/reservations/process')
    .send({ reservations: [reservationFor(flightCode, passengerId)] });
  return { response, result: response.body.data.results[0] };
}

describe('conversion a moneda local', () => {
  it('aplica la tasa y devuelve los importes en moneda local', async () => {
    const { app } = appOver(workingProvider());

    const { result } = await procesar(app, 'LA4567');

    expect(result.status).toBe('completed');
    // total 664,84 USD por 5,4 => 3590,14 BRL
    expect(result.localPricing).toEqual({ currency: 'BRL', rate: 5.4, total: 3590.14 });
    expect(result.metadata.currencyConversion).toMatchObject({
      from: 'USD', to: 'BRL', source: 'api', originalBasePrice: 620, convertedBasePrice: 3348,
    });
  });

  it('usa la moneda del pais de destino de cada vuelo', async () => {
    const { app } = appOver(workingProvider());

    const response = await request(app).post('/reservations/process')
      .send({ reservations: [reservationFor('AR1140', 'P004'), reservationFor('IB6844', 'P004')] });

    const [aEspana, aArgentina] = response.body.data.results;
    expect(aEspana.localPricing).toEqual({ currency: 'EUR', rate: 0.92, total: 1071.8 });
    expect(aArgentina.localPricing).toEqual({ currency: 'ARS', rate: 1000, total: 1201000 });
  });

  it('no llama al proveedor cuando el destino ya cobra en USD', async () => {
    const { app, provider } = appOver(workingProvider());

    const { result } = await procesar(app, 'AA001', 'P004');

    expect(provider.calls).toBe(0);
    expect(result.localPricing).toEqual({ currency: 'USD', rate: 1, total: 385 });
  });

  it('avisa cuando el pais de destino no tiene moneda conocida', async () => {
    const { app, provider } = appOver(workingProvider());

    const { result } = await procesar(app, 'JL0006');

    expect(result.status).toBe('completed_with_warnings');
    expect(result.warnings.map((i: { code: string }) => i.code)).toContain('CURRENCY_NOT_SUPPORTED');
    expect(result.localPricing).toBeUndefined();
    expect(provider.calls).toBe(0);
  });
});

describe('cache de tasas', () => {
  it('pide las tasas una sola vez aunque se procesen dos lotes seguidos', async () => {
    const { app, provider } = appOver(workingProvider());

    const primero = await procesar(app, 'LA4567');
    const segundo = await procesar(app, 'LA4567');

    expect(provider.calls).toBe(1);
    expect(primero.result.metadata.currencyConversion.source).toBe('api');
    expect(segundo.result.metadata.currencyConversion.source).toBe('cache');
    expect(segundo.result.status).toBe('completed');
  });

  it('comparte una sola llamada entre las reservas del mismo lote', async () => {
    const { app, provider } = appOver(workingProvider());

    await request(app).post('/reservations/process').send({
      reservations: [
        reservationFor('LA4567', 'P001'),
        reservationFor('AR1140', 'P004'),
        reservationFor('IB6844', 'P004'),
      ],
    });

    expect(provider.calls).toBe(1);
  });

  it('vuelve a pedir las tasas despues de invalidar la cache', async () => {
    const { app, provider } = appOver(workingProvider());
    await procesar(app, 'LA4567');

    await request(app).delete('/exchange-rates/cache').expect(204);
    await procesar(app, 'LA4567');

    expect(provider.calls).toBe(2);
  });

  it('vuelve a pedir las tasas cuando la entrada vencio', async () => {
    const clock = { now: Date.now() };
    const { app, provider } = appOver(workingProvider(), clock);
    await procesar(app, 'LA4567');

    clock.now += UNA_HORA_MS + 1;
    const segundo = await procesar(app, 'LA4567');

    expect(provider.calls).toBe(2);
    expect(segundo.result.metadata.currencyConversion.source).toBe('api');
  });
});

describe('resiliencia ante la API externa', () => {
  it('se recupera en el segundo intento sin que la reserva se entere', async () => {
    const { app, provider } = appOver(flakyProvider(1));

    const { result } = await procesar(app, 'LA4567');

    expect(provider.calls).toBe(2);
    expect(result.status).toBe('completed');
    expect(result.warnings).toEqual([]);
  });

  it('agota los 3 intentos ante una falla de red y cae al respaldo en USD', async () => {
    const provider = failingProvider(true);
    const { app } = appOver(provider);

    const { response, result } = await procesar(app, 'LA4567');

    expect(response.status).toBe(200);
    expect(provider.calls).toBe(3);
    expect(result.status).toBe('completed_with_warnings');
    expect(result.warnings.map((i: { code: string }) => i.code)).toContain('EXCHANGE_RATE_FALLBACK');
    expect(result.pricing.currency).toBe('USD');
    expect(result.localPricing).toEqual({ currency: 'USD', rate: 1, total: result.pricing.total });
  });

  it('no reintenta ante un error que no es pasajero', async () => {
    const provider = failingProvider(false);
    const { app } = appOver(provider);

    const { result } = await procesar(app, 'LA4567');

    expect(provider.calls).toBe(1);
    expect(result.status).toBe('completed_with_warnings');
  });

  it('corta por timeout y sigue procesando el lote', async () => {
    const { app, container } = appOver(hangingProvider());
    const config = container.configStore.get();
    config.exchange.timeoutMs = 100;
    container.configStore.replace(config);

    const empezo = Date.now();
    const { response, result } = await procesar(app, 'LA4567');

    expect(response.status).toBe(200);
    // 3 intentos de 100 ms, sin las esperas entre reintentos que estan simuladas.
    expect(Date.now() - empezo).toBeLessThan(2000);
    expect(result.status).toBe('completed_with_warnings');
    expect(result.warnings.map((i: { code: string }) => i.code)).toContain('EXCHANGE_RATE_FALLBACK');
  });

  it('prefiere una tasa vencida antes que dejar todo en USD', async () => {
    const clock = { now: Date.now() };
    let falla = false;
    const provider: FakeProvider = {
      calls: 0,
      async fetchRates() {
        provider.calls += 1;
        if (falla) throw new Error('se cayo la API');
        return ratesResponse({ BRL: 5.1 }, '2026-09-16');
      },
    };
    const { app } = appOver(provider, clock);

    await procesar(app, 'LA4567');
    clock.now += UNA_HORA_MS + 1;
    falla = true;
    const { result } = await procesar(app, 'LA4567');

    expect(result.status).toBe('completed_with_warnings');
    expect(result.warnings.map((i: { code: string }) => i.code)).toContain('EXCHANGE_RATE_STALE');
    expect(result.metadata.currencyConversion).toMatchObject({ source: 'stale-cache', rate: 5.1 });
    expect(result.localPricing.currency).toBe('BRL');
  });

  it('una falla de tipo de cambio nunca rompe el lote entero', async () => {
    const { app } = appOver(failingProvider(true));

    const response = await request(app).post('/reservations/process').send({
      reservations: [reservationFor('LA4567', 'P001'), reservationFor('AA001', 'P004')] });

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toMatchObject({ total: 2, completedWithWarnings: 1, completed: 1 });
  });
});

import { ExchangeRateApiProvider } from '../../../src/services/exchange-rate-api.provider';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('ExchangeRateApiProvider', () => {
  it('devuelve las tasas parseadas ante una respuesta exitosa', async () => {
    const body = { base: 'USD', date: '2026-09-17', rates: { BRL: 5.4 } };
    const fetchImpl = jest.fn(async () => jsonResponse(200, body));
    const provider = new ExchangeRateApiProvider(fetchImpl);

    const result = await provider.fetchRates(new AbortController().signal);

    expect(result).toEqual(body);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.exchangerate-api.com/v4/latest/USD',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('marca un error de red como reintentable', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const provider = new ExchangeRateApiProvider(fetchImpl);

    await expect(provider.fetchRates(new AbortController().signal)).rejects.toMatchObject({
      name: 'ExchangeRateProviderError',
      retryable: true,
    });
  });

  it('usa un mensaje genérico si lo que se lanza no es un Error', async () => {
    const fetchImpl = jest.fn(async () => {
      throw 'boom';
    });
    const provider = new ExchangeRateApiProvider(fetchImpl);

    await expect(provider.fetchRates(new AbortController().signal)).rejects.toMatchObject({
      message: 'Network error',
      retryable: true,
    });
  });

  it.each([500, 502, 503, 429])('marca una respuesta %d como reintentable', async (status) => {
    const fetchImpl = jest.fn(async () => jsonResponse(status, {}));
    const provider = new ExchangeRateApiProvider(fetchImpl);

    await expect(provider.fetchRates(new AbortController().signal)).rejects.toMatchObject({ retryable: true });
  });

  it('marca una respuesta 404 como no reintentable', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(404, {}));
    const provider = new ExchangeRateApiProvider(fetchImpl);

    await expect(provider.fetchRates(new AbortController().signal)).rejects.toMatchObject({ retryable: false });
  });

  it('marca una respuesta con forma inválida como no reintentable', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, { foo: 'bar' }));
    const provider = new ExchangeRateApiProvider(fetchImpl);

    await expect(provider.fetchRates(new AbortController().signal)).rejects.toMatchObject({ retryable: false });
  });

  it('usa el fetch global por defecto cuando no se inyecta uno', () => {
    const provider = new ExchangeRateApiProvider();
    expect(provider).toBeInstanceOf(ExchangeRateApiProvider);
  });
});

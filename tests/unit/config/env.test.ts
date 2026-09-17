import { loadEnv } from '../../../src/config/env.ts';

describe('variables de entorno', () => {
  it('aplica los valores por defecto cuando no viene nada', () => {
    expect(loadEnv({})).toEqual({
      PORT: 3000,
      NODE_ENV: 'development',
      EXCHANGE_API_BASE_URL: 'https://api.exchangerate-api.com/v4',
      EXCHANGE_API_TIMEOUT_MS: 5000,
      EXCHANGE_API_MAX_ATTEMPTS: 3,
      EXCHANGE_CACHE_TTL_SECONDS: 3600,
    });
  });

  it('convierte los numeros que llegan como texto', () => {
    const env = loadEnv({ PORT: '8080', EXCHANGE_API_TIMEOUT_MS: '250', EXCHANGE_API_MAX_ATTEMPTS: '2' });
    expect(env).toMatchObject({ PORT: 8080, EXCHANGE_API_TIMEOUT_MS: 250, EXCHANGE_API_MAX_ATTEMPTS: 2 });
  });

  it.each([
    ['un timeout menor al minimo', { EXCHANGE_API_TIMEOUT_MS: '50' }],
    ['un timeout mayor a los 5 s de la letra', { EXCHANGE_API_TIMEOUT_MS: '9000' }],
    ['mas de 3 intentos', { EXCHANGE_API_MAX_ATTEMPTS: '5' }],
    ['0 intentos', { EXCHANGE_API_MAX_ATTEMPTS: '0' }],
    ['un puerto fuera de rango', { PORT: '70000' }],
    ['un NODE_ENV desconocido', { NODE_ENV: 'staging' }],
  ])('falla al arrancar con %s', (_caso, source) => {
    expect(() => loadEnv(source)).toThrow('Configuracion de entorno invalida');
  });

  it('nombra la variable que esta mal', () => {
    expect(() => loadEnv({ EXCHANGE_API_MAX_ATTEMPTS: '9' })).toThrow(/EXCHANGE_API_MAX_ATTEMPTS/);
  });
});

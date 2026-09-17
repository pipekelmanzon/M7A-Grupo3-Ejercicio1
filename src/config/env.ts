import { z } from 'zod';
import { env as processEnv } from 'node:process';

/**
 * Variables de entorno validadas con Zod. Los limites salen del ADR-002: el
 * timeout nunca puede pasar de los 5 s que pide la letra y los intentos nunca
 * pueden pasar de 3. Bajar el timeout por configuracion es lo que permite que
 * los tests de timeout y de reintento corran en milisegundos.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  EXCHANGE_API_BASE_URL: z.string().min(1).default('https://api.exchangerate-api.com/v4'),
  EXCHANGE_API_TIMEOUT_MS: z.coerce.number().int().min(100).max(5000).default(5000),
  EXCHANGE_API_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(3),
  EXCHANGE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida el entorno recibido. Falla ruidosamente al arrancar si algo no
 * cumple, en lugar de dejar el sistema andando con valores raros.
 */
export function loadEnv(source: Record<string, string | undefined> = processEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuracion de entorno invalida -> ${detail}`);
  }
  return parsed.data;
}

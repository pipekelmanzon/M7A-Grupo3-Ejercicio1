import type { RequestHandler } from 'express';
import type { Container } from '../../container.ts';

/**
 * Invalidacion manual de la cache, como pide la letra. Es idempotente:
 * vaciar una cache ya vacia tambien responde 204.
 */
export function invalidateCache(container: Container): RequestHandler {
  return (_request, response) => {
    container.exchangeRateService.clearCache();
    response.status(204).end();
  };
}

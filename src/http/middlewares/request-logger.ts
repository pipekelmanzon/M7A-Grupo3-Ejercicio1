import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';
import { logger } from '../../utils/logger.ts';

export const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = performance.now();
  response.on('finish', () => {
    logger.info('peticion', {
      method: request.method,
      path: request.originalUrl,
      status: response.statusCode,
      durationMs: performance.now() - startedAt,
    });
  });
  next();
};

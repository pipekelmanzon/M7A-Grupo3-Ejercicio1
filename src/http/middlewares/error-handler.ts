import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../../utils/http-error.ts';
import type { Logger } from '../../utils/logger.ts';

/**
 * Traduce cualquier error que llegue desde una ruta a una respuesta JSON.
 * El stack se registra en el log pero nunca se devuelve al cliente (ADR-003).
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, _request, response, _next) => {
    if (error instanceof HttpError) {
      logger.warn('peticion rechazada', { status: error.status, message: error.message });
      response.status(error.status).json({
        error: {
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : 'Error interno';
    logger.error('error no controlado', { error });
    response.status(500).json({ error: { message } });
  };
}

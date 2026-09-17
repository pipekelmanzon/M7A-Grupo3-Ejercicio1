import express, { type Express } from 'express';
import type { Container } from './container.ts';
import { errorHandler } from './http/middlewares/error-handler.ts';
import { notFound } from './http/middlewares/not-found.ts';
import { requestLogger } from './http/middlewares/request-logger.ts';
import { createRouter } from './http/routes/index.ts';
import { HttpError } from './utils/http-error.ts';

/** Status HTTP que trae un error de body-parser (por ejemplo 413 de raw-body). */
function bodyParserStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = 'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/** Arma la aplicacion Express sin ponerla a escuchar, para poder testearla. */
export function createApp(container: Container): Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  // express.json deja pasar los errores del cuerpo (JSON invalido, cuerpo
  // demasiado grande, etc.) como errores con status 4xx: se los traduce a
  // HttpError para no responder 500 ante un cuerpo mal escrito.
  app.use((error: unknown, _request: express.Request, _response: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
      next(new HttpError(400, 'El cuerpo no es JSON valido'));
      return;
    }
    const status = bodyParserStatus(error);
    if (status !== undefined) {
      const message = error instanceof Error ? error.message : 'Cuerpo de la peticion invalido';
      next(new HttpError(status, message));
      return;
    }
    next(error);
  });
  app.use(requestLogger);

  app.use(createRouter(container));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

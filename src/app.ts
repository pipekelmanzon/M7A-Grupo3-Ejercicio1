import express, { type Express } from 'express';
import type { Container } from './container.ts';
import { errorHandler } from './http/middlewares/error-handler.ts';
import { notFound } from './http/middlewares/not-found.ts';
import { requestLogger } from './http/middlewares/request-logger.ts';
import { createRouter } from './http/routes/index.ts';
import { HttpError } from './utils/http-error.ts';

/** Arma la aplicacion Express sin ponerla a escuchar, para poder testearla. */
export function createApp(container: Container): Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  // express.json deja pasar el error de JSON invalido como SyntaxError: se lo
  // traduce a 400 para no responder 500 ante un cuerpo mal escrito.
  app.use((error: unknown, _request: express.Request, _response: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
      next(new HttpError(400, 'El cuerpo no es JSON valido'));
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

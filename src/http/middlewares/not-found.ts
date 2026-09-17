import type { RequestHandler } from 'express';

export const notFound: RequestHandler = (request, response) => {
  response.status(404).json({ error: { message: `No existe la ruta ${request.method} ${request.originalUrl}` } });
};

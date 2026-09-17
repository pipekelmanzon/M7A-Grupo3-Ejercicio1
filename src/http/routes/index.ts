import { Router } from 'express';
import type { Container } from '../../container.ts';
import { invalidateCache } from '../controllers/exchange-rate.controller.ts';
import { getConfig, replaceConfig } from '../controllers/pipeline-config.controller.ts';
import { getStatus, processBatch } from '../controllers/reservation.controller.ts';

/**
 * La capa HTTP solo traduce: no tiene logica de negocio. Cada ruta recibe el
 * contenedor ya armado y delega en el servicio o el almacen que corresponda.
 */
export function createRouter(container: Container): Router {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  router.post('/reservations/process', processBatch(container));
  router.get('/reservations/:id/status', getStatus(container));

  router.get('/pipeline/config', getConfig(container));
  router.put('/pipeline/config', replaceConfig(container));

  router.delete('/exchange-rates/cache', invalidateCache(container));

  return router;
}

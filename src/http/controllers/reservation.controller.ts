import type { RequestHandler } from 'express';
import type { Container } from '../../container.ts';
import { reservationBatchSchema } from '../../schemas/reservation.schema.ts';
import { HttpError } from '../../utils/http-error.ts';

/**
 * Primer nivel de validacion: si el cuerpo no tiene forma de lote, se responde
 * 400 y no entra nada al pipeline. Si la tiene, se responde 200 siempre,
 * aunque todas las reservas terminen rechazadas (ADR-003).
 */
export function processBatch(container: Container): RequestHandler {
  return async (request, response, next) => {
    try {
      const parsed = reservationBatchSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(400, 'El cuerpo debe ser un lote de reservas', {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.') || '(raiz)',
            message: issue.message,
          })),
        });
      }

      const report = await container.processingService.processBatch(parsed.data.reservations);
      response.status(200).json({ data: report });
    } catch (error) {
      next(error);
    }
  };
}

export function getStatus(container: Container): RequestHandler {
  return (request, response, next) => {
    try {
      const raw = request.params.id;
      const reservationId = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
      const result = container.statusRepository.get(reservationId);
      if (result) {
        response.status(200).json({ data: result });
        return;
      }
      if (container.processingService.isProcessing(reservationId)) {
        response.status(200).json({ data: { reservationId, status: 'processing' } });
        return;
      }
      throw new HttpError(404, `No hay resultados para la reserva ${reservationId}`);
    } catch (error) {
      next(error);
    }
  };
}

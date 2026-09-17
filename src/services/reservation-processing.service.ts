import { performance } from 'node:perf_hooks';
import { createInitialContext } from '../pipeline/context.ts';
import type { Pipeline } from '../pipeline/pipeline.ts';
import type { ReservationResult } from '../pipeline/result-builder.ts';
import type { ProcessingStatusRepository } from '../repositories/processing-status.repository.ts';
import { parseReservation } from '../schemas/reservation.schema.ts';
import { logger } from '../utils/logger.ts';

export interface BatchSummary {
  total: number;
  completed: number;
  completedWithWarnings: number;
  rejected: number;
  error: number;
}

export interface BatchReport {
  processingTimeMs: number;
  summary: BatchSummary;
  results: ReservationResult[];
}

function emptySummary(total: number): BatchSummary {
  return { total, completed: 0, completedWithWarnings: 0, rejected: 0, error: 0 };
}

function summarize(results: readonly ReservationResult[]): BatchSummary {
  const summary = emptySummary(results.length);
  for (const result of results) {
    if (result.status === 'completed') summary.completed += 1;
    else if (result.status === 'completed_with_warnings') summary.completedWithWarnings += 1;
    else if (result.status === 'rejected') summary.rejected += 1;
    else summary.error += 1;
  }
  return summary;
}

function malformedResult(reservationId: string, problems: readonly string[]): ReservationResult {
  return {
    reservationId,
    status: 'rejected',
    metadata: {},
    errors: [{
      code: 'MALFORMED_RESERVATION',
      message: `La reserva no cumple el formato esperado -> ${problems.join('; ')}`,
      filter: 'input-validation',
    }],
    warnings: [],
    trace: [],
  };
}

/**
 * Procesa un lote de reservas. Cada reserva recorre el pipeline por separado
 * y en paralelo, y un problema en una nunca afecta a las demas (ADR-003).
 */
export class ReservationProcessingService {
  private readonly pipeline: Pipeline;
  private readonly statusRepository: ProcessingStatusRepository;
  /**
   * Reservas que estan pasando por el pipeline ahora mismo. Permite que un
   * GET de estado concurrente responda `processing` en vez de 404, sin tener
   * que guardar resultados a medio armar en el almacen de estados.
   */
  private readonly inFlight = new Set<string>();

  public constructor(pipeline: Pipeline, statusRepository: ProcessingStatusRepository) {
    this.pipeline = pipeline;
    this.statusRepository = statusRepository;
  }

  public isProcessing(reservationId: string): boolean {
    return this.inFlight.has(reservationId);
  }

  public async processBatch(reservations: readonly unknown[]): Promise<BatchReport> {
    const startedAt = performance.now();
    const parsed = reservations.map((value, index) => parseReservation(value, index));

    for (const item of parsed) {
      if (item.request) this.inFlight.add(item.reservationId);
    }

    try {
      const results = await Promise.all(parsed.map(async (item): Promise<ReservationResult> => {
        if (!item.request) {
          return malformedResult(item.reservationId, item.problems ?? []);
        }
        return this.pipeline.run(createInitialContext(item.request));
      }));

      for (const result of results) this.statusRepository.save(result);

      const processingTimeMs = performance.now() - startedAt;
      const summary = summarize(results);
      logger.info('lote procesado', { total: summary.total, processingTimeMs, summary });

      return { processingTimeMs, summary, results };
    } finally {
      for (const item of parsed) this.inFlight.delete(item.reservationId);
    }
  }
}

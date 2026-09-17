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

function pipelineExceptionResult(reservationId: string, error: unknown): ReservationResult {
  const message = error instanceof Error ? error.message : 'Unknown pipeline exception';
  return {
    reservationId,
    status: 'error',
    metadata: {},
    errors: [{ code: 'PIPELINE_EXCEPTION', message, filter: 'pipeline' }],
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
   * Cuantos lotes en curso estan procesando cada reservationId ahora mismo.
   * Permite que un GET de estado concurrente responda `processing` en vez de
   * 404, sin tener que guardar resultados a medio armar en el almacen de
   * estados. Es un contador y no un Set porque dos lotes concurrentes pueden
   * declarar el mismo id: el que termina primero no debe apagar la marca del
   * que sigue en curso.
   */
  private readonly inFlight = new Map<string, number>();

  public constructor(pipeline: Pipeline, statusRepository: ProcessingStatusRepository) {
    this.pipeline = pipeline;
    this.statusRepository = statusRepository;
  }

  public isProcessing(reservationId: string): boolean {
    return this.inFlight.has(reservationId);
  }

  private addInFlight(reservationId: string): void {
    this.inFlight.set(reservationId, (this.inFlight.get(reservationId) ?? 0) + 1);
  }

  private removeInFlight(reservationId: string): void {
    const count = this.inFlight.get(reservationId) ?? 0;
    if (count <= 1) this.inFlight.delete(reservationId);
    else this.inFlight.set(reservationId, count - 1);
  }

  public async processBatch(reservations: readonly unknown[]): Promise<BatchReport> {
    const startedAt = performance.now();
    const parsed = reservations.map((value, index) => parseReservation(value, index));

    for (const item of parsed) {
      if (item.request) this.addInFlight(item.reservationId);
    }

    try {
      const results = await Promise.all(parsed.map(async (item): Promise<ReservationResult> => {
        if (!item.request) {
          return malformedResult(item.reservationId, item.problems ?? []);
        }
        try {
          return await this.pipeline.run(createInitialContext(item.request));
        } catch (error) {
          return pipelineExceptionResult(item.reservationId, error);
        }
      }));

      for (const result of results) this.statusRepository.save(result);

      const processingTimeMs = performance.now() - startedAt;
      const summary = summarize(results);
      logger.info('lote procesado', { total: summary.total, processingTimeMs, summary });

      return { processingTimeMs, summary, results };
    } finally {
      for (const item of parsed) {
        if (item.request) this.removeInFlight(item.reservationId);
      }
    }
  }
}

import { Pipeline } from '../../../src/pipeline/pipeline.ts';
import { ProcessingStatusRepository } from '../../../src/repositories/processing-status.repository.ts';
import { ReservationProcessingService } from '../../../src/services/reservation-processing.service.ts';
import { createContainer } from '../../../src/container.ts';
import { loadEnv } from '../../../src/config/env.ts';
import { reservationFor } from '../../helpers/app-builder.ts';
import { serviceOver, workingProvider } from '../../helpers/fake-exchange-rate.ts';
import type { Filter } from '../../../src/pipeline/filter.ts';
import type { ReservationResult } from '../../../src/pipeline/result-builder.ts';

function serviceWith(filters: Filter[]): { service: ReservationProcessingService; repository: ProcessingStatusRepository } {
  const repository = new ProcessingStatusRepository();
  return { service: new ReservationProcessingService(new Pipeline(filters), repository), repository };
}

describe('procesamiento del lote', () => {
  it('arma el resumen por estado', async () => {
    const container = createContainer({ env: loadEnv({ NODE_ENV: 'test' }), exchangeRateService: serviceOver(workingProvider()) });

    const report = await container.processingService.processBatch([
      reservationFor('LA4567', 'P001'),
      reservationFor('LA4567', 'P007'),
      { reservationId: 'R-ROTA' },
    ]);

    expect(report.summary).toEqual({ total: 3, completed: 1, completedWithWarnings: 0, rejected: 2, error: 0 });
    expect(report.processingTimeMs).toBeGreaterThan(0);
  });

  it('guarda el resultado de cada reserva en el almacen de estados', async () => {
    const container = createContainer({ env: loadEnv({ NODE_ENV: 'test' }), exchangeRateService: serviceOver(workingProvider()) });
    const reserva = reservationFor('LA4567', 'P001');

    await container.processingService.processBatch([reserva]);

    expect(container.statusRepository.get(reserva.reservationId)).toMatchObject({ status: 'completed' });
  });

  it('marca como rechazada la reserva mal formada sin pasarla por el pipeline', async () => {
    const corre = jest.fn(async (context) => context);
    const { service } = serviceWith([{ name: 'taxes', requires: [], critical: false, run: corre }]);

    const report = await service.processBatch([{ reservationId: 'R-ROTA', passengerId: 7 }]);

    expect(corre).not.toHaveBeenCalled();
    expect(report.results[0]).toMatchObject({ reservationId: 'R-ROTA', status: 'rejected', trace: [] });
    expect(report.results[0]?.errors[0]?.code).toBe('MALFORMED_RESERVATION');
  });

  it('procesa las reservas en paralelo', async () => {
    let enCurso = 0;
    let maximoSimultaneo = 0;
    const lento: Filter = {
      name: 'taxes',
      requires: [],
      critical: false,
      async run(context) {
        enCurso += 1;
        maximoSimultaneo = Math.max(maximoSimultaneo, enCurso);
        await new Promise((resolve) => setTimeout(resolve, 5));
        enCurso -= 1;
        return context;
      },
    };
    const { service } = serviceWith([lento]);

    await service.processBatch([
      reservationFor('LA4567', 'P001'),
      reservationFor('AA001', 'P004'),
      reservationFor('CM0201', 'P005', { passengerType: 'child' }),
    ]);

    expect(maximoSimultaneo).toBe(3);
  });

  it('informa processing mientras la reserva esta en el pipeline y deja de hacerlo al terminar', async () => {
    let liberar = (): void => {};
    const bloqueado: Filter = {
      name: 'taxes',
      requires: [],
      critical: false,
      async run(context) {
        await new Promise<void>((resolve) => { liberar = resolve; });
        return context;
      },
    };
    const { service } = serviceWith([bloqueado]);
    const reserva = reservationFor('LA4567', 'P001');

    const enProceso = service.processBatch([reserva]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.isProcessing(reserva.reservationId)).toBe(true);

    liberar();
    await enProceso;
    expect(service.isProcessing(reserva.reservationId)).toBe(false);
  });

  it('sigue informando processing si otro lote concurrente con el mismo id ya termino', async () => {
    let liberarPrimera = (): void => {};
    let llamadas = 0;
    const filtro: Filter = {
      name: 'taxes',
      requires: [],
      critical: false,
      async run(context) {
        llamadas += 1;
        if (llamadas === 1) {
          await new Promise<void>((resolve) => { liberarPrimera = resolve; });
        }
        return context;
      },
    };
    const { service } = serviceWith([filtro]);
    const reserva = reservationFor('LA4567', 'P001');

    const loteLento = service.processBatch([reserva]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.isProcessing(reserva.reservationId)).toBe(true);

    await service.processBatch([reserva]);
    expect(service.isProcessing(reserva.reservationId)).toBe(true);

    liberarPrimera();
    await loteLento;
    expect(service.isProcessing(reserva.reservationId)).toBe(false);
  });

  it('aisla la falla del pipeline: una reserva rota no tumba al resto del lote', async () => {
    const repository = new ProcessingStatusRepository();
    const pipeline = new Pipeline([]);
    const resultadoOk: ReservationResult = {
      reservationId: 'R-AA001-P004', status: 'completed', metadata: {}, errors: [], warnings: [], trace: [],
    };
    jest.spyOn(pipeline, 'run')
      .mockRejectedValueOnce(new Error('el pipeline exploto'))
      .mockResolvedValueOnce(resultadoOk);
    const service = new ReservationProcessingService(pipeline, repository);
    const rota = reservationFor('LA4567', 'P001');
    const sana = reservationFor('AA001', 'P004');

    const report = await service.processBatch([rota, sana]);

    expect(report.results).toHaveLength(2);
    expect(report.results[0]).toMatchObject({ reservationId: rota.reservationId, status: 'error' });
    expect(report.results[0]?.errors[0]).toMatchObject({ code: 'PIPELINE_EXCEPTION', message: 'el pipeline exploto' });
    expect(report.results[1]).toEqual(resultadoOk);
    expect(service.isProcessing(rota.reservationId)).toBe(false);
    expect(service.isProcessing(sana.reservationId)).toBe(false);
  });
});

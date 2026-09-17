import { ProcessingStatusRepository } from '../../../src/repositories/processing-status.repository.ts';
import type { ReservationResult } from '../../../src/pipeline/result-builder.ts';

function result(overrides: Partial<ReservationResult> = {}): ReservationResult {
  return {
    reservationId: 'R-1',
    status: 'completed',
    metadata: {},
    errors: [],
    warnings: [],
    trace: [],
    ...overrides,
  };
}

describe('ProcessingStatusRepository', () => {
  it('guarda y devuelve un resultado por reservationId', () => {
    const repo = new ProcessingStatusRepository();
    repo.save(result());

    expect(repo.get('R-1')).toEqual(result());
  });

  it('devuelve undefined si no hay resultado guardado', () => {
    const repo = new ProcessingStatusRepository();

    expect(repo.get('nope')).toBeUndefined();
  });

  it('clear vacía todos los resultados guardados', () => {
    const repo = new ProcessingStatusRepository();
    repo.save(result());

    repo.clear();

    expect(repo.get('R-1')).toBeUndefined();
  });
});

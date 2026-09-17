import type { ReservationResult } from '../pipeline/result-builder.ts';

export class ProcessingStatusRepository {
  private readonly statuses = new Map<string, ReservationResult>();

  public save(result: ReservationResult): void {
    this.statuses.set(result.reservationId, result);
  }

  public get(reservationId: string): ReservationResult | undefined {
    return this.statuses.get(reservationId);
  }

  public clear(): void {
    this.statuses.clear();
  }
}

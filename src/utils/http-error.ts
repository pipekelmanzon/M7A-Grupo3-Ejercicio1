export type HttpErrorDetails = unknown;

export class HttpError extends Error {
  public readonly status: number;
  public readonly details?: HttpErrorDetails;

  public constructor(status: number, message: string, details?: HttpErrorDetails) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}
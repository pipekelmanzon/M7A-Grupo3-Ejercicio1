export interface RetryOptions {
  attempts: number;
  delaysMs?: readonly number[];
  shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
  onFailedAttempt?: (error: unknown, attempt: number) => void | Promise<void>;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function retry<T>(
  operation: (attempt: number) => T | Promise<T>,
  options: RetryOptions,
): Promise<T> {
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new RangeError('attempts must be a positive integer');
  }

  const delaysMs = options.delaysMs ?? [];
  let attempt = 1;
  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      const canRetry = attempt < options.attempts
        && (options.shouldRetry === undefined || await options.shouldRetry(error, attempt));
      await options.onFailedAttempt?.(error, attempt);
      if (!canRetry) throw error;

      const delay = delaysMs[attempt - 1] ?? 0;
      if (delay > 0) await wait(delay);
      attempt += 1;
    }
  }
}
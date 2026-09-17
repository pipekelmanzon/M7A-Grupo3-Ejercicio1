import { retry } from '../../../src/utils/retry';

describe('retry', () => {
  it('retries until the operation succeeds', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue('ok');
    const failedAttempts: number[] = [];

    const result = await retry(operation, {
      attempts: 3,
      shouldRetry: () => true,
      onFailedAttempt: (_error, attempt) => failedAttempts.push(attempt),
    });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(failedAttempts).toEqual([1, 2]);
  });

  it('stops immediately when the error is not retryable', async () => {
    const error = new Error('permanent');
    const operation = jest.fn().mockRejectedValue(error);

    await expect(retry(operation, { attempts: 3, shouldRetry: () => false })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('waits according to the configured delays', async () => {
    jest.useFakeTimers();
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue('ok');
    const pending = retry(operation, { attempts: 2, delaysMs: [250], shouldRetry: () => true });

    await jest.advanceTimersByTimeAsync(249);
    expect(operation).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('ok');
    jest.useRealTimers();
  });
});
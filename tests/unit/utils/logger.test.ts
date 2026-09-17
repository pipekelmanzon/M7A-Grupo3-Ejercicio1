import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { logger } from '../../../src/utils/logger';
import { env, stdout } from 'node:process';

describe('logger', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('is silent in test mode', () => {
    env.NODE_ENV = 'test';
    const output = jest.spyOn(stdout, 'write').mockImplementation(() => true);

    logger.info('hidden');

    expect(output).not.toHaveBeenCalled();
  });

  it('writes one JSON line with structured data', () => {
    env.NODE_ENV = 'development';
    const output = jest.spyOn(stdout, 'write').mockImplementation(() => true);

    logger.info('started', { reservationId: 'R-1' });

    expect(output).toHaveBeenCalledTimes(1);
    const line = output.mock.calls[0]?.[0];
    expect(JSON.parse(String(line))).toEqual(expect.objectContaining({ level: 'info', message: 'started', reservationId: 'R-1' }));
  });
});
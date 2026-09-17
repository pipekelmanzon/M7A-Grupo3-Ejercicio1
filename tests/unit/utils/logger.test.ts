import { logger } from '../../../src/utils/logger';

describe('logger', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('is silent in test mode', () => {
    process.env.NODE_ENV = 'test';
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    logger.info('hidden');

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('writes one JSON line with structured data', () => {
    process.env.NODE_ENV = 'development';
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    logger.info('started', { reservationId: 'R-1' });

    expect(consoleLog).toHaveBeenCalledTimes(1);
    const line = consoleLog.mock.calls[0]?.[0];
    expect(JSON.parse(String(line))).toEqual(expect.objectContaining({ level: 'info', message: 'started', reservationId: 'R-1' }));
  });
});
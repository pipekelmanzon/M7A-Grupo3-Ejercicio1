export type LogLevel = 'info' | 'warn' | 'error';
export type LogData = Record<string, unknown>;

export interface Logger {
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
}

function serializeError(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  return { name: value.name, message: value.message, stack: value.stack };
}

function write(level: LogLevel, message: string, data: LogData | undefined): void {
  if (process.env.NODE_ENV === 'test') return;

  const payload: LogData = { timestamp: new Date().toISOString(), level, message };
  if (data !== undefined) {
    for (const [key, value] of Object.entries(data)) payload[key] = serializeError(value);
  }
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger: Logger = {
  info: (message, data) => write('info', message, data),
  warn: (message, data) => write('warn', message, data),
  error: (message, data) => write('error', message, data),
};
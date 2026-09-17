import { env, stderr, stdout } from 'node:process';

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

function write(level: LogLevel, message: string, data: LogData | undefined, silent: boolean): void {
  if (silent) return;

  const payload: LogData = { timestamp: new Date().toISOString(), level, message };
  if (data !== undefined) {
    for (const [key, value] of Object.entries(data)) payload[key] = serializeError(value);
  }
  const line = JSON.stringify(payload);
  if (level === 'error') stderr.write(`${line}\n`);
  else stdout.write(`${line}\n`);
}

/** Logger suelto para uso fuera de la raiz de composicion: se silencia segun el NODE_ENV real del proceso. */
export const logger: Logger = {
  info: (message, data) => write('info', message, data, env.NODE_ENV === 'test'),
  warn: (message, data) => write('warn', message, data, env.NODE_ENV === 'test'),
  error: (message, data) => write('error', message, data, env.NODE_ENV === 'test'),
};

/**
 * Logger con el silencio decidido por quien lo crea, en vez de por el
 * NODE_ENV real del proceso. `container.ts` lo usa para que el silencio
 * dependa del `Env` validado (que los tests pueden inyectar via overrides)
 * y no de una coincidencia con el NODE_ENV que Jest define por su cuenta.
 */
export function createLogger(silent: boolean): Logger {
  return {
    info: (message, data) => write('info', message, data, silent),
    warn: (message, data) => write('warn', message, data, silent),
    error: (message, data) => write('error', message, data, silent),
  };
}
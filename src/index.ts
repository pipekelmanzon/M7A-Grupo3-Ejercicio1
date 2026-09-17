import process from 'node:process';
import { createApp } from './app.ts';
import { createContainer } from './container.ts';

const container = createContainer();
const app = createApp(container);
const server = app.listen(container.env.PORT, () => {
  container.logger.info('servidor escuchando', { port: container.env.PORT, nodeEnv: container.env.NODE_ENV });
});

/** Cierre ordenado: deja terminar las peticiones en curso antes de salir. */
function shutdown(signal: NodeJS.Signals): void {
  container.logger.info('cerrando servidor', { signal });
  server.close((error) => {
    if (error) {
      container.logger.error('error al cerrar el servidor', { error });
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

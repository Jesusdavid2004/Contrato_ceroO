import { app } from './app';
import { config } from './shared/config';
import { logger } from './shared/logger';
import { getRealtimeContext } from './presentation/realtime/realtimeContext';

const server = app.listen(config.PORT, () => {
  logger.info('Backend server listening', { port: config.PORT });
});

getRealtimeContext(app)?.realtimeServer.attach(server);

server.on('error', (error: Error) => {
  logger.error('Backend server failed to start', { errorName: error.name });
  process.exitCode = 1;
});

import Fastify from 'fastify';

import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
            }
          : undefined,
    },
    trustProxy: true,
  });

  await fastify.register(app);

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    fastify
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await fastify.listen({ host: env.HOST, port: env.PORT });
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});

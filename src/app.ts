import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { registerRoutes } from './routes/index.js';
import { authPlugin, adminAuthPlugin, rawBodyPlugin, errorHandlerPlugin } from './plugins/index.js';
import { webhookEventRepository } from './repositories/index.js';

const WEBHOOK_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function buildApp() {
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

  await fastify.register(sensible);

  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : true,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    skipOnError: true,
    keyGenerator: (request) => {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        return `key:${authHeader.substring(7, 39)}`;
      }
      return request.headers['x-forwarded-for']?.toString() ?? request.ip;
    },
  });

  if (env.ENABLE_SWAGGER) {
    const servers = [{ url: `http://localhost:${env.PORT}`, description: 'Development server' }];
    if (env.API_BASE_URL) {
      servers.unshift({ url: env.API_BASE_URL, description: 'Production server' });
    }

    await fastify.register(swagger, {
      openapi: {
        info: { title: 'Afrisinc Pay API', description: 'Payment Gateway API', version: '1.0.0' },
        servers,
        tags: [
          { name: 'Mobile Payments', description: 'Mobile Money payment operations (Cashin/Cashout)' },
          { name: 'Webhooks', description: 'Webhook endpoints for payment providers' },
        ],
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
        },
      },
    });
    await fastify.register(swaggerUi, { routePrefix: '/docs' });
  }

  await fastify.register(rawBodyPlugin);
  await fastify.register(errorHandlerPlugin);
  await fastify.register(authPlugin);
  await fastify.register(adminAuthPlugin);

  await registerRoutes(fastify);

  return fastify;
}

async function start() {
  let fastify;
  let pruneInterval: NodeJS.Timeout | undefined;

  try {
    fastify = await buildApp();

    await prisma.$connect();
    logger.info('Database connected');

    pruneInterval = setInterval(() => {
      webhookEventRepository
        .pruneOld()
        .then((count) => {
          if (count > 0) logger.info({ count }, 'Pruned old webhook events');
        })
        .catch((err: unknown) => {
          logger.warn({ err }, 'Webhook event pruning failed');
        });
    }, WEBHOOK_PRUNE_INTERVAL_MS);

    pruneInterval.unref();

    await fastify.listen({ host: env.HOST, port: env.PORT });
    logger.info(`Server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    logger.error(err, 'Failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    clearInterval(pruneInterval);
    if (fastify) await fastify.close();
    await prisma.$disconnect();
    logger.info('Server shut down');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void start();

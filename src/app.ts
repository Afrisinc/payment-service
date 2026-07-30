import fp from 'fastify-plugin';
import sensible from '@fastify/sensible';
import { FastifyPluginAsync } from 'fastify';

import { registerRoutes } from './routes/index.js';
import {
  prismaPlugin,
  corsPlugin,
  helmetPlugin,
  rateLimitPlugin,
  swaggerPlugin,
  rawBodyPlugin,
  errorHandlerPlugin,
  authPlugin,
  adminAuthPlugin,
  webhookPrunePlugin,
} from './plugins/index.js';

export const app: FastifyPluginAsync = fp(async (fastify) => {
  await fastify.register(prismaPlugin);
  await fastify.register(sensible);
  await fastify.register(corsPlugin);
  await fastify.register(helmetPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(swaggerPlugin);
  await fastify.register(rawBodyPlugin);
  await fastify.register(errorHandlerPlugin);
  await fastify.register(authPlugin);
  await fastify.register(adminAuthPlugin);
  await registerRoutes(fastify);
  await fastify.register(webhookPrunePlugin);
});

export default app;

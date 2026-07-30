import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import helmet from '@fastify/helmet';
import { env } from '../config/env.js';

async function helmetPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });
}

export default fp(helmetPlugin, { name: 'helmet-plugin' });

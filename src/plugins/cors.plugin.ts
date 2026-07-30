import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { env } from '../config/env.js';

function resolveCorsOrigin(): string | boolean | string[] {
  if (env.CORS_ALLOWED_ORIGINS) {
    return env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());
  }
  return env.NODE_ENV === 'production' ? env.FRONTEND_URL : true;
}

async function corsPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(cors, {
    origin: resolveCorsOrigin(),
    credentials: true,
  });
}

export default fp(corsPlugin, { name: 'cors-plugin' });

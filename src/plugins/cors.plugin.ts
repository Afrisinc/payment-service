import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { env } from '../config/env.js';

function resolveCorsOrigin(): string | string[] {
  if (!env.CORS_ALLOWED_ORIGINS) {
    throw new Error('CORS_ALLOWED_ORIGINS must be set in environment');
  }
  return env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());
}

async function corsPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(cors, {
    origin: resolveCorsOrigin(),
    credentials: true,
  });
}

export default fp(corsPlugin, { name: 'cors-plugin' });

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

async function rateLimitPlugin(fastify: FastifyInstance): Promise<void> {
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
}

export default fp(rateLimitPlugin, { name: 'rate-limit-plugin' });

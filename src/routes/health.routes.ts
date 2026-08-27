import type { FastifyInstance } from 'fastify';
import { healthController } from '../controllers/index.js';
import { healthCheckSchema, livenessSchema, readinessSchema } from '../schemas/index.js';

export function healthRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.get('/', {
    schema: healthCheckSchema,
    handler: healthController.check.bind(healthController),
  });
  fastify.get('/live', {
    schema: livenessSchema,
    handler: healthController.live.bind(healthController),
  });
  fastify.get('/ready', {
    schema: readinessSchema,
    handler: healthController.ready.bind(healthController),
  });
  done();
}

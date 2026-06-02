import type { FastifyInstance } from 'fastify';
import { healthController } from '../controllers/index.js';
import { healthCheckSchema } from '../schemas/index.js';

export function healthRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.get('/', {
    schema: healthCheckSchema,
    handler: healthController.check.bind(healthController),
  });
  done();
}

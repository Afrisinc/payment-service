import type { FastifyInstance } from 'fastify';
import { webhookController } from '../controllers/index.js';

export function webhookRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.post('/stripe', {
    config: {
      rawBody: true,
    },
    handler: webhookController.handleStripeWebhook.bind(webhookController),
  });
  done();
}

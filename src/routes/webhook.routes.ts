import type { FastifyInstance } from 'fastify';
import { webhookController } from '../controllers/index.js';
import { UnifiedWebhookController } from '../controllers/unified-webhook.controller.js';
import { asyncWrapper } from '../middlewares/async_wrapper.middleware.js';
import { unifiedWebhookSchema } from '../schemas/unified-webhook.schema.js';

export function webhookRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  const unifiedController = new UnifiedWebhookController();

  fastify.post('/stripe', {
    config: {
      rawBody: true,
    },
    handler: webhookController.handleStripeWebhook.bind(webhookController),
  });

  fastify.post('/payment', {
    schema: unifiedWebhookSchema,
    handler: asyncWrapper(unifiedController.handleWebhook.bind(unifiedController)),
  });

  done();
}

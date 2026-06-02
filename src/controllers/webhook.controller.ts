import type { FastifyRequest, FastifyReply } from 'fastify';
import { webhookService } from '../services/index.js';
import { logger } from '../lib/logger.js';

export class WebhookController {
  async handleStripeWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const signature = request.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      await reply.status(400).send({ error: 'Missing stripe-signature header' });
      return;
    }

    const rawBody = request.rawBody;

    if (!rawBody) {
      await reply.status(400).send({ error: 'Missing request body' });
      return;
    }

    try {
      const event = webhookService.verifyAndParseEvent(rawBody, signature);
      await webhookService.processEvent(event);
      await reply.status(200).send({ received: true });
    } catch (err) {
      logger.error({ err }, 'Webhook signature verification failed');
      await reply.status(400).send({ error: 'Webhook signature verification failed' });
    }
  }
}

export const webhookController = new WebhookController();

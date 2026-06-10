import type { FastifyRequest, FastifyReply } from 'fastify';
import { webhookService } from '../services/index.js';
import { logger } from '../lib/logger.js';
import { ResponseHandler } from '../utils/response-handler.js';

export class WebhookController {
  async handleStripeWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const signature = request.headers['stripe-signature'];

    if (!signature || typeof signature !== 'string') {
      await ResponseHandler.validationError(reply, 'Missing stripe-signature header');
      return;
    }

    const rawBody = request.rawBody;

    if (!rawBody) {
      await ResponseHandler.validationError(reply, 'Missing request body');
      return;
    }

    try {
      const event = webhookService.verifyAndParseEvent(rawBody, signature);
      await webhookService.processEvent(event);
      await ResponseHandler.success(reply, { received: true }, 'Webhook received and processed');
    } catch (err) {
      logger.error({ err }, 'Webhook signature verification failed');
      await ResponseHandler.validationError(reply, 'Webhook signature verification failed');
    }
  }
}

export const webhookController = new WebhookController();

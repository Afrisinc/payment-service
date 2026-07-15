import type { FastifyRequest, FastifyReply } from 'fastify';
import { getUnifiedWebhookService } from '../services/unified-webhook.service.js';
import { ResponseHandler } from '../utils/response.js';

export class UnifiedWebhookController {
  private readonly unifiedWebhookService = getUnifiedWebhookService();

  async handleWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await this.unifiedWebhookService.processWebhook(request.body);
    return ResponseHandler.success(reply, 1000, 'Webhook received', { received: true });
  }
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import { merchantService } from '../services/index.js';
import { ResponseHandler } from '../utils/response-handler.js';
import type { CreateMerchantBody, MerchantParams, ConfigureWebhookBody } from '../types/index.js';

export class MerchantController {
  async createMerchant(request: FastifyRequest<{ Body: CreateMerchantBody }>, reply: FastifyReply): Promise<void> {
    const { name, email, defaultFeePercent } = request.body;
    const { merchant, apiKey } = await merchantService.createMerchant({
      name,
      email,
      defaultFeePercent,
    });
    await ResponseHandler.created(
      reply,
      {
        id: merchant.id,
        name: merchant.name,
        email: merchant.email,
        defaultFeePercent: merchant.defaultFeePercent,
        isActive: merchant.isActive,
        createdAt: merchant.createdAt,
        apiKey,
      },
      'Merchant created successfully',
    );
  }

  async getMerchant(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    const merchant = await merchantService.getMerchant(request.params.id);
    await ResponseHandler.success(reply, {
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      defaultFeePercent: merchant.defaultFeePercent,
      isActive: merchant.isActive,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    });
  }

  async rotateApiKey(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    const { apiKey } = await merchantService.rotateApiKey(request.params.id);
    await ResponseHandler.success(reply, { apiKey }, 'API key rotated successfully');
  }

  async deactivateMerchant(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    await merchantService.setActive(request.params.id, false);
    await ResponseHandler.noContent(reply);
  }

  async activateMerchant(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    await merchantService.setActive(request.params.id, true);
    await ResponseHandler.noContent(reply);
  }

  async configureWebhook(
    request: FastifyRequest<{ Params: MerchantParams; Body: ConfigureWebhookBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await merchantService.configureWebhook(request.params.id, {
      webhookUrl: request.body.webhookUrl,
    });
    await ResponseHandler.success(reply, result, 'Webhook configured successfully');
  }

  async getWebhookConfig(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    const config = await merchantService.getWebhookConfig(request.params.id);
    await ResponseHandler.success(reply, config);
  }

  async removeWebhook(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    await merchantService.removeWebhook(request.params.id);
    await ResponseHandler.noContent(reply);
  }
}

export const merchantController = new MerchantController();

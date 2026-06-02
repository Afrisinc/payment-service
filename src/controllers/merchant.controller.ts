import type { FastifyRequest, FastifyReply } from 'fastify';
import { merchantService } from '../services/index.js';
import type { CreateMerchantBody, MerchantParams, ConfigureWebhookBody } from '../types/index.js';

export class MerchantController {
  async createMerchant(request: FastifyRequest<{ Body: CreateMerchantBody }>, reply: FastifyReply): Promise<void> {
    const { name, email, defaultFeePercent } = request.body;
    const { merchant, apiKey } = await merchantService.createMerchant({
      name,
      email,
      defaultFeePercent,
    });
    await reply.status(201).send({
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      defaultFeePercent: merchant.defaultFeePercent,
      isActive: merchant.isActive,
      createdAt: merchant.createdAt,
      apiKey,
    });
  }

  async getMerchant(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    const merchant = await merchantService.getMerchant(request.params.id);
    await reply.send({
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
    await reply.send({ apiKey });
  }

  async deactivateMerchant(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    await merchantService.setActive(request.params.id, false);
    await reply.status(204).send();
  }

  async activateMerchant(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    await merchantService.setActive(request.params.id, true);
    await reply.status(204).send();
  }

  async configureWebhook(
    request: FastifyRequest<{ Params: MerchantParams; Body: ConfigureWebhookBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await merchantService.configureWebhook(request.params.id, {
      webhookUrl: request.body.webhookUrl,
    });
    await reply.send(result);
  }

  async getWebhookConfig(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    const config = await merchantService.getWebhookConfig(request.params.id);
    await reply.send(config);
  }

  async removeWebhook(request: FastifyRequest<{ Params: MerchantParams }>, reply: FastifyReply): Promise<void> {
    await merchantService.removeWebhook(request.params.id);
    await reply.status(204).send();
  }
}

export const merchantController = new MerchantController();

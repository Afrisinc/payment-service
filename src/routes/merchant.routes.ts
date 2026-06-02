import type { FastifyInstance } from 'fastify';
import { merchantController } from '../controllers/index.js';
import { createMerchantSchema, merchantParamsSchema, configureWebhookSchema } from '../schemas/index.js';
import type { CreateMerchantBody, MerchantParams, ConfigureWebhookBody } from '../types/index.js';

export function merchantRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.post<{ Body: CreateMerchantBody }>('/', {
    schema: createMerchantSchema,
    preHandler: [fastify.authenticateAdmin],
    handler: merchantController.createMerchant.bind(merchantController),
  });

  fastify.get<{ Params: MerchantParams }>('/:id', {
    schema: merchantParamsSchema,
    preHandler: [fastify.authenticateAdmin],
    handler: merchantController.getMerchant.bind(merchantController),
  });

  fastify.post<{ Params: MerchantParams }>('/:id/rotate-key', {
    schema: merchantParamsSchema,
    preHandler: [fastify.authenticateAdmin],
    handler: merchantController.rotateApiKey.bind(merchantController),
  });

  fastify.patch<{ Params: MerchantParams }>('/:id/deactivate', {
    schema: merchantParamsSchema,
    preHandler: [fastify.authenticateAdmin],
    handler: merchantController.deactivateMerchant.bind(merchantController),
  });

  fastify.patch<{ Params: MerchantParams }>('/:id/activate', {
    schema: merchantParamsSchema,
    preHandler: [fastify.authenticateAdmin],
    handler: merchantController.activateMerchant.bind(merchantController),
  });

  // Webhook configuration endpoints
  fastify.put<{ Params: MerchantParams; Body: ConfigureWebhookBody }>('/:id/webhook', {
    schema: configureWebhookSchema,
    preHandler: [fastify.authenticateAdmin],
    handler: merchantController.configureWebhook.bind(merchantController),
  });

  fastify.get<{ Params: MerchantParams }>('/:id/webhook', {
    schema: merchantParamsSchema,
    preHandler: [fastify.authenticateAdmin],
    handler: merchantController.getWebhookConfig.bind(merchantController),
  });

  fastify.delete<{ Params: MerchantParams }>('/:id/webhook', {
    schema: merchantParamsSchema,
    preHandler: [fastify.authenticateAdmin],
    handler: merchantController.removeWebhook.bind(merchantController),
  });

  done();
}

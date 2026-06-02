import type { FastifySchema } from 'fastify';

const bearerAuth = [{ bearerAuth: [] }];

export const createMerchantSchema: FastifySchema = {
  security: bearerAuth,
  body: {
    type: 'object',
    required: ['name', 'email'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 255 },
      email: { type: 'string', format: 'email' },
      defaultFeePercent: { type: 'number', minimum: 0, maximum: 100 },
    },
    additionalProperties: false,
  },
};

export const merchantParamsSchema: FastifySchema = {
  security: bearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

export const configureWebhookSchema: FastifySchema = {
  security: bearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['webhookUrl'],
    properties: {
      webhookUrl: { type: 'string', format: 'uri' },
    },
    additionalProperties: false,
  },
};

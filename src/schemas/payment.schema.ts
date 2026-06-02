import type { FastifySchema } from 'fastify';

const paymentStatusEnum = {
  type: 'string',
  enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'EXPIRED', 'DISPUTED'],
};

const bearerAuth = [{ bearerAuth: [] }];

export const createCheckoutSchema: FastifySchema = {
  security: bearerAuth,
  body: {
    type: 'object',
    required: ['amount', 'currency', 'orderId', 'customerEmail'],
    properties: {
      amount: { type: 'integer', minimum: 50 },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      orderId: { type: 'string', minLength: 1, maxLength: 255 },
      customerEmail: { type: 'string', format: 'email' },
      successUrl: { type: 'string', format: 'uri' },
      cancelUrl: { type: 'string', format: 'uri' },
    },
    additionalProperties: false,
  },
};

export const createIntentSchema: FastifySchema = {
  security: bearerAuth,
  body: {
    type: 'object',
    required: ['amount', 'currency', 'orderId', 'customerEmail'],
    properties: {
      amount: { type: 'integer', minimum: 50 },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      orderId: { type: 'string', minLength: 1, maxLength: 255 },
      customerEmail: { type: 'string', format: 'email' },
      metadata: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
    additionalProperties: false,
  },
};

export const listPaymentsSchema: FastifySchema = {
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      status: paymentStatusEnum,
    },
    additionalProperties: false,
  },
};

export const getPaymentSchema: FastifySchema = {
  security: bearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

export const refundPaymentSchema: FastifySchema = {
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
    properties: {
      amount: { type: 'integer', minimum: 1 },
      reason: {
        type: 'string',
        enum: ['duplicate', 'fraudulent', 'requested_by_customer'],
      },
    },
    additionalProperties: false,
  },
};

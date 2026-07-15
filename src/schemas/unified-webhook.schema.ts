import type { FastifySchema } from 'fastify';

export const unifiedWebhookSchema: FastifySchema = {
  tags: ['Webhooks'],
  summary: 'POST /webhooks/payment - Unified Payment Webhook',
  description:
    'Single webhook endpoint for all payment callbacks. Automatically detects provider (ITEC Mobile, Paypack, PesaPal Card) and processes accordingly. No provider specification needed.',
  body: {
    type: 'object',
    description:
      'Webhook payload - automatically detected. Supports: ITEC Mobile {status, data: {transaction_id, status}}, Paypack {ref, status}, PesaPal Card {PCODE, transID}',
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          type: 'object',
          properties: {
            received: { type: 'boolean' },
          },
        },
      },
    },
  },
};

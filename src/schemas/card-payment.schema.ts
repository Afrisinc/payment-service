import type { FastifySchema } from 'fastify';

const bearerAuth = [{ bearerAuth: [] }];

const cardPaymentResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    resp_msg: { type: 'string' },
    resp_code: { type: 'integer' },
    data: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        ref: { type: 'string', description: 'PCODE - PesaPal payment code' },
        orderId: { type: 'string' },
        amount: { type: 'integer' },
        currency: { type: 'string', example: 'RWF' },
        email: { type: 'string', format: 'email' },
        type: { type: 'string', enum: ['CARD'] },
        status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED'] },
        pcode: { type: 'string', description: 'Payment code for tracking' },
        checkoutUrl: { type: 'string', description: 'PesaPal checkout URL to redirect customer' },
        validUntil: { type: 'string', format: 'date-time', description: 'Payment link expiry' },
        provider: { type: 'string', example: 'itec' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const initiateCardPaymentSchema: FastifySchema = {
  tags: ['Card Payments'],
  summary: 'POST /card/pay - Initiate Card Payment',
  description:
    'Initiate a card payment request for Visa or Mastercard via PesaPal (ITEC integration). Generates a unique PCODE and checkout URL that you redirect the customer to for payment completion. Supports multiple currencies (default: RWF).\n\nSample request: {"orderId":"card-order-123", "amount":5000, "email":"customer@example.com", "currency":"RWF", "customerName":"John Doe"}',
  security: bearerAuth,
  body: {
    type: 'object',
    required: ['orderId', 'amount', 'email'],
    properties: {
      orderId: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        default: 'card-order-123',
        description: 'Unique card payment order ID',
      },
      amount: {
        type: 'integer',
        minimum: 1,
        default: 5000,
        description: 'Amount in specified currency (minimum 1). Default currency: RWF',
      },
      email: {
        type: 'string',
        format: 'email',
        default: 'customer@example.com',
        description: 'Customer email address for PesaPal payment receipt',
      },
      currency: {
        type: 'string',
        default: 'RWF',
        description: 'Currency code (default: RWF). Optional. Example: RWF, USD',
      },
      customerName: {
        type: 'string',
        maxLength: 255,
        default: 'John Doe',
        description: 'Customer name (optional)',
      },
      description: {
        type: 'string',
        maxLength: 500,
        default: 'Payment for goods/services',
        description: 'Payment description (optional)',
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
        default: { invoiceId: 'INV-001', productId: 'PROD-123' },
        description: 'Custom metadata object (optional)',
      },
    },
  },
  response: {
    201: cardPaymentResponse,
  },
};

export const getCardPaymentSchema: FastifySchema = {
  tags: ['Card Payments'],
  summary: 'GET /card/:id - Get Card Payment by ID',
  description: 'Retrieve details of a specific card payment using the payment ID (UUID)',
  security: bearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Card payment ID' },
    },
  },
  response: {
    200: cardPaymentResponse,
  },
};

export const getCardPaymentByPcodeSchema: FastifySchema = {
  tags: ['Card Payments'],
  summary: 'GET /card/code/:pcode - Get Card Payment by PCODE',
  description: 'Retrieve details of a specific card payment using the PesaPal payment code (PCODE)',
  security: bearerAuth,
  params: {
    type: 'object',
    required: ['pcode'],
    properties: {
      pcode: { type: 'string', description: 'PesaPal payment code' },
    },
  },
  response: {
    200: cardPaymentResponse,
  },
};

export const listCardPaymentsSchema: FastifySchema = {
  tags: ['Card Payments'],
  summary: 'GET /card - List Card Payments',
  description:
    'Retrieve a paginated list of all card payments for your merchant account with optional filtering. Supports pagination up to 100 items per page.\n\n**Example:** GET /card?page=1&limit=20',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
        description: 'Page number (starts at 1). Default: 1',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Number of items per page (max 100). Default: 20',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          type: 'array',
          items: cardPaymentResponse.properties.data,
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: 'Total number of card payments' },
            page: { type: 'integer', description: 'Current page number' },
            limit: { type: 'integer', description: 'Items per page' },
            pages: { type: 'integer', description: 'Total number of pages' },
          },
        },
      },
    },
  },
};

export const cardWebhookSchema: FastifySchema = {
  tags: ['Webhooks'],
  summary: 'POST /webhooks/card/pesapal - Card Payment Webhook',
  description:
    'Webhook endpoint for receiving PesaPal (via ITEC) card payment status callbacks. Automatically updates payment status (PENDING → SUCCESSFUL/FAILED). This is called by PesaPal, not your client.',
  body: {
    type: 'object',
    properties: {
      PCODE: { type: 'string', description: 'PesaPal payment code (uppercase)' },
      pcode: { type: 'string', description: 'PesaPal payment code (lowercase)' },
      status: { type: 'string', enum: ['COMPLETED', 'FAILED', 'PROCESSING'], description: 'Payment status' },
      amount: { type: 'number', description: 'Transaction amount' },
      transID: { type: 'string', description: 'Transaction ID' },
    },
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

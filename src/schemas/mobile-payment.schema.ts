import type { FastifySchema } from 'fastify';

const bearerAuth = [{ bearerAuth: [] }];

const mobilePaymentResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    resp_msg: { type: 'string' },
    resp_code: { type: 'integer' },
    data: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        ref: { type: 'string', description: 'Paypack transaction reference' },
        orderId: { type: 'string' },
        amount: { type: 'integer' },
        currency: { type: 'string', example: 'RWF' },
        phoneNumber: { type: 'string' },
        type: { type: 'string', enum: ['CASHIN', 'CASHOUT'] },
        status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED'] },
        fee: { type: 'integer' },
        provider: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const cashinSchema: FastifySchema = {
  tags: ['Mobile Payments'],
  summary: 'Initiate Cashin',
  description: 'Collect payment from a customer via Mobile Money (MTN, Airtel)',
  security: bearerAuth,
  body: {
    type: 'object',
    required: ['orderId', 'amount', 'phoneNumber'],
    properties: {
      orderId: { type: 'string', minLength: 1, maxLength: 255, description: 'Your unique order identifier' },
      amount: { type: 'integer', minimum: 1, description: 'Amount in RWF (minimum 1)' },
      phoneNumber: {
        type: 'string',
        minLength: 9,
        maxLength: 15,
        description: 'Customer phone number (e.g., 0781234567)',
      },
      customerName: { type: 'string', maxLength: 255, description: 'Customer name for reference' },
      description: { type: 'string', maxLength: 500, description: 'Payment description' },
      metadata: { type: 'object', additionalProperties: true, description: 'Additional metadata' },
    },
  },
  response: {
    201: mobilePaymentResponse,
  },
};

export const cashoutSchema: FastifySchema = {
  tags: ['Mobile Payments'],
  summary: 'Initiate Cashout',
  description: 'Send payment to a recipient via Mobile Money (MTN, Airtel)',
  security: bearerAuth,
  body: {
    type: 'object',
    required: ['orderId', 'amount', 'phoneNumber'],
    properties: {
      orderId: { type: 'string', minLength: 1, maxLength: 255, description: 'Your unique order identifier' },
      amount: { type: 'integer', minimum: 1, description: 'Amount in RWF (minimum 1)' },
      phoneNumber: {
        type: 'string',
        minLength: 9,
        maxLength: 15,
        description: 'Recipient phone number (e.g., 0781234567)',
      },
      recipientName: { type: 'string', maxLength: 255, description: 'Recipient name for reference' },
      description: { type: 'string', maxLength: 500, description: 'Payment description' },
      metadata: { type: 'object', additionalProperties: true, description: 'Additional metadata' },
    },
  },
  response: {
    201: mobilePaymentResponse,
  },
};

export const getMobilePaymentSchema: FastifySchema = {
  tags: ['Mobile Payments'],
  summary: 'Get Payment by ID',
  description: 'Retrieve details of a specific mobile payment by ID',
  security: bearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Payment ID' },
    },
  },
  response: {
    200: mobilePaymentResponse,
  },
};

export const getMobilePaymentByRefSchema: FastifySchema = {
  tags: ['Mobile Payments'],
  summary: 'Get Payment by Reference',
  description: 'Retrieve details of a specific mobile payment by Paypack reference',
  security: bearerAuth,
  params: {
    type: 'object',
    required: ['ref'],
    properties: {
      ref: { type: 'string', description: 'Paypack transaction reference' },
    },
  },
  response: {
    200: mobilePaymentResponse,
  },
};

export const listMobilePaymentsSchema: FastifySchema = {
  tags: ['Mobile Payments'],
  summary: 'List Payments',
  description: 'List all mobile payments for your merchant account with optional filters',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1, description: 'Page number' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Items per page (max 100)' },
      status: {
        type: 'string',
        enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED'],
        description: 'Filter by status',
      },
      type: { type: 'string', enum: ['CASHIN', 'CASHOUT'], description: 'Filter by payment type' },
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
          items: mobilePaymentResponse.properties.data,
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
      },
    },
  },
};

export const accountInfoSchema: FastifySchema = {
  tags: ['Mobile Payments'],
  summary: 'Get Account Info',
  description: 'Retrieve Paypack account balance and rate information',
  security: bearerAuth,
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
            balance: { type: 'number', description: 'Current account balance in RWF' },
            currency: { type: 'string', example: 'RWF' },
            merchantName: { type: 'string', description: 'Paypack account name' },
            inRate: { type: 'number', description: 'Cashin fee rate (percentage)' },
            outRate: { type: 'number', description: 'Cashout fee rate (percentage)' },
          },
        },
      },
    },
  },
};

export const mobileWebhookSchema: FastifySchema = {
  tags: ['Webhooks'],
  summary: 'Paypack Webhook',
  description: 'Endpoint for receiving Paypack payment status webhooks',
  body: {
    type: 'object',
    required: ['event_kind', 'data'],
    properties: {
      event_id: { type: 'string', description: 'Unique event identifier' },
      event_kind: { type: 'string', description: 'Event type (e.g., transaction:processed)' },
      created_at: { type: 'string', format: 'date-time' },
      data: {
        type: 'object',
        required: ['ref', 'status'],
        properties: {
          ref: { type: 'string', description: 'Transaction reference' },
          kind: { type: 'string', enum: ['CASHIN', 'CASHOUT'] },
          fee: { type: 'number', description: 'Transaction fee' },
          merchant: { type: 'string' },
          client: { type: 'string', description: 'Customer phone number' },
          amount: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'successful', 'failed'] },
          provider: { type: 'string', description: 'Mobile network provider' },
          created_at: { type: 'string', format: 'date-time' },
          processed_at: { type: 'string', format: 'date-time' },
        },
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
          type: 'object',
          properties: {
            received: { type: 'boolean' },
          },
        },
      },
    },
  },
};

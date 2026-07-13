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
  summary: 'Initiate Cashin (Collect Payment)',
  description:
    'Request payment from a customer via Mobile Money (MTN MoMo, Airtel Money, SPENN).\n\nSample request: {"orderId":"order-12345", "amount":1000, "phoneNumber":"0798760888", "customerName":"John Doe", "description":"Payment for services"}',
  security: bearerAuth,
  body: {
    type: 'object',
    required: ['orderId', 'amount', 'phoneNumber'],
    properties: {
      orderId: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        default: 'order-12345',
        description: 'Unique order ID',
      },
      amount: {
        type: 'integer',
        minimum: 1,
        default: 1000,
        description: 'Amount in RWF (minimum 1)',
      },
      phoneNumber: {
        type: 'string',
        minLength: 9,
        maxLength: 15,
        default: '0798760888',
        description: 'Customer phone number (formats: 0798760888, +250798760888, 250798760888)',
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
        default: 'Payment for services',
        description: 'Payment description (optional)',
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
        default: { invoiceId: 'INV-001', productId: 'PROD-123' },
        description: 'Custom metadata object (optional)',
      },
      provider: {
        type: 'string',
        enum: ['itec', 'paypack'],
        default: 'itec',
        description: 'Payment provider (optional, defaults to ITEC)',
      },
    },
  },
  response: {
    201: mobilePaymentResponse,
  },
};

export const cashoutSchema: FastifySchema = {
  tags: ['Mobile Payments'],
  summary: 'Initiate Cashout (Send Payment)',
  description: 'Send payment/disbursement to recipient via Mobile Money (MTN MoMo, Airtel Money, SPENN).',
  security: bearerAuth,
  body: {
    type: 'object',
    required: ['orderId', 'amount', 'phoneNumber'],
    properties: {
      orderId: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        default: 'payout-12345',
        description: 'Unique payout ID',
      },
      amount: {
        type: 'integer',
        minimum: 1,
        default: 500,
        description: 'Amount in RWF to transfer (minimum 1)',
      },
      phoneNumber: {
        type: 'string',
        minLength: 9,
        maxLength: 15,
        default: '0798760888',
        description: 'Recipient phone number (formats: 0798760888, +250798760888, 250798760888)',
      },
      recipientName: {
        type: 'string',
        maxLength: 255,
        default: 'Jane Smith',
        description: 'Recipient name (optional)',
      },
      description: {
        type: 'string',
        maxLength: 500,
        default: 'Refund for order #123',
        description: 'Payout reason (optional)',
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
        default: { refundId: 'REF-001', orderId: 'ORD-456' },
        description: 'Custom metadata object (optional)',
      },
      provider: {
        type: 'string',
        enum: ['itec', 'paypack'],
        default: 'itec',
        description: 'Payment provider (optional, defaults to ITEC)',
      },
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
  summary: 'List Payments (with Filters)',
  description:
    'Retrieve paginated list of all mobile payments for your merchant account. Filter by status and payment type. Supports pagination up to 100 items per page.\n\n**Example Query:** ?page=1&limit=20&status=SUCCESSFUL&type=CASHIN',
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
      status: {
        type: 'string',
        enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED'],
        description: 'Filter by payment status (optional). Values: PENDING, PROCESSING, SUCCESSFUL, FAILED',
      },
      type: {
        type: 'string',
        enum: ['CASHIN', 'CASHOUT'],
        description: 'Filter by payment type (optional). CASHIN = collect, CASHOUT = send',
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
          items: mobilePaymentResponse.properties.data,
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: 'Total number of payments (e.g., 150)' },
            page: { type: 'integer', description: 'Current page number (e.g., 1)' },
            limit: { type: 'integer', description: 'Items per page (e.g., 20)' },
            pages: { type: 'integer', description: 'Total number of pages (e.g., 8)' },
          },
        },
      },
    },
  },
};

export const accountInfoSchema: FastifySchema = {
  tags: ['Mobile Payments'],
  summary: 'Get Account Balance & Rates',
  description:
    'Retrieve your Paypack merchant account balance, name, and transaction fee rates.\n\n**Example Response:** balance=50000.5, currency="RWF", merchantName="Afrisinc Ltd", inRate=1.5, outRate=2.0',
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
            balance: {
              type: 'number',
              description: 'Current account balance in RWF (e.g., 50000.5)',
            },
            currency: {
              type: 'string',
              description: 'Currency code (always "RWF")',
            },
            merchantName: {
              type: 'string',
              description: 'Your Paypack merchant account name (e.g., Afrisinc Ltd)',
            },
            inRate: {
              type: 'number',
              description: 'Cashin (payment collection) fee rate in percentage (e.g., 1.5)',
            },
            outRate: {
              type: 'number',
              description: 'Cashout (fund disbursement) fee rate in percentage (e.g., 2.0)',
            },
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

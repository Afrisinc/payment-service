import type { FastifySchema } from 'fastify';

export interface ListMerchantsQuery {
  page?: number;
  limit?: number;
  status?: 'active' | 'inactive';
  search?: string;
  sortBy?: 'name' | 'email' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ListPaymentsQuery {
  page?: number;
  limit?: number;
  type?: 'mobile' | 'card' | 'stripe';
  status?: string;
  provider?: string;
  merchant?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  sortBy?: 'createdAt' | 'amount' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface DashboardMetricsQuery {
  dateFrom?: string;
  dateTo?: string;
}

export interface DashboardChartDataQuery {
  days?: number;
  groupBy?: 'day' | 'week' | 'month';
}

const bearerAuth = [{ bearerAuth: [] }];

export const listMerchantsSchema: FastifySchema = {
  tags: ['Admin - Merchants'],
  summary: 'List all merchants',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
        description: 'Page number',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Items per page',
      },
      status: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Filter by status (optional)',
      },
      search: {
        type: 'string',
        description: 'Search by name or email (optional)',
      },
      sortBy: {
        type: 'string',
        enum: ['name', 'email', 'createdAt'],
        default: 'createdAt',
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_code: { type: 'integer' },
        resp_msg: { type: 'string' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
              isActive: { type: 'boolean' },
              defaultFeePercent: { type: 'number' },
              webhookUrl: { type: ['string', 'null'] },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  },
};

export const listAdminPaymentsSchema: FastifySchema = {
  tags: ['Admin - Payments'],
  summary: 'List all payments with filters',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      type: {
        type: 'string',
        enum: ['mobile', 'card', 'stripe'],
        description: 'Payment type filter',
      },
      status: {
        type: 'string',
        description: 'Payment status filter',
      },
      provider: {
        type: 'string',
        description: 'Payment provider (ITEC, Paypack, Stripe, etc)',
      },
      merchant: {
        type: 'string',
        description: 'Merchant ID filter',
      },
      dateFrom: {
        type: 'string',
        format: 'date-time',
        description: 'Filter from date',
      },
      dateTo: {
        type: 'string',
        format: 'date-time',
        description: 'Filter to date',
      },
      minAmount: {
        type: 'integer',
        minimum: 0,
        description: 'Minimum amount filter',
      },
      maxAmount: {
        type: 'integer',
        minimum: 0,
        description: 'Maximum amount filter',
      },
      search: {
        type: 'string',
        description: 'Search by ref or order ID',
      },
      sortBy: {
        type: 'string',
        enum: ['createdAt', 'amount', 'status'],
        default: 'createdAt',
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_code: { type: 'integer' },
        resp_msg: { type: 'string' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              type: { type: 'string', enum: ['mobile', 'card', 'stripe'] },
              ref: { type: 'string' },
              orderId: { type: 'string' },
              merchant: { type: 'string' },
              amount: { type: 'integer' },
              currency: { type: 'string' },
              status: { type: 'string' },
              provider: { type: 'string', nullable: true },
              phoneNumber: { type: 'string', nullable: true },
              feeAmount: { type: 'number' },
              feePercent: { type: 'number' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  },
};

export const dashboardMetricsSchema: FastifySchema = {
  tags: ['Admin - Dashboard'],
  summary: 'Get dashboard metrics',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      dateFrom: {
        type: 'string',
        format: 'date-time',
        description: 'Filter from date (optional, defaults to 30 days ago)',
      },
      dateTo: {
        type: 'string',
        format: 'date-time',
        description: 'Filter to date (optional, defaults to now)',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_code: { type: 'integer' },
        resp_msg: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            totalTransactions: { type: 'integer' },
            totalTransactionsToday: { type: 'integer' },
            totalVolume: { type: 'integer', description: 'Total volume in RWF' },
            totalVolumeToday: { type: 'integer' },
            successRate: { type: 'number', description: 'Success rate percentage' },
            failedCount: { type: 'integer' },
            pendingCount: { type: 'integer' },
            averageTransactionTime: { type: 'number', description: 'In seconds' },
            volumeByType: {
              type: 'object',
              properties: {
                mobile: { type: 'integer' },
                card: { type: 'integer' },
                stripe: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
};

export const dashboardChartDataSchema: FastifySchema = {
  tags: ['Admin - Dashboard'],
  summary: 'Get chart data for dashboard',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        minimum: 1,
        maximum: 90,
        default: 30,
        description: 'Number of days to include',
      },
      groupBy: {
        type: 'string',
        enum: ['day', 'week', 'month'],
        default: 'day',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_code: { type: 'integer' },
        resp_msg: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            volumeByDay: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  amount: { type: 'integer' },
                  count: { type: 'integer' },
                },
              },
            },
            statusDistribution: {
              type: 'object',
              properties: {
                SUCCESSFUL: { type: 'integer' },
                PENDING: { type: 'integer' },
                FAILED: { type: 'integer' },
                PROCESSING: { type: 'integer' },
              },
            },
            providerDistribution: {
              type: 'object',
              properties: {
                ITEC: { type: 'integer' },
                Paypack: { type: 'integer' },
                Stripe: { type: 'integer' },
                PesaPal: { type: 'integer' },
              },
            },
            topMerchants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  merchantId: { type: 'string' },
                  merchantName: { type: 'string' },
                  volume: { type: 'integer' },
                  count: { type: 'integer' },
                },
              },
            },
            transactionTrend: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  count: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const refreshPaymentStatusSchema: FastifySchema = {
  tags: ['Admin - Payments'],
  summary: 'Refresh a payment status by polling its provider (card or mobile) and syncing the DB',
  security: bearerAuth,
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', description: 'Payment ID' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_code: { type: 'integer' },
        resp_msg: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            ref: { type: 'string' },
            type: { type: 'string', enum: ['card', 'mobile'] },
            merchantId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            provider: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

const webhookDeliveryView = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    merchantId: { type: 'string', format: 'uuid' },
    merchantName: { type: ['string', 'null'] },
    webhookUrl: { type: ['string', 'null'], description: 'Merchant webhook URL currently configured' },
    paymentId: { type: 'string', format: 'uuid' },
    eventType: { type: 'string', example: 'payment.succeeded' },
    payload: { type: 'object', additionalProperties: true, description: 'Exact body sent to the merchant' },
    status: { type: 'string', enum: ['PENDING', 'DELIVERED', 'FAILED'] },
    attempts: { type: 'integer' },
    maxAttempts: { type: 'integer' },
    lastAttempt: { type: ['string', 'null'], format: 'date-time' },
    nextRetry: { type: ['string', 'null'], format: 'date-time' },
    responseCode: { type: ['integer', 'null'], description: 'HTTP status returned by the merchant endpoint' },
    errorMessage: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    deliveredAt: { type: ['string', 'null'], format: 'date-time' },
  },
} as const;

const webhookDeliveryParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Webhook delivery ID' },
  },
} as const;

export const listWebhookDeliveriesSchema: FastifySchema = {
  tags: ['Admin - Webhooks'],
  summary: 'List webhook delivery logs',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      status: {
        type: 'string',
        enum: ['PENDING', 'DELIVERED', 'FAILED'],
        description: 'Filter by delivery status',
      },
      merchantId: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by merchant',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_code: { type: 'integer' },
        resp_msg: { type: 'string' },
        data: {
          type: 'array',
          items: webhookDeliveryView,
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
      },
    },
  },
};

export const getWebhookDeliverySchema: FastifySchema = {
  tags: ['Admin - Webhooks'],
  summary: 'Get a webhook delivery log entry',
  security: bearerAuth,
  params: webhookDeliveryParams,
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_code: { type: 'integer' },
        resp_msg: { type: 'string' },
        data: webhookDeliveryView,
      },
    },
  },
};

export const retryWebhookDeliverySchema: FastifySchema = {
  tags: ['Admin - Webhooks'],
  summary: 'Retry an undelivered webhook now',
  description: 'Makes one immediate delivery attempt. Refused with 409 when the webhook was already delivered.',
  security: bearerAuth,
  params: webhookDeliveryParams,
  response: getWebhookDeliverySchema.response,
};

const merchantIdParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Merchant ID' },
  },
} as const;

export const merchantBalanceSchema: FastifySchema = {
  tags: ['Admin - Payouts'],
  summary: 'Get merchant mobile money balance',
  description:
    'Ledger balance computed from mobile money and card transactions: available = collected - collection fees - paid out - pending payouts.',
  security: bearerAuth,
  params: merchantIdParams,
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_code: { type: 'integer' },
        resp_msg: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            merchantId: { type: 'string', format: 'uuid' },
            collected: { type: 'integer' },
            collectionFees: { type: 'integer' },
            paidOut: { type: 'integer' },
            pendingPayouts: { type: 'integer' },
            available: { type: 'integer' },
            currency: { type: 'string' },
            payoutsEnabled: { type: 'boolean' },
          },
        },
      },
    },
  },
};

export const createMerchantPayoutSchema: FastifySchema = {
  tags: ['Admin - Payouts'],
  summary: 'Send an ITEC payout on behalf of a merchant',
  description:
    'Disburses funds to a Rwanda mobile money wallet (MTN / Airtel) via ITEC. Idempotent on orderId; refused with 422 when it exceeds the merchant available balance and 403 when admin payouts are disabled.',
  security: bearerAuth,
  params: merchantIdParams,
  body: {
    type: 'object',
    required: ['orderId', 'amount', 'phoneNumber'],
    additionalProperties: false,
    properties: {
      orderId: { type: 'string', minLength: 1, maxLength: 255, description: 'Idempotency key for this payout' },
      amount: { type: 'integer', minimum: 1, description: 'Amount in RWF' },
      phoneNumber: {
        type: 'string',
        pattern: '^(\\+?250|0)?7[2389][0-9]{7}$',
        description: 'Recipient MTN or Airtel Rwanda number (0788123456, +250788123456, 250788123456)',
      },
      recipientName: { type: 'string', maxLength: 255 },
      description: { type: 'string', maxLength: 500, description: 'Payout reason' },
    },
  },
};

export const listAdminMobilePaymentsSchema: FastifySchema = {
  tags: ['Admin - Payments'],
  summary: 'List mobile payments (cashin and cashout) across merchants',
  security: bearerAuth,
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED'] },
      type: { type: 'string', enum: ['CASHIN', 'CASHOUT'] },
      provider: { type: 'string' },
      merchantId: { type: 'string', format: 'uuid' },
      dateFrom: { type: 'string', format: 'date-time' },
      dateTo: { type: 'string', format: 'date-time' },
      minAmount: { type: 'integer', minimum: 0 },
      maxAmount: { type: 'integer', minimum: 0 },
      search: { type: 'string', maxLength: 255 },
      sortBy: { type: 'string', enum: ['createdAt', 'amount', 'status'], default: 'createdAt' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    },
  },
};

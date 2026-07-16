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
              merchantId: { type: 'string' },
              amount: { type: 'integer' },
              currency: { type: 'string' },
              status: { type: 'string' },
              provider: { type: 'string', nullable: true },
              phoneNumber: { type: 'string', nullable: true },
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
        description: 'Filter by delivery status',
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
              merchantId: { type: 'string', format: 'uuid' },
              eventType: { type: 'string' },
              status: { type: 'string' },
              attempts: { type: 'integer' },
              nextRetry: { type: ['string', 'null'], format: 'date-time' },
              createdAt: { type: 'string', format: 'date-time' },
              deliveredAt: { type: ['string', 'null'], format: 'date-time' },
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

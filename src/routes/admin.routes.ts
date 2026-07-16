import type { FastifyInstance } from 'fastify';
import { adminController } from '../controllers/index.js';
import { asyncWrapper } from '../middlewares/async_wrapper.middleware.js';
import {
  listMerchantsSchema,
  listAdminPaymentsSchema,
  dashboardMetricsSchema,
  dashboardChartDataSchema,
  listWebhookDeliveriesSchema,
} from '../schemas/index.js';

/* eslint-disable @typescript-eslint/no-unsafe-argument */
export function adminRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.get(
    '/merchants',
    {
      schema: listMerchantsSchema,
      preHandler: [fastify.authenticateAdmin],
    },
    asyncWrapper(adminController.listMerchants.bind(adminController)),
  );

  fastify.get(
    '/payments',
    {
      schema: listAdminPaymentsSchema,
      preHandler: [fastify.authenticateAdmin],
    },
    asyncWrapper(adminController.listPayments.bind(adminController)),
  );

  fastify.get(
    '/dashboard/metrics',
    {
      schema: dashboardMetricsSchema,
      preHandler: [fastify.authenticateAdmin],
    },
    asyncWrapper(adminController.getDashboardMetrics.bind(adminController)),
  );

  fastify.get(
    '/dashboard/chart-data',
    {
      schema: dashboardChartDataSchema,
      preHandler: [fastify.authenticateAdmin],
    },
    asyncWrapper(adminController.getChartData.bind(adminController)),
  );

  fastify.get(
    '/payments/:id',
    {
      preHandler: [fastify.authenticateAdmin],
    },
    asyncWrapper(adminController.getPaymentById.bind(adminController)),
  );

  fastify.get(
    '/webhooks',
    {
      schema: listWebhookDeliveriesSchema,
      preHandler: [fastify.authenticateAdmin],
    },
    asyncWrapper(adminController.listWebhookDeliveries.bind(adminController)),
  );

  fastify.get(
    '/webhooks/:id',
    {
      preHandler: [fastify.authenticateAdmin],
    },
    asyncWrapper(adminController.getWebhookDelivery.bind(adminController)),
  );

  done();
}

import type { FastifyInstance } from 'fastify';
import { MobilePaymentController } from '../controllers/mobile-payment.controller.js';
import { asyncWrapper } from '../middlewares/async_wrapper.middleware.js';
import {
  cashinSchema,
  cashoutSchema,
  getMobilePaymentSchema,
  getMobilePaymentByRefSchema,
  listMobilePaymentsSchema,
  accountInfoSchema,
  mobileWebhookSchema,
} from '../schemas/mobile-payment.schema.js';

export function mobilePaymentRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  const mobilePaymentController = new MobilePaymentController();

  // Cashin - collect payment from customer
  fastify.post('/cashin', {
    schema: cashinSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(mobilePaymentController.cashin.bind(mobilePaymentController)),
  });

  // Cashout - send payment to recipient
  fastify.post('/cashout', {
    schema: cashoutSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(mobilePaymentController.cashout.bind(mobilePaymentController)),
  });

  // List payments
  fastify.get('/', {
    schema: listMobilePaymentsSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(mobilePaymentController.listPayments.bind(mobilePaymentController)),
  });

  // Get account info/balance (must be before /:id to avoid conflict)
  fastify.get('/account/info', {
    schema: accountInfoSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(mobilePaymentController.getAccountInfo.bind(mobilePaymentController)),
  });

  // Get payment by Paypack reference (must be before /:id to avoid conflict)
  fastify.get('/ref/:ref', {
    schema: getMobilePaymentByRefSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(mobilePaymentController.getPaymentByRef.bind(mobilePaymentController)),
  });

  // Get single payment by ID
  fastify.get('/:id', {
    schema: getMobilePaymentSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(mobilePaymentController.getPayment.bind(mobilePaymentController)),
  });

  done();
}

export function mobileWebhookRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  const mobilePaymentController = new MobilePaymentController();

  // Paypack webhook endpoint
  fastify.post('/paypack', {
    schema: mobileWebhookSchema,
    handler: asyncWrapper(mobilePaymentController.handleWebhook.bind(mobilePaymentController)),
  });

  done();
}

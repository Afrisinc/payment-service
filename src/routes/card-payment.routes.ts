import type { FastifyInstance } from 'fastify';
import { CardPaymentController } from '../controllers/card-payment.controller.js';
import { asyncWrapper } from '../middlewares/async_wrapper.middleware.js';
import {
  initiateCardPaymentSchema,
  getCardPaymentSchema,
  getCardPaymentByPcodeSchema,
  listCardPaymentsSchema,
  cardWebhookSchema,
} from '../schemas/card-payment.schema.js';

export function cardPaymentRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  const cardPaymentController = new CardPaymentController();

  // Initiate card payment (action-based endpoint)
  fastify.post('/pay', {
    schema: initiateCardPaymentSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(cardPaymentController.initiateCardPayment.bind(cardPaymentController)),
  });

  // Check card payment status by PCODE (polls ITEC and updates DB)
  fastify.get('/code/:pcode/status', {
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(cardPaymentController.getCardPaymentStatus.bind(cardPaymentController)),
  });

  // Get card payment by PCODE (must be before /:id to avoid conflict)
  fastify.get('/code/:pcode', {
    schema: getCardPaymentByPcodeSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(cardPaymentController.getCardPaymentByPcode.bind(cardPaymentController)),
  });

  // Get card payment by ID
  fastify.get('/:id', {
    schema: getCardPaymentSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(cardPaymentController.getCardPayment.bind(cardPaymentController)),
  });

  // List card payments (supports pagination: ?page=1&limit=20)
  fastify.get('/', {
    schema: listCardPaymentsSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(cardPaymentController.listCardPayments.bind(cardPaymentController)),
  });

  done();
}

export function cardWebhookRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  const cardPaymentController = new CardPaymentController();

  // PesaPal (via ITEC) webhook endpoint
  fastify.post('/pesapal', {
    schema: cardWebhookSchema,
    handler: asyncWrapper(cardPaymentController.handleCardWebhook.bind(cardPaymentController)),
  });

  done();
}

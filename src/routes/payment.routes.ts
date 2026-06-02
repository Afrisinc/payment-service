import type { FastifyInstance } from 'fastify';
import { paymentController } from '../controllers/index.js';
import {
  createCheckoutSchema,
  createIntentSchema,
  listPaymentsSchema,
  getPaymentSchema,
  refundPaymentSchema,
} from '../schemas/index.js';
import type {
  CreateCheckoutBody,
  CreateIntentBody,
  PaymentParams,
  RefundBody,
  ListPaymentsQuery,
} from '../types/index.js';

export function paymentRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.post<{ Body: CreateCheckoutBody }>('/checkout', {
    schema: createCheckoutSchema,
    preHandler: [fastify.authenticate],
    handler: paymentController.createCheckout.bind(paymentController),
  });

  fastify.post<{ Body: CreateIntentBody }>('/intent', {
    schema: createIntentSchema,
    preHandler: [fastify.authenticate],
    handler: paymentController.createIntent.bind(paymentController),
  });

  fastify.get<{ Querystring: ListPaymentsQuery }>('/', {
    schema: listPaymentsSchema,
    preHandler: [fastify.authenticate],
    handler: paymentController.listPayments.bind(paymentController),
  });

  fastify.get<{ Params: PaymentParams }>('/:id', {
    schema: getPaymentSchema,
    preHandler: [fastify.authenticate],
    handler: paymentController.getPayment.bind(paymentController),
  });

  fastify.post<{ Params: PaymentParams; Body: RefundBody }>('/:id/refund', {
    schema: refundPaymentSchema,
    preHandler: [fastify.authenticate],
    handler: paymentController.refundPayment.bind(paymentController),
  });
  done();
}

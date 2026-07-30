import type { FastifyInstance } from 'fastify';
import { paymentController } from '../controllers/index.js';
import { listPaymentsSchema, getPaymentSchema } from '../schemas/index.js';
import type { PaymentParams, ListPaymentsQuery } from '../types/index.js';

export function paymentRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
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

  done();
}

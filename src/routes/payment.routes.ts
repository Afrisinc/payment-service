import type { FastifyInstance } from 'fastify';
import { paymentController } from '../controllers/index.js';
import { listPaymentsSchema, getPaymentSchema, checkPaymentStatusSchema } from '../schemas/index.js';
import { asyncWrapper } from '../middlewares/async_wrapper.middleware.js';

export function paymentRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.get('/', {
    schema: listPaymentsSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(paymentController.listPayments.bind(paymentController)),
  });

  fastify.get('/:id', {
    schema: getPaymentSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(paymentController.getPayment.bind(paymentController)),
  });

  fastify.get('/ref/:ref/status', {
    schema: checkPaymentStatusSchema,
    preHandler: [fastify.authenticate],
    handler: asyncWrapper(paymentController.checkPaymentStatus.bind(paymentController)),
  });

  done();
}

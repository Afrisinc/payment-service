import type { FastifyRequest, FastifyReply } from 'fastify';
import { PaymentStatus } from '@prisma/client';
import { paymentRepository } from '../repositories/index.js';
import type { PaymentParams, ListPaymentsQuery } from '../types/index.js';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export class PaymentController {
  async listPayments(request: FastifyRequest<{ Querystring: ListPaymentsQuery }>, reply: FastifyReply): Promise<void> {
    const page = Math.max(1, request.query.page ?? 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, request.query.limit ?? DEFAULT_PAGE_LIMIT));
    const status = request.query.status;

    if (status && !Object.values(PaymentStatus).includes(status)) {
      await reply.status(400).send({ error: `Invalid status: ${status}` });
      return;
    }

    const result = await paymentRepository.listByMerchant(request.merchant.id, page, limit, status);
    await reply.send({
      items: result.items,
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    });
  }

  async getPayment(request: FastifyRequest<{ Params: PaymentParams }>, reply: FastifyReply): Promise<void> {
    const payment = await paymentRepository.findByIdAndMerchant(request.params.id, request.merchant.id);
    if (!payment) {
      await reply.status(404).send({ error: 'Payment not found' });
      return;
    }
    await reply.send(payment);
  }
}

export const paymentController = new PaymentController();

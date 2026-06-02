import type { FastifyRequest, FastifyReply } from 'fastify';
import { PaymentStatus } from '@prisma/client';
import { paymentService } from '../services/index.js';
import type {
  CreateCheckoutBody,
  CreateIntentBody,
  PaymentParams,
  RefundBody,
  ListPaymentsQuery,
} from '../types/index.js';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export class PaymentController {
  async createCheckout(request: FastifyRequest<{ Body: CreateCheckoutBody }>, reply: FastifyReply): Promise<void> {
    const { amount, currency, orderId, customerEmail, successUrl, cancelUrl } = request.body;
    const result = await paymentService.createCheckoutSession({
      merchant: request.merchant,
      amount,
      currency,
      orderId,
      customerEmail,
      successUrl,
      cancelUrl,
    });
    await reply.status(result.idempotent ? 200 : 201).send(result);
  }

  async createIntent(request: FastifyRequest<{ Body: CreateIntentBody }>, reply: FastifyReply): Promise<void> {
    const { amount, currency, orderId, customerEmail, metadata } = request.body;
    const result = await paymentService.createPaymentIntent({
      merchant: request.merchant,
      amount,
      currency,
      orderId,
      customerEmail,
      metadata,
    });
    await reply.status(result.idempotent ? 200 : 201).send(result);
  }

  async listPayments(request: FastifyRequest<{ Querystring: ListPaymentsQuery }>, reply: FastifyReply): Promise<void> {
    const page = Math.max(1, request.query.page ?? 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, request.query.limit ?? DEFAULT_PAGE_LIMIT));
    const status = request.query.status;

    if (status && !Object.values(PaymentStatus).includes(status)) {
      await reply.status(400).send({ error: `Invalid status: ${status}` });
      return;
    }

    const result = await paymentService.listPayments(request.merchant.id, page, limit, status);
    await reply.send({
      items: result.items,
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit),
    });
  }

  async getPayment(request: FastifyRequest<{ Params: PaymentParams }>, reply: FastifyReply): Promise<void> {
    const payment = await paymentService.getPayment(request.params.id, request.merchant.id);
    if (!payment) {
      await reply.status(404).send({ error: 'Payment not found' });
      return;
    }
    await reply.send(payment);
  }

  async refundPayment(
    request: FastifyRequest<{ Params: PaymentParams; Body: RefundBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const payment = await paymentService.getPayment(request.params.id, request.merchant.id);
    if (!payment) {
      await reply.status(404).send({ error: 'Payment not found' });
      return;
    }
    const result = await paymentService.refundPayment({
      payment,
      amount: request.body.amount,
      reason: request.body.reason,
    });
    await reply.send(result);
  }
}

export const paymentController = new PaymentController();

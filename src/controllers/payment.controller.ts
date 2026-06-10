import type { FastifyRequest, FastifyReply } from 'fastify';
import { PaymentStatus } from '@prisma/client';
import { paymentService } from '../services/index.js';
import { ResponseHandler } from '../utils/response-handler.js';
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
    await ResponseHandler.idempotent(reply, result, 'Checkout session created');
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
    await ResponseHandler.idempotent(reply, result, 'Payment intent created');
  }

  async listPayments(request: FastifyRequest<{ Querystring: ListPaymentsQuery }>, reply: FastifyReply): Promise<void> {
    const page = Math.max(1, request.query.page ?? 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, request.query.limit ?? DEFAULT_PAGE_LIMIT));
    const status = request.query.status;

    if (status && !Object.values(PaymentStatus).includes(status)) {
      await ResponseHandler.validationError(reply, `Invalid status: ${status}`);
      return;
    }

    const result = await paymentService.listPayments(request.merchant.id, page, limit, status);
    await ResponseHandler.paginated(reply, result.items, result.total, page, limit);
  }

  async getPayment(request: FastifyRequest<{ Params: PaymentParams }>, reply: FastifyReply): Promise<void> {
    const payment = await paymentService.getPayment(request.params.id, request.merchant.id);
    if (!payment) {
      await ResponseHandler.notFound(reply, 'Payment not found');
      return;
    }
    await ResponseHandler.success(reply, payment);
  }

  async refundPayment(
    request: FastifyRequest<{ Params: PaymentParams; Body: RefundBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const payment = await paymentService.getPayment(request.params.id, request.merchant.id);
    if (!payment) {
      await ResponseHandler.notFound(reply, 'Payment not found');
      return;
    }
    const result = await paymentService.refundPayment({
      payment,
      amount: request.body.amount,
      reason: request.body.reason,
    });
    await ResponseHandler.success(reply, result, 'Payment refunded successfully');
  }
}

export const paymentController = new PaymentController();

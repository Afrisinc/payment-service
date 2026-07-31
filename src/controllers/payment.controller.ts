import type { FastifyRequest, FastifyReply } from 'fastify';
import { PaymentStatus } from '@prisma/client';
import { paymentRepository } from '../repositories/index.js';
import { MobilePaymentService } from '../services/index.js';
import { ResponseHandler } from '../utils/response.js';
import type { PaymentParams, ListPaymentsQuery } from '../types/index.js';

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const mobilePaymentService = new MobilePaymentService();

export class PaymentController {
  async listPayments(request: FastifyRequest<{ Querystring: ListPaymentsQuery }>, reply: FastifyReply): Promise<void> {
    const page = Math.max(1, request.query.page ?? 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, request.query.limit ?? DEFAULT_PAGE_LIMIT));
    const status = request.query.status;

    if (status && !Object.values(PaymentStatus).includes(status)) {
      return ResponseHandler.error(reply, `Invalid status: ${status}`, 1002, 400);
    }

    const result = await paymentRepository.listByMerchant(request.merchant.id, page, limit, status);
    return ResponseHandler.success(reply, 1000, 'Payments retrieved successfully', {
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
      return ResponseHandler.error(reply, 'Payment not found', 1004, 404);
    }
    return ResponseHandler.success(reply, 1000, 'Payment retrieved successfully', payment);
  }

  async checkPaymentStatus(request: FastifyRequest<{ Params: { ref: string } }>, reply: FastifyReply): Promise<void> {
    const payment = await mobilePaymentService.getPaymentByRef(request.params.ref, request.merchant.id);
    if (!payment) {
      return ResponseHandler.error(reply, 'Payment not found', 1004, 404);
    }

    return ResponseHandler.success(reply, 1000, 'Payment status retrieved successfully', {
      transaction_id: payment.id,
      status: payment.status,
      amount: payment.amount,
    });
  }
}

export const paymentController = new PaymentController();

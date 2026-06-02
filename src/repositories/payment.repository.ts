import type { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { CreatePaymentData, PaymentPage } from '../types/index.js';

export class PaymentRepository {
  async createWithFee(data: CreatePaymentData): Promise<Payment> {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          merchantId: data.merchantId,
          orderId: data.orderId,
          amount: data.amount,
          currency: data.currency,
          type: data.type,
          stripeSessionId: data.stripeSessionId,
          stripeIntentId: data.stripeIntentId,
          metadata: data.metadata,
        },
      });

      await tx.fee.create({
        data: {
          paymentId: payment.id,
          merchantId: data.merchantId,
          feeAmount: data.feeAmount,
          feePercent: data.feePercent,
          currency: data.currency,
        },
      });

      return payment;
    });
  }

  async findById(id: string): Promise<Payment | null> {
    return prisma.payment.findUnique({ where: { id } });
  }

  async findByIdAndMerchant(id: string, merchantId: string): Promise<Payment | null> {
    return prisma.payment.findFirst({ where: { id, merchantId } });
  }

  async findByMerchantAndOrder(merchantId: string, orderId: string): Promise<Payment | null> {
    return prisma.payment.findUnique({
      where: { merchantId_orderId: { merchantId, orderId } },
    });
  }

  async findByStripeSessionId(stripeSessionId: string): Promise<Payment | null> {
    return prisma.payment.findFirst({ where: { stripeSessionId } });
  }

  async findByStripeIntentId(stripeIntentId: string): Promise<Payment | null> {
    return prisma.payment.findFirst({ where: { stripeIntentId } });
  }

  async listByMerchant(merchantId: string, page: number, limit: number, status?: PaymentStatus): Promise<PaymentPage> {
    const where: Prisma.PaymentWhereInput = { merchantId, ...(status && { status }) };
    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.payment.count({ where }),
    ]);
    return { items, total };
  }

  async updateStatus(id: string, status: PaymentStatus): Promise<Payment> {
    return prisma.payment.update({ where: { id }, data: { status } });
  }

  async updateStatusWithMerchant(
    id: string,
    status: PaymentStatus,
  ): Promise<(Payment & { merchant: { id: string; webhookUrl: string | null; webhookSecret: string | null } }) | null> {
    return prisma.payment.update({
      where: { id },
      data: { status },
      include: {
        merchant: {
          select: { id: true, webhookUrl: true, webhookSecret: true },
        },
      },
    });
  }

  async updateStatusByStripeSessionId(stripeSessionId: string, status: PaymentStatus): Promise<Payment | null> {
    const payment = await this.findByStripeSessionId(stripeSessionId);
    if (!payment) return null;
    return this.updateStatus(payment.id, status);
  }

  async updateStatusByStripeIntentId(stripeIntentId: string, status: PaymentStatus): Promise<Payment | null> {
    const payment = await this.findByStripeIntentId(stripeIntentId);
    if (!payment) return null;
    return this.updateStatus(payment.id, status);
  }

  async updateStatusByStripeSessionIdWithMerchant(
    stripeSessionId: string,
    status: PaymentStatus,
  ): Promise<(Payment & { merchant: { id: string; webhookUrl: string | null; webhookSecret: string | null } }) | null> {
    const payment = await this.findByStripeSessionId(stripeSessionId);
    if (!payment) return null;
    return this.updateStatusWithMerchant(payment.id, status);
  }

  async updateStatusByStripeIntentIdWithMerchant(
    stripeIntentId: string,
    status: PaymentStatus,
  ): Promise<(Payment & { merchant: { id: string; webhookUrl: string | null; webhookSecret: string | null } }) | null> {
    const payment = await this.findByStripeIntentId(stripeIntentId);
    if (!payment) return null;
    return this.updateStatusWithMerchant(payment.id, status);
  }
}

export const paymentRepository = new PaymentRepository();

import type { MobilePayment, MobilePaymentStatus, MobilePaymentType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface CreateMobilePaymentData {
  merchantId: string;
  orderId: string;
  ref: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  type: MobilePaymentType;
  provider?: string;
  fee?: number;
  customerName?: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface MobilePaymentPage {
  items: MobilePayment[];
  total: number;
}

export class MobilePaymentRepository {
  async create(data: CreateMobilePaymentData): Promise<MobilePayment> {
    return prisma.mobilePayment.create({
      data: {
        merchantId: data.merchantId,
        orderId: data.orderId,
        ref: data.ref,
        amount: data.amount,
        currency: data.currency,
        phoneNumber: data.phoneNumber,
        type: data.type,
        provider: data.provider,
        fee: data.fee ?? 0,
        customerName: data.customerName,
        description: data.description,
        metadata: data.metadata ?? undefined,
      },
    });
  }

  async findById(id: string): Promise<MobilePayment | null> {
    return prisma.mobilePayment.findUnique({ where: { id } });
  }

  async findByRef(ref: string): Promise<MobilePayment | null> {
    return prisma.mobilePayment.findUnique({ where: { ref } });
  }

  async findByIdAndMerchant(id: string, merchantId: string): Promise<MobilePayment | null> {
    return prisma.mobilePayment.findFirst({ where: { id, merchantId } });
  }

  async findByRefAndMerchant(ref: string, merchantId: string): Promise<MobilePayment | null> {
    return prisma.mobilePayment.findFirst({ where: { ref, merchantId } });
  }

  async findByMerchantAndOrder(merchantId: string, orderId: string): Promise<MobilePayment | null> {
    return prisma.mobilePayment.findUnique({
      where: { merchantId_orderId: { merchantId, orderId } },
    });
  }

  async findByRefWithMerchant(
    ref: string,
  ): Promise<
    (MobilePayment & { merchant: { id: string; webhookUrl: string | null; webhookSecret: string | null } }) | null
  > {
    return prisma.mobilePayment.findUnique({
      where: { ref },
      include: {
        merchant: {
          select: { id: true, webhookUrl: true, webhookSecret: true },
        },
      },
    });
  }

  async listByMerchant(
    merchantId: string,
    page: number,
    limit: number,
    status?: MobilePaymentStatus,
    type?: MobilePaymentType,
  ): Promise<MobilePaymentPage> {
    const where: Prisma.MobilePaymentWhereInput = {
      merchantId,
      ...(status && { status }),
      ...(type && { type }),
    };

    const [items, total] = await Promise.all([
      prisma.mobilePayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.mobilePayment.count({ where }),
    ]);

    return { items, total };
  }

  async updateStatus(id: string, status: MobilePaymentStatus, failureReason?: string): Promise<MobilePayment> {
    return prisma.mobilePayment.update({
      where: { id },
      data: {
        status,
        failureReason,
        processedAt: status === 'SUCCESSFUL' || status === 'FAILED' ? new Date() : undefined,
      },
    });
  }

  async updateByRef(
    ref: string,
    data: {
      status?: MobilePaymentStatus;
      provider?: string;
      fee?: number;
      failureReason?: string;
    },
  ): Promise<MobilePayment | null> {
    const payment = await this.findByRef(ref);
    if (!payment) return null;

    return prisma.mobilePayment.update({
      where: { id: payment.id },
      data: {
        ...data,
        processedAt: data.status === 'SUCCESSFUL' || data.status === 'FAILED' ? new Date() : undefined,
      },
    });
  }

  async updateByRefWithMerchant(
    ref: string,
    data: {
      status?: MobilePaymentStatus;
      provider?: string;
      fee?: number;
      failureReason?: string;
    },
  ): Promise<
    (MobilePayment & { merchant: { id: string; webhookUrl: string | null; webhookSecret: string | null } }) | null
  > {
    const payment = await this.findByRef(ref);
    if (!payment) return null;

    return prisma.mobilePayment.update({
      where: { id: payment.id },
      data: {
        ...data,
        processedAt: data.status === 'SUCCESSFUL' || data.status === 'FAILED' ? new Date() : undefined,
      },
      include: {
        merchant: {
          select: { id: true, webhookUrl: true, webhookSecret: true },
        },
      },
    });
  }
}

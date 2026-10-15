import type { MobilePayment, MobilePaymentStatus, MobilePaymentType, Prisma } from '@prisma/client';
import { prismaRead, prismaWrite } from '../lib/prisma.js';

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

/**
 * Merchant mobile money ledger, in RWF
 * available = collected - collectionFees - paidOut - pendingPayouts
 */
export interface MerchantLedger {
  collected: number; // successful cashins (mobile money + card)
  collectionFees: number; // fees charged on successful cashins
  paidOut: number; // successful cashouts, fees included
  pendingPayouts: number; // in-flight cashouts, fees included (reserved)
  available: number;
  currency: 'RWF';
}

export class InsufficientBalanceError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number,
  ) {
    super(`Insufficient balance: ${available} RWF available, ${requested} RWF requested`);
    this.name = 'InsufficientBalanceError';
  }
}

type DbClient = Prisma.TransactionClient | typeof prismaWrite;

export class MobilePaymentRepository {
  async create(data: CreateMobilePaymentData): Promise<MobilePayment> {
    return prismaWrite.mobilePayment.create({
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

  /**
   * Insert a cashout only if the merchant ledger covers it.
   * A per-merchant advisory lock serialises concurrent cashouts so they cannot overdraw the balance together.
   */
  async createCashoutWithinBalance(data: CreateMobilePaymentData): Promise<MobilePayment> {
    return prismaWrite.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${data.merchantId}))`;

      const ledger = await this.getLedger(data.merchantId, tx);
      const required = data.amount + (data.fee ?? 0);
      if (required > ledger.available) {
        throw new InsufficientBalanceError(ledger.available, required);
      }

      return tx.mobilePayment.create({
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
    });
  }

  /**
   * Compute the merchant ledger from the primary database (never the read replica: balances must be current)
   */
  async getLedger(merchantId: string, client: DbClient = prismaWrite): Promise<MerchantLedger> {
    const groups = await client.mobilePayment.groupBy({
      by: ['type', 'status'],
      where: { merchantId },
      _sum: { amount: true, fee: true },
    });

    let collected = 0;
    let collectionFees = 0;
    let paidOut = 0;
    let pendingPayouts = 0;

    for (const group of groups) {
      const amount = group._sum.amount ?? 0;
      const fee = group._sum.fee ?? 0;

      if (group.type === 'CASHIN' && group.status === 'SUCCESSFUL') {
        collected += amount;
        collectionFees += fee;
      } else if (group.type === 'CASHOUT' && group.status === 'SUCCESSFUL') {
        paidOut += amount + fee;
      } else if (group.type === 'CASHOUT' && (group.status === 'PENDING' || group.status === 'PROCESSING')) {
        pendingPayouts += amount + fee;
      }
    }

    return {
      collected,
      collectionFees,
      paidOut,
      pendingPayouts,
      available: collected - collectionFees - paidOut - pendingPayouts,
      currency: 'RWF',
    };
  }

  async findById(id: string): Promise<MobilePayment | null> {
    return prismaRead.mobilePayment.findUnique({ where: { id } });
  }

  async findByRef(ref: string): Promise<MobilePayment | null> {
    return prismaWrite.mobilePayment.findUnique({ where: { ref } });
  }

  async findByIdAndMerchant(id: string, merchantId: string): Promise<MobilePayment | null> {
    return prismaRead.mobilePayment.findFirst({ where: { id, merchantId } });
  }

  async findByRefAndMerchant(ref: string, merchantId: string): Promise<MobilePayment | null> {
    return prismaRead.mobilePayment.findFirst({ where: { ref, merchantId } });
  }

  async findByMerchantAndOrder(merchantId: string, orderId: string): Promise<MobilePayment | null> {
    return prismaWrite.mobilePayment.findUnique({
      where: { merchantId_orderId: { merchantId, orderId } },
    });
  }

  async findByRefWithMerchant(
    ref: string,
  ): Promise<
    (MobilePayment & { merchant: { id: string; webhookUrl: string | null; webhookSecret: string | null } }) | null
  > {
    return prismaRead.mobilePayment.findUnique({
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
      prismaRead.mobilePayment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prismaRead.mobilePayment.count({ where }),
    ]);

    return { items, total };
  }

  async updateStatus(id: string, status: MobilePaymentStatus, failureReason?: string): Promise<MobilePayment> {
    return prismaWrite.mobilePayment.update({
      where: { id },
      data: {
        status,
        failureReason,
        processedAt: status === 'SUCCESSFUL' || status === 'FAILED' ? new Date() : undefined,
      },
    });
  }

  async updateById(
    id: string,
    data: {
      ref?: string;
      amount?: number;
      status?: MobilePaymentStatus;
      failureReason?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<MobilePayment> {
    return prismaWrite.mobilePayment.update({
      where: { id },
      data: {
        ...data,
        processedAt: data.status === 'SUCCESSFUL' || data.status === 'FAILED' ? new Date() : undefined,
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

    return prismaWrite.mobilePayment.update({
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

    return prismaWrite.mobilePayment.update({
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

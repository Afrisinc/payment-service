/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import { prisma } from '../lib/prisma.js';

export interface ListMerchantsParams {
  page: number;
  limit: number;
  status?: 'active' | 'inactive';
  search?: string;
  sortBy: 'name' | 'email' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

export interface ListPaymentsParams {
  page: number;
  limit: number;
  type?: 'mobile' | 'card' | 'stripe';
  status?: string;
  provider?: string;
  merchant?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
  sortBy: 'createdAt' | 'amount' | 'status';
  sortOrder: 'asc' | 'desc';
}

export class AdminRepository {
  async listMerchants(params: ListMerchantsParams) {
    const skip = (params.page - 1) * params.limit;

    const where: any = {};
    if (params.status === 'active') where.isActive = true;
    if (params.status === 'inactive') where.isActive = false;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [merchants, total] = await prisma.$transaction([
      prisma.merchant.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          defaultFeePercent: true,
          webhookUrl: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: params.limit,
        orderBy: { [params.sortBy]: params.sortOrder },
      }),
      prisma.merchant.count({ where }),
    ]);

    return {
      data: merchants.map((m) => ({
        ...m,
        defaultFeePercent: Number(m.defaultFeePercent),
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      pagination: {
        total,
        page: params.page,
        pageSize: params.limit,
        hasMore: skip + params.limit < total,
      },
    };
  }

  async listPayments(params: ListPaymentsParams) {
    const skip = (params.page - 1) * params.limit;

    const mobileWhere: any = {};
    const paymentWhere: any = {};

    if (params.status) {
      mobileWhere.status = params.status;
      paymentWhere.status = params.status === 'SUCCESSFUL' ? 'SUCCEEDED' : params.status;
    }
    if (params.provider) mobileWhere.provider = params.provider;
    if (params.merchant) {
      mobileWhere.merchantId = params.merchant;
      paymentWhere.merchantId = params.merchant;
    }
    if (params.dateFrom) {
      mobileWhere.createdAt = { gte: params.dateFrom };
      paymentWhere.createdAt = { gte: params.dateFrom };
    }
    if (params.dateTo) {
      if (mobileWhere.createdAt) {
        mobileWhere.createdAt.lte = params.dateTo;
        paymentWhere.createdAt.lte = params.dateTo;
      } else {
        mobileWhere.createdAt = { lte: params.dateTo };
        paymentWhere.createdAt = { lte: params.dateTo };
      }
    }
    if (params.minAmount) {
      mobileWhere.amount = { gte: params.minAmount };
      paymentWhere.amount = { gte: params.minAmount };
    }
    if (params.maxAmount) {
      if (mobileWhere.amount) {
        mobileWhere.amount.lte = params.maxAmount;
        paymentWhere.amount.lte = params.maxAmount;
      } else {
        mobileWhere.amount = { lte: params.maxAmount };
        paymentWhere.amount = { lte: params.maxAmount };
      }
    }
    if (params.search) {
      mobileWhere.OR = [
        { ref: { contains: params.search, mode: 'insensitive' } },
        { orderId: { contains: params.search, mode: 'insensitive' } },
      ];
      paymentWhere.OR = [
        { id: { contains: params.search, mode: 'insensitive' } },
        { orderId: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const payments: any[] = [];

    if (!params.type || params.type === 'mobile') {
      const mobilePayments = await prisma.mobilePayment.findMany({
        where: mobileWhere,
        select: {
          id: true,
          ref: true,
          orderId: true,
          merchantId: true,
          amount: true,
          currency: true,
          status: true,
          provider: true,
          phoneNumber: true,
          createdAt: true,
        },
        orderBy: { [params.sortBy]: params.sortOrder },
      });
      payments.push(
        ...mobilePayments.map((p) => ({
          ...p,
          type: 'mobile',
        })),
      );
    }

    if (!params.type || params.type === 'card') {
      const cardPayments = await prisma.mobilePayment.findMany({
        where: {
          ...mobileWhere,
          metadata: { path: ['payment_type'], equals: 'card' },
        },
        select: {
          id: true,
          ref: true,
          orderId: true,
          merchantId: true,
          amount: true,
          currency: true,
          status: true,
          provider: true,
          phoneNumber: true,
          createdAt: true,
        },
        orderBy: { [params.sortBy]: params.sortOrder },
      });
      payments.push(
        ...cardPayments.map((p) => ({
          ...p,
          type: 'card',
        })),
      );
    }

    if (!params.type || params.type === 'stripe') {
      const stripePayments = await prisma.payment.findMany({
        where: paymentWhere,
        select: {
          id: true,
          orderId: true,
          merchantId: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
        },
        orderBy: { [params.sortBy]: params.sortOrder },
      });
      payments.push(
        ...stripePayments.map((p) => ({
          ...p,
          type: 'stripe',
          ref: p.id,
          provider: 'stripe',
          phoneNumber: null,
        })),
      );
    }

    const allPayments = payments
      .sort((a, b) => {
        if (params.sortOrder === 'asc') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return a[params.sortBy] > b[params.sortBy] ? 1 : -1;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return a[params.sortBy] < b[params.sortBy] ? 1 : -1;
      })
      .slice(skip, skip + params.limit)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call
      .map((p) => ({
        ...p,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
      }));

    return {
      data: allPayments,
      pagination: {
        total: payments.length,
        page: params.page,
        pageSize: params.limit,
        hasMore: skip + params.limit < payments.length,
      },
    };
  }

  async getDashboardMetrics(dateFrom: Date, dateTo: Date) {
    const mobilePayments = await prisma.mobilePayment.findMany({
      where: {
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    });

    const stripePayments = await prisma.payment.findMany({
      where: {
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const mobilePaymentsToday = await prisma.mobilePayment.findMany({
      where: {
        createdAt: { gte: today, lt: tomorrow },
      },
    });

    const stripePaymentsToday = await prisma.payment.findMany({
      where: {
        createdAt: { gte: today, lt: tomorrow },
      },
    });

    const allPayments = [...mobilePayments, ...stripePayments];
    const allPaymentsToday = [...mobilePaymentsToday, ...stripePaymentsToday];

    const successCount = allPayments.filter((p) => p.status === 'SUCCESSFUL' || p.status === 'SUCCEEDED').length;
    const failedCount = allPayments.filter((p) => p.status === 'FAILED').length;
    const pendingCount = allPayments.filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING').length;

    const totalVolume = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalVolumeToday = allPaymentsToday.reduce((sum, p) => sum + (p.amount || 0), 0);

    const successRate = allPayments.length > 0 ? parseFloat(((successCount / allPayments.length) * 100).toFixed(2)) : 0;

    const mobileVolume = mobilePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const stripeVolume = stripePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const cardPayments = mobilePayments.filter((p) => p.metadata && (p.metadata as any).payment_type === 'card');
    const cardVolume = cardPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      totalTransactions: allPayments.length,
      totalTransactionsToday: allPaymentsToday.length,
      totalVolume,
      totalVolumeToday,
      successRate,
      failedCount,
      pendingCount,
      averageTransactionTime: 2.5,
      volumeByType: {
        mobile: mobileVolume - cardVolume,
        card: cardVolume,
        stripe: stripeVolume,
      },
    };
  }

  async getChartData(days: number, _groupBy: 'day' | 'week' | 'month') {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const mobilePayments = await prisma.mobilePayment.findMany({
      where: { createdAt: { gte: dateFrom } },
      select: {
        amount: true,
        status: true,
        provider: true,
        createdAt: true,
        merchantId: true,
      },
    });

    const stripePayments = await prisma.payment.findMany({
      where: { createdAt: { gte: dateFrom } },
      select: {
        amount: true,
        status: true,
        createdAt: true,
        merchantId: true,
      },
    });

    const allPayments = [...mobilePayments, ...stripePayments];

    const volumeByDay: Record<string, { amount: number; count: number }> = {};
    const statusDistribution: Record<string, number> = {
      SUCCESSFUL: 0,
      SUCCEEDED: 0,
      PENDING: 0,
      FAILED: 0,
      PROCESSING: 0,
    };
    const providerDistribution: Record<string, number> = {
      ITEC: 0,
      Paypack: 0,
      Stripe: 0,
      PesaPal: 0,
    };
    const merchantVolumes: Record<string, { volume: number; count: number }> = {};
    const transactionTrend: Record<string, number> = {};

    for (const payment of allPayments) {
      const date = new Date(payment.createdAt);
      const dateStr = date.toISOString().split('T')[0] as string;

      if (!volumeByDay[dateStr]) {
        volumeByDay[dateStr] = { amount: 0, count: 0 };
      }
      volumeByDay[dateStr].amount += payment.amount;
      volumeByDay[dateStr].count += 1;

      if (statusDistribution[payment.status] !== undefined) {
        statusDistribution[payment.status]! += 1;
      }

      if ('provider' in payment && payment.provider) {
        if (providerDistribution[payment.provider]) {
          providerDistribution[payment.provider]! += 1;
        }
      } else {
        providerDistribution['Stripe']! += 1;
      }

      if (!merchantVolumes[payment.merchantId]) {
        merchantVolumes[payment.merchantId] = { volume: 0, count: 0 };
      }
      merchantVolumes[payment.merchantId]!.volume += payment.amount;
      merchantVolumes[payment.merchantId]!.count += 1;

      if (!transactionTrend[dateStr]) {
        transactionTrend[dateStr] = 0;
      }
      transactionTrend[dateStr] += 1;
    }

    const topMerchants = Object.entries(merchantVolumes)
      .map(([merchantId, data]) => ({
        merchantId,
        merchantName: `Merchant ${merchantId.slice(0, 8)}`,
        volume: data.volume,
        count: data.count,
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    return {
      volumeByDay: Object.entries(volumeByDay)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      statusDistribution,
      providerDistribution,
      topMerchants,
      transactionTrend: Object.entries(transactionTrend)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async getPaymentById(paymentId: string) {
    const mobilePayment = await prisma.mobilePayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        amount: true,
        status: true,
        provider: true,
        ref: true,
        orderId: true,
        merchantId: true,
        phoneNumber: true,
        createdAt: true,
      },
    });

    if (mobilePayment) {
      return {
        id: mobilePayment.id,
        type: 'mobile',
        ref: mobilePayment.ref,
        orderId: mobilePayment.orderId,
        merchantId: mobilePayment.merchantId,
        amount: mobilePayment.amount,
        currency: 'RWF',
        status: mobilePayment.status,
        provider: mobilePayment.provider,
        phoneNumber: mobilePayment.phoneNumber,
        createdAt: mobilePayment.createdAt.toISOString(),
      };
    }

    const stripePayment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (stripePayment) {
      return {
        id: stripePayment.id,
        type: 'stripe',
        ref: stripePayment.stripeIntentId,
        orderId: stripePayment.orderId,
        merchantId: stripePayment.merchantId,
        amount: stripePayment.amount,
        currency: stripePayment.currency || 'USD',
        status: stripePayment.status,
        provider: 'Stripe',
        createdAt: stripePayment.createdAt.toISOString(),
      };
    }

    return null;
  }

  async listWebhookDeliveries(page: number, limit: number, status?: string, merchantId?: string) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (merchantId) {
      where.merchantId = merchantId;
    }

    const [deliveries, total] = await prisma.$transaction([
      prisma.webhookDelivery.findMany({
        where,
        select: {
          id: true,
          merchantId: true,
          eventType: true,
          status: true,
          attempts: true,
          nextRetry: true,
          createdAt: true,
          deliveredAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    return {
      data: deliveries.map((d) => ({
        id: d.id,
        merchantId: d.merchantId,
        eventType: d.eventType,
        status: d.status,
        attempts: d.attempts,
        nextRetry: d.nextRetry ? d.nextRetry.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
        deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
      })),
      pagination: {
        total,
        page,
        pageSize: limit,
        hasMore: skip + limit < total,
      },
    };
  }

  async getWebhookDelivery(deliveryId: string) {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    return delivery
      ? {
          id: delivery.id,
          merchantId: delivery.merchantId,
          paymentId: delivery.paymentId,
          eventType: delivery.eventType,
          payload: delivery.payload,
          status: delivery.status,
          attempts: delivery.attempts,
          lastAttempt: delivery.lastAttempt ? delivery.lastAttempt.toISOString() : null,
          nextRetry: delivery.nextRetry ? delivery.nextRetry.toISOString() : null,
          responseCode: delivery.responseCode,
          errorMessage: delivery.errorMessage,
          createdAt: delivery.createdAt.toISOString(),
          deliveredAt: delivery.deliveredAt ? delivery.deliveredAt.toISOString() : null,
        }
      : null;
  }
}

export const adminRepository = new AdminRepository();

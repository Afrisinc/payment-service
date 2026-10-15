import { adminRepository } from '../repositories/admin.repository.js';
import type {
  ListMerchantsParams,
  ListPaymentsParams,
  ListMobilePaymentsParams,
} from '../repositories/admin.repository.js';
import { MobilePaymentRepository } from '../repositories/mobile-payment.repository.js';
import type { MerchantLedger } from '../repositories/mobile-payment.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
import { merchantRepository } from '../repositories/merchant.repository.js';
import { env } from '../config/env.js';
import { ConflictError, HttpError, NotFoundError } from '../utils/http-error.js';
import type { MobilePaymentResult } from '../types/mobile-payment.js';
import type { WebhookDeliveryStatus } from '@prisma/client';
import { merchantWebhookService } from './merchant-webhook.service.js';
import { MobilePaymentService } from './mobile-payment.service.js';
import { CardPaymentService } from './card-payment.service.js';

const mobilePaymentRepository = new MobilePaymentRepository();
const mobilePaymentService = new MobilePaymentService();
const cardPaymentService = new CardPaymentService();

export interface RefreshedPaymentStatus {
  id: string;
  ref: string;
  type: 'card' | 'mobile' | 'payment';
  merchantId: string;
  status: string;
  provider: string | null;
}

export interface MerchantBalance extends MerchantLedger {
  merchantId: string;
  payoutsEnabled: boolean;
}

export interface AdminPayoutParams {
  orderId: string;
  amount: number;
  phoneNumber: string;
  recipientName?: string;
  description?: string;
}

export class AdminService {
  async listMerchants(params: ListMerchantsParams) {
    return adminRepository.listMerchants(params);
  }

  async listPayments(params: ListPaymentsParams) {
    return adminRepository.listPayments(params);
  }

  async getDashboardMetrics(dateFrom?: Date, dateTo?: Date) {
    const from = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateTo || new Date();

    return adminRepository.getDashboardMetrics(from, to);
  }

  async getChartData(days: number = 30, groupBy: 'day' | 'week' | 'month' = 'day') {
    return adminRepository.getChartData(days, groupBy);
  }

  async getPaymentById(paymentId: string) {
    return adminRepository.getPaymentById(paymentId);
  }

  async listWebhookDeliveries(page: number, limit: number, status?: WebhookDeliveryStatus, merchantId?: string) {
    return adminRepository.listWebhookDeliveries(page, limit, status, merchantId);
  }

  async getWebhookDelivery(deliveryId: string) {
    return adminRepository.getWebhookDelivery(deliveryId);
  }

  /**
   * Manually re-send a webhook that has not been delivered (one immediate attempt)
   */
  async retryWebhookDelivery(deliveryId: string) {
    const delivery = await adminRepository.getWebhookDelivery(deliveryId);
    if (!delivery) throw new NotFoundError('Webhook delivery not found');
    if (delivery.status === 'DELIVERED') throw new ConflictError('Webhook already delivered');

    await merchantWebhookService.attemptDelivery(deliveryId);

    return adminRepository.getWebhookDelivery(deliveryId);
  }

  async listMobilePayments(params: ListMobilePaymentsParams) {
    return adminRepository.listMobilePayments(params);
  }

  async getMobilePaymentById(paymentId: string) {
    return adminRepository.getMobilePaymentById(paymentId);
  }

  async getMobilePaymentStats(dateFrom?: Date, dateTo?: Date) {
    return adminRepository.getMobilePaymentStats(dateFrom, dateTo);
  }

  async refreshPaymentStatus(paymentId: string): Promise<RefreshedPaymentStatus | null> {
    let payment: any = await mobilePaymentRepository.findById(paymentId);
    let isMobilePayment = true;

    if (!payment) {
      payment = await paymentRepository.findById(paymentId);
      isMobilePayment = false;
    }

    if (!payment) return null;

    const oldStatus = payment.status;
    const metadata = (payment.metadata as Record<string, unknown> | null) ?? {};
    const isCard = metadata.payment_type === 'card' || payment.type === 'CARD';

    let result = null;
    if (isMobilePayment) {
      result = isCard
        ? await cardPaymentService.getCardPaymentStatus(payment.ref, payment.merchantId)
        : await mobilePaymentService.getPaymentStatusByRef(payment.ref, payment.merchantId);
    }

    const newStatus = result?.status ?? payment.status;

    // Notify merchant if status changed
    if (oldStatus !== newStatus && result && payment.merchant) {
      const paymentWithMerchant = {
        ...payment,
        status: newStatus,
      } as any;
      await merchantWebhookService.notifyPaymentEvent(paymentWithMerchant, 'payment.succeeded');
    }

    let type: RefreshedPaymentStatus['type'];
    if (!isMobilePayment) {
      type = 'payment';
    } else {
      type = isCard ? 'card' : 'mobile';
    }

    return {
      id: payment.id,
      ref: payment.ref || payment.orderId,
      type,
      merchantId: payment.merchantId,
      status: newStatus,
      provider: result?.provider ?? payment.provider ?? null,
    } as RefreshedPaymentStatus;
  }

  async getMerchantBalance(merchantId: string): Promise<MerchantBalance> {
    const merchant = await merchantRepository.findById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant not found');

    const ledger = await mobilePaymentService.getMerchantLedger(merchantId);
    return { merchantId, ...ledger, payoutsEnabled: env.ADMIN_PAYOUTS_ENABLED };
  }

  /**
   * Send an ITEC payout on behalf of a merchant from the admin dashboard.
   * Same guarantees as the merchant API: idempotent on orderId and bounded by the merchant balance.
   */
  async createMerchantPayout(merchantId: string, params: AdminPayoutParams): Promise<MobilePaymentResult> {
    if (!env.ADMIN_PAYOUTS_ENABLED) {
      throw new HttpError(403, 'Admin payouts are disabled');
    }

    const merchant = await merchantRepository.findById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant not found');
    if (!merchant.isActive) throw new ConflictError('Merchant account is inactive');

    return mobilePaymentService.cashout({
      merchant,
      merchantId,
      orderId: params.orderId,
      amount: params.amount,
      phoneNumber: params.phoneNumber,
      recipientName: params.recipientName,
      description: params.description,
      metadata: { initiated_by: 'admin_dashboard' },
      provider: 'itec',
    });
  }
}

export const adminService = new AdminService();

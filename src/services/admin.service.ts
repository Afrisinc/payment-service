import { adminRepository } from '../repositories/admin.repository.js';
import type {
  ListMerchantsParams,
  ListPaymentsParams,
  ListMobilePaymentsParams,
} from '../repositories/admin.repository.js';
import { MobilePaymentRepository } from '../repositories/mobile-payment.repository.js';
import { paymentRepository } from '../repositories/payment.repository.js';
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

  async listWebhookDeliveries(page: number, limit: number, status?: string, merchantId?: string) {
    return adminRepository.listWebhookDeliveries(page, limit, status, merchantId);
  }

  async getWebhookDelivery(deliveryId: string) {
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

    const metadata = (payment.metadata as Record<string, unknown> | null) ?? {};
    const isCard = metadata.payment_type === 'card' || payment.type === 'CARD';

    let result = null;
    if (isMobilePayment) {
      result = isCard
        ? await cardPaymentService.getCardPaymentStatus(payment.ref, payment.merchantId)
        : await mobilePaymentService.getPaymentStatusByRef(payment.ref, payment.merchantId);
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
      status: result?.status ?? payment.status,
      provider: result?.provider ?? payment.provider ?? null,
    } as RefreshedPaymentStatus;
  }
}

export const adminService = new AdminService();

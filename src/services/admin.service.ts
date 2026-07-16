import { adminRepository } from '../repositories/admin.repository.js';
import type { ListMerchantsParams, ListPaymentsParams } from '../repositories/admin.repository.js';

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
}

export const adminService = new AdminService();

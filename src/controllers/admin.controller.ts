import type { FastifyRequest, FastifyReply } from 'fastify';
import { adminService } from '../services/admin.service.js';
import { ResponseHandler } from '../utils/response.js';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
export class AdminController {
  async listMerchants(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { page = 1, limit = 20, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = request.query as any;

    const result = await adminService.listMerchants({
      page,
      limit,
      status: status as 'active' | 'inactive' | undefined,
      search,
      sortBy: sortBy as 'name' | 'email' | 'createdAt',
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    return ResponseHandler.success(reply, 1000, 'Merchants retrieved successfully', result);
  }

  async listPayments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      provider,
      merchant,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = request.query as any;

    const result = await adminService.listPayments({
      page,
      limit,
      type: type as 'mobile' | 'card' | 'stripe' | undefined,
      status,
      provider,
      merchant,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      minAmount,
      maxAmount,
      search,
      sortBy: sortBy as 'createdAt' | 'amount' | 'status',
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    return ResponseHandler.success(reply, 1000, 'Payments retrieved successfully', result);
  }

  async getDashboardMetrics(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { dateFrom, dateTo } = request.query as any;

    const metrics = await adminService.getDashboardMetrics(
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(dateTo) : undefined,
    );

    return ResponseHandler.success(reply, 1000, 'Dashboard metrics retrieved successfully', metrics);
  }

  async getChartData(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { days = 30, groupBy = 'day' } = request.query as any;

    const chartData = await adminService.getChartData(days, groupBy as 'day' | 'week' | 'month');

    return ResponseHandler.success(reply, 1000, 'Chart data retrieved successfully', chartData);
  }

  async getPaymentById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as any;

    const payment = await adminService.getPaymentById(id);

    if (!payment) {
      return ResponseHandler.error(reply, 'Payment not found', 1004, 404);
    }

    return ResponseHandler.success(reply, 1000, 'Payment retrieved successfully', payment);
  }

  async listWebhookDeliveries(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { page = 1, limit = 20, status, merchantId } = request.query as any;

    const result = await adminService.listWebhookDeliveries(page, limit, status, merchantId);

    return ResponseHandler.success(reply, 1000, 'Webhook deliveries retrieved successfully', result);
  }

  async getWebhookDelivery(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as any;

    const delivery = await adminService.getWebhookDelivery(id);

    if (!delivery) {
      return ResponseHandler.error(reply, 'Webhook delivery not found', 1004, 404);
    }

    return ResponseHandler.success(reply, 1000, 'Webhook delivery retrieved successfully', delivery);
  }
}

export const adminController = new AdminController();

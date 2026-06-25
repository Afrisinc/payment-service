import type { FastifyRequest, FastifyReply } from 'fastify';
import { MobilePaymentStatus, MobilePaymentType } from '@prisma/client';
import { MobilePaymentService } from '../services/mobile-payment.service.js';
import { ResponseHandler } from '../utils/response.js';

type MerchantRequest = FastifyRequest & {
  merchant: {
    id: string;
  };
};

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export class MobilePaymentController {
  private readonly mobilePaymentService: MobilePaymentService;

  constructor() {
    this.mobilePaymentService = new MobilePaymentService();
  }

  /**
   * Initiate cashin (collect payment from customer)
   */
  async cashin(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as {
      orderId: string;
      amount: number;
      phoneNumber: string;
      customerName?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    };

    const result = await this.mobilePaymentService.cashin({
      merchant: request.merchant,
      merchantId: request.merchant.id,
      orderId: body.orderId,
      amount: body.amount,
      phoneNumber: body.phoneNumber,
      customerName: body.customerName,
      description: body.description,
      metadata: body.metadata,
    });

    return ResponseHandler.success(reply, 1000, 'Cashin initiated successfully', result, 201);
  }

  /**
   * Initiate cashout (send payment to recipient)
   */
  async cashout(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as {
      orderId: string;
      amount: number;
      phoneNumber: string;
      recipientName?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    };

    const result = await this.mobilePaymentService.cashout({
      merchant: request.merchant,
      merchantId: request.merchant.id,
      orderId: body.orderId,
      amount: body.amount,
      phoneNumber: body.phoneNumber,
      recipientName: body.recipientName,
      description: body.description,
      metadata: body.metadata,
    });

    return ResponseHandler.success(reply, 1000, 'Cashout initiated successfully', result, 201);
  }

  /**
   * Get payment by ID
   */
  async getPayment(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const params = request.params as { id: string };
    const payment = await this.mobilePaymentService.getPayment(params.id, request.merchant.id);

    if (!payment) {
      return ResponseHandler.error(reply, 'Payment not found', 1004, 404);
    }

    return ResponseHandler.success(reply, 1000, 'Payment retrieved successfully', payment);
  }

  /**
   * Get payment by Paypack reference
   */
  async getPaymentByRef(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const params = request.params as { ref: string };
    const payment = await this.mobilePaymentService.getPaymentByRef(params.ref, request.merchant.id);

    if (!payment) {
      return ResponseHandler.error(reply, 'Payment not found', 1004, 404);
    }

    return ResponseHandler.success(reply, 1000, 'Payment retrieved successfully', payment);
  }

  /**
   * List payments
   */
  async listPayments(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const query = request.query as {
      page?: number;
      limit?: number;
      status?: MobilePaymentStatus;
      type?: MobilePaymentType;
    };

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, query.limit ?? DEFAULT_PAGE_LIMIT));
    const { status, type } = query;

    const validStatuses: MobilePaymentStatus[] = ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED'];
    if (status && !validStatuses.includes(status)) {
      return ResponseHandler.error(reply, `Invalid status: ${status}`, 1002, 400);
    }

    const validTypes: MobilePaymentType[] = ['CASHIN', 'CASHOUT'];
    if (type && !validTypes.includes(type)) {
      return ResponseHandler.error(reply, `Invalid type: ${type}`, 1002, 400);
    }

    const result = await this.mobilePaymentService.listPayments(request.merchant.id, page, limit, status, type);

    return ResponseHandler.success(reply, 1000, 'Payments retrieved successfully', {
      data: result.items,
      pagination: {
        total: result.total,
        page,
        limit,
        pages: Math.ceil(result.total / limit),
      },
    });
  }

  /**
   * Get account balance and info
   */
  async getAccountInfo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await this.mobilePaymentService.getAccountInfo();
    return ResponseHandler.success(reply, 1000, 'Account info retrieved successfully', result);
  }

  /**
   * Handle Paypack webhook
   */
  async handleWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as {
      event_kind: string;
      data: {
        ref: string;
        status: string;
        fee?: number;
        provider?: string;
        amount?: number;
      };
    };

    await this.mobilePaymentService.processWebhook({
      event_kind: body.event_kind,
      data: {
        ref: body.data.ref,
        status: body.data.status,
        fee: body.data.fee,
        provider: body.data.provider,
        amount: body.data.amount,
      },
    });

    return ResponseHandler.success(reply, 1000, 'Webhook received', { received: true });
  }
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import { CardPaymentService } from '../services/card-payment.service.js';
import { ResponseHandler } from '../utils/response.js';

type MerchantRequest = FastifyRequest & {
  merchant: {
    id: string;
  };
};

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

export class CardPaymentController {
  private readonly cardPaymentService: CardPaymentService;

  constructor() {
    this.cardPaymentService = new CardPaymentService();
  }

  /**
   * Initiate card payment via ITEC PesaPal
   */
  async initiateCardPayment(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as {
      orderId: string;
      amount: number;
      email: string;
      customerName?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    };

    const result = await this.cardPaymentService.initiateCardPayment({
      merchant: request.merchant,
      merchantId: request.merchant.id,
      orderId: body.orderId,
      amount: body.amount,
      email: body.email,
      customerName: body.customerName,
      description: body.description,
      metadata: body.metadata,
    });

    return ResponseHandler.success(reply, 1000, 'Card payment initiated successfully', result, 201);
  }

  /**
   * Get card payment by ID
   */
  async getCardPayment(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const params = request.params as { id: string };
    const payment = await this.cardPaymentService.getCardPayment(params.id, request.merchant.id);

    if (!payment) {
      return ResponseHandler.error(reply, 'Card payment not found', 1004, 404);
    }

    return ResponseHandler.success(reply, 1000, 'Card payment retrieved successfully', payment);
  }

  /**
   * Get card payment by PCODE
   */
  async getCardPaymentByPcode(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const params = request.params as { pcode: string };
    const payment = await this.cardPaymentService.getCardPaymentByPcode(params.pcode, request.merchant.id);

    if (!payment) {
      return ResponseHandler.error(reply, 'Card payment not found', 1004, 404);
    }

    return ResponseHandler.success(reply, 1000, 'Card payment retrieved successfully', payment);
  }

  /**
   * Get card payment status by PCODE (polls ITEC and updates DB)
   */
  async getCardPaymentStatus(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const params = request.params as { pcode: string };
    const result = await this.cardPaymentService.getCardPaymentStatus(params.pcode, request.merchant.id);

    return ResponseHandler.success(reply, 1000, 'Card payment status retrieved and updated', result);
  }

  /**
   * List card payments
   */
  async listCardPayments(request: MerchantRequest, reply: FastifyReply): Promise<void> {
    const query = request.query as {
      page?: number;
      limit?: number;
    };

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, query.limit ?? DEFAULT_PAGE_LIMIT));

    const result = await this.cardPaymentService.listCardPayments(request.merchant.id, page, limit);

    return ResponseHandler.success(reply, 1000, 'Card payments retrieved successfully', {
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
   * Handle card payment webhook from ITEC PesaPal
   */
  async handleCardWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = request.body as {
      PCODE?: string;
      pcode?: string;
      status?: string;
      amount?: number;
      transID?: string;
    };

    await this.cardPaymentService.processCardWebhook({
      PCODE: body.PCODE,
      pcode: body.pcode,
      status: body.status,
      amount: body.amount,
      transID: body.transID,
    });

    return ResponseHandler.success(reply, 1000, 'Card webhook received', { received: true });
  }
}

import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { getItecHelper, ItecError } from '../helpers/itec.js';
import { MobilePaymentRepository } from '../repositories/mobile-payment.repository.js';
import { logger } from '../lib/logger.js';
import type {
  CardPaymentRequestParams,
  CardPaymentResult,
  MobilePaymentWithMerchant,
} from '../types/mobile-payment.js';
import type { ItecCardPaymentResponse } from '../types/index.js';

export class CardPaymentService {
  private readonly mobilePaymentRepository: MobilePaymentRepository;

  constructor() {
    this.mobilePaymentRepository = new MobilePaymentRepository();
  }

  /**
   * Initiate card payment via ITEC PesaPal integration (Production-Ready)
   * Generates payment code and checkout URL for card payments (Visa, Mastercard)
   */
  async initiateCardPayment(params: CardPaymentRequestParams): Promise<CardPaymentResult> {
    const { merchant, orderId, amount, email, currency = 'RWF', customerName, description, metadata } = params;

    // Check for existing payment with same orderId (idempotency)
    const existing = await this.mobilePaymentRepository.findByMerchantAndOrder(merchant.id, orderId);
    if (existing) {
      logger.info({ paymentId: existing.id, ref: existing.ref }, 'Returning existing card payment');
      // Re-format as CardPaymentResult
      return this.toCardResult(existing);
    }

    try {
      const itec = getItecHelper();
      const cardResponse = await itec.generateCardPaymentCode({
        amount,
        email,
      });

      if (!cardResponse.PCODE) {
        throw new ItecError('Card payment code generation failed: No PCODE returned', 500);
      }

      // Create payment record with PCODE in metadata
      const paymentMetadata = {
        ...metadata,
        pcode: cardResponse.PCODE,
        payment_type: 'card',
        email,
        checkout_link: cardResponse.link,
      };

      const payment = await this.mobilePaymentRepository.create({
        merchantId: merchant.id,
        orderId,
        ref: cardResponse.PCODE,
        amount,
        currency,
        phoneNumber: email, // Store email in phoneNumber field for compatibility
        type: 'CASHIN', // Card payments use CASHIN type with card metadata
        customerName,
        description,
        metadata: paymentMetadata as Prisma.InputJsonValue,
        provider: 'itec',
      });

      logger.info(
        { paymentId: payment.id, pcode: cardResponse.PCODE, amount, email },
        'Card payment initiated (ITEC PesaPal)',
      );

      return this.toCardResult(payment, cardResponse);
    } catch (err) {
      const message = this.extractErrorMessage(err, 'Card payment initiation failed');
      logger.error({ err, email, amount, orderId }, 'Card payment error');
      if (err instanceof ItecError) throw err;
      throw new Error(message);
    }
  }

  /**
   * Get card payment by ID
   */
  async getCardPayment(id: string, merchantId: string) {
    const payment = await this.mobilePaymentRepository.findByIdAndMerchant(id, merchantId);
    if (!payment) return null;
    return this.toCardResult(payment);
  }

  /**
   * Get card payment by PCODE
   */
  async getCardPaymentByPcode(pcode: string, merchantId: string) {
    const payment = await this.mobilePaymentRepository.findByRefAndMerchant(pcode, merchantId);
    if (!payment) return null;
    return this.toCardResult(payment);
  }

  /**
   * List card payments for a merchant
   */
  async listCardPayments(merchantId: string, page: number, limit: number) {
    const result = await this.mobilePaymentRepository.listByMerchant(merchantId, page, limit, undefined, 'CASHIN');

    return {
      items: result.items
        .filter(
          (p) =>
            p.metadata &&
            typeof p.metadata === 'object' &&
            'payment_type' in p.metadata &&
            p.metadata.payment_type === 'card',
        )
        .map((p) => this.toCardResult(p)),
      total: result.total,
    };
  }

  /**
   * Get card payment status by PCODE (Production-Ready)
   * Returns current status from database
   * NOTE: Card payments receive status updates via PesaPal webhooks (primary method)
   * Database is automatically updated when webhook is received
   * Returns normalized status: PENDING | PROCESSING | SUCCESSFUL | FAILED
   */
  async getCardPaymentStatus(
    pcode: string,
    merchantId: string,
  ): Promise<{ status: string; provider: string; pcode: string }> {
    try {
      // Load payment to verify ownership
      const payment = await this.mobilePaymentRepository.findByRefAndMerchant(pcode, merchantId);
      if (!payment) {
        throw new Error(`Card payment not found: ${pcode}`);
      }

      // Return current status from database
      // Card payment status is updated via PesaPal webhooks
      logger.info({ pcode, status: payment.status }, 'Card payment status retrieved from database');

      return {
        status: payment.status,
        provider: payment.provider || 'itec',
        pcode: payment.ref,
      };
    } catch (err) {
      const message = this.extractErrorMessage(err, 'Failed to get card payment status');
      logger.error({ err, pcode }, 'Card payment status check error');
      if (err instanceof ItecError) throw err;
      throw new Error(message);
    }
  }

  /**
   * Process card payment webhook (ITEC PesaPal callback)
   * Updates payment status based on webhook notification
   */
  async processCardWebhook(event: {
    PCODE?: string;
    pcode?: string;
    status?: string;
    amount?: number;
    transID?: string;
  }): Promise<void> {
    const pcode = event.PCODE || event.pcode;
    const status = event.status;

    logger.info({ pcode, status }, 'Processing card payment webhook (ITEC PesaPal)');

    if (!pcode) {
      logger.warn({ event }, 'Card webhook missing PCODE - ignoring');
      return;
    }

    if (!status) {
      logger.warn({ pcode }, 'Card webhook missing status - ignoring');
      return;
    }

    const mappedStatus = this.mapCardStatus(status);

    try {
      const payment = await this.mobilePaymentRepository.updateByRefWithMerchant(pcode, {
        status: mappedStatus,
        provider: 'itec',
        failureReason: mappedStatus === 'FAILED' ? 'Card payment failed via webhook' : undefined,
      });

      if (!payment) {
        logger.warn({ pcode }, 'Card payment not found for webhook - may be processed earlier');
        return;
      }

      logger.info({ paymentId: payment.id, status: mappedStatus }, 'Card webhook processed successfully');

      // Notify merchant if webhook is configured
      if (payment.merchant.webhookUrl && payment.merchant.webhookSecret) {
        await this.notifyMerchant(payment);
      }
    } catch (err) {
      logger.error({ err, pcode }, 'Error processing card webhook');
      throw err;
    }
  }

  /**
   * Notify merchant about card payment status change
   */
  private async notifyMerchant(payment: MobilePaymentWithMerchant): Promise<void> {
    const { webhookUrl, webhookSecret } = payment.merchant;
    if (!webhookUrl || !webhookSecret) return;

    // Extract email from phoneNumber field (where we stored it)
    const email = payment.phoneNumber;

    const payload = {
      event: 'card_payment:processed',
      merchantId: payment.merchantId,
      paymentId: payment.id,
      pcode: payment.ref,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      email,
      status: payment.status,
      provider: payment.provider,
      processedAt: payment.processedAt,
    };

    const body = JSON.stringify(payload);
    const signature = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn({ status: response.status, paymentId: payment.id }, 'Card webhook delivery returned non-OK status');
      }
    } catch (err) {
      logger.warn({ err, paymentId: payment.id }, 'Card webhook delivery failed');
    }
  }

  /**
   * Map card payment status to standard status
   * PesaPal returns: COMPLETED, FAILED, PROCESSING
   */
  private mapCardStatus(status: string): 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' {
    const statusMap: Record<string, 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED'> = {
      completed: 'SUCCESSFUL',
      success: 'SUCCESSFUL',
      successful: 'SUCCESSFUL',
      processing: 'PROCESSING',
      pending: 'PENDING',
      failed: 'FAILED',
      failure: 'FAILED',
    };

    return statusMap[status?.toLowerCase()] ?? 'PENDING';
  }

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof ItecError) {
      return err.message;
    }
    if (err instanceof Error) {
      return err.message;
    }
    if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
      return err.message;
    }
    if (typeof err === 'string') {
      return err;
    }
    return fallback;
  }

  /**
   * Convert payment to card payment result
   */
  private toCardResult(
    payment: Omit<MobilePaymentWithMerchant, 'merchant'>,
    itecResponse?: ItecCardPaymentResponse,
  ): CardPaymentResult {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const metadata = (payment.metadata as Record<string, unknown> | null) ?? null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const checkoutUrl: string = itecResponse?.link || (metadata?.checkout_link as string) || '';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const validUntil: string = itecResponse?.valid_until || (metadata?.valid_until as string) || '';

    return {
      id: payment.id,
      ref: payment.ref,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      email: payment.phoneNumber, // Email is stored in phoneNumber field
      type: 'CARD' as const,
      status: payment.status,
      pcode: payment.ref,
      checkoutUrl,
      validUntil,
      provider: payment.provider || 'itec',
      createdAt: payment.createdAt.toISOString(),
    };
  }
}

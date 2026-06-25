import crypto from 'node:crypto';
import type { MobilePayment, MobilePaymentStatus, MobilePaymentType, Prisma } from '@prisma/client';
import { getPaypackHelper, PaypackError } from '../helpers/paypack.js';
import { MobilePaymentRepository } from '../repositories/mobile-payment.repository.js';
import { logger } from '../lib/logger.js';
import type {
  CashinRequestParams,
  CashoutRequestParams,
  MobilePaymentResult,
  MobilePaymentWithMerchant,
  AccountBalanceResult,
} from '../types/mobile-payment.js';

// Re-export types for consumers
export type { CashinRequestParams, CashoutRequestParams } from '../types/mobile-payment.js';
export { PaypackError } from '../helpers/paypack.js';

// ============================================================================
// Service
// ============================================================================

export class MobilePaymentService {
  private readonly mobilePaymentRepository: MobilePaymentRepository;

  constructor() {
    this.mobilePaymentRepository = new MobilePaymentRepository();
  }

  /**
   * Initiate a cashin (collect money from customer)
   */
  async cashin(params: CashinRequestParams): Promise<MobilePaymentResult> {
    const { merchant, orderId, amount, phoneNumber, customerName, description, metadata } = params;

    // Check for existing payment with same orderId (idempotency)
    const existing = await this.mobilePaymentRepository.findByMerchantAndOrder(merchant.id, orderId);
    if (existing) {
      logger.info({ paymentId: existing.id, ref: existing.ref }, 'Returning existing cashin payment');
      return this.toResult(existing);
    }

    // Initiate cashin via Paypack
    const paypack = getPaypackHelper();
    let paypackResponse;

    try {
      paypackResponse = await paypack.cashin({
        number: this.normalizePhone(phoneNumber),
        amount,
      });
    } catch (err) {
      const message = this.extractErrorMessage(err, 'Paypack cashin failed');
      logger.error({ err, phoneNumber, amount }, 'Paypack cashin error');
      throw new PaypackError(message);
    }

    // Create payment record
    const payment = await this.mobilePaymentRepository.create({
      merchantId: merchant.id,
      orderId,
      ref: paypackResponse.ref,
      amount: paypackResponse.amount,
      currency: 'RWF',
      phoneNumber: this.normalizePhone(phoneNumber),
      type: 'CASHIN',
      customerName,
      description,
      metadata: metadata as Prisma.InputJsonValue,
    });

    logger.info({ paymentId: payment.id, ref: payment.ref, amount }, 'Cashin initiated');

    return this.toResult(payment);
  }

  /**
   * Initiate a cashout (send money to recipient)
   */
  async cashout(params: CashoutRequestParams): Promise<MobilePaymentResult> {
    const { merchant, orderId, amount, phoneNumber, recipientName, description, metadata } = params;

    // Check for existing payment with same orderId (idempotency)
    const existing = await this.mobilePaymentRepository.findByMerchantAndOrder(merchant.id, orderId);
    if (existing) {
      logger.info({ paymentId: existing.id, ref: existing.ref }, 'Returning existing cashout payment');
      return this.toResult(existing);
    }

    // Initiate cashout via Paypack
    const paypack = getPaypackHelper();
    let paypackResponse;

    try {
      paypackResponse = await paypack.cashout({
        number: this.normalizePhone(phoneNumber),
        amount,
      });
    } catch (err) {
      const message = this.extractErrorMessage(err, 'Paypack cashout failed');
      logger.error({ err, phoneNumber, amount }, 'Paypack cashout error');
      throw new PaypackError(message);
    }

    // Create payment record
    const payment = await this.mobilePaymentRepository.create({
      merchantId: merchant.id,
      orderId,
      ref: paypackResponse.ref,
      amount: paypackResponse.amount,
      currency: 'RWF',
      phoneNumber: this.normalizePhone(phoneNumber),
      type: 'CASHOUT',
      customerName: recipientName,
      description,
      metadata: metadata as Prisma.InputJsonValue,
    });

    logger.info({ paymentId: payment.id, ref: payment.ref, amount }, 'Cashout initiated');

    return this.toResult(payment);
  }

  /**
   * Get payment by ID
   */
  async getPayment(id: string, merchantId: string): Promise<MobilePayment | null> {
    return this.mobilePaymentRepository.findByIdAndMerchant(id, merchantId);
  }

  /**
   * Get payment by reference
   */
  async getPaymentByRef(ref: string, merchantId: string): Promise<MobilePayment | null> {
    return this.mobilePaymentRepository.findByRefAndMerchant(ref, merchantId);
  }

  /**
   * List payments for a merchant
   */
  async listPayments(
    merchantId: string,
    page: number,
    limit: number,
    status?: MobilePaymentStatus,
    type?: MobilePaymentType,
  ) {
    return this.mobilePaymentRepository.listByMerchant(merchantId, page, limit, status, type);
  }

  /**
   * Get account balance and info
   */
  async getAccountInfo(): Promise<AccountBalanceResult> {
    const paypack = getPaypackHelper();

    try {
      const accountInfo = await paypack.getAccountInfo();

      return {
        balance: accountInfo.balance,
        currency: 'RWF',
        merchantName: accountInfo.name,
        inRate: accountInfo.in_rate,
        outRate: accountInfo.out_rate,
      };
    } catch (err) {
      const message = this.extractErrorMessage(err, 'Failed to get Paypack account info');
      logger.error({ err }, 'Paypack account info error');
      throw new PaypackError(message);
    }
  }

  /**
   * Get transaction status from Paypack
   */
  async getTransactionStatus(ref: string): Promise<{
    status: string;
    fee?: number;
    provider?: string;
  }> {
    const paypack = getPaypackHelper();

    try {
      const transaction = await paypack.findTransaction(ref);

      return {
        status: transaction.status,
        fee: transaction.fee,
        provider: transaction.provider,
      };
    } catch (err) {
      const message = this.extractErrorMessage(err, 'Failed to get transaction status');
      logger.error({ err, ref }, 'Paypack transaction status error');
      throw new PaypackError(message);
    }
  }

  /**
   * Process webhook event from Paypack
   */
  async processWebhook(event: {
    event_kind: string;
    data: {
      ref: string;
      status: string;
      fee?: number;
      provider?: string;
      amount?: number;
    };
  }): Promise<void> {
    const { event_kind, data } = event;

    logger.info({ eventKind: event_kind, ref: data.ref }, 'Processing Paypack webhook');

    const status = this.mapStatus(data.status);

    const payment = await this.mobilePaymentRepository.updateByRefWithMerchant(data.ref, {
      status,
      provider: data.provider,
      fee: data.fee,
      failureReason: status === 'FAILED' ? 'Transaction failed' : undefined,
    });

    if (!payment) {
      logger.warn({ ref: data.ref }, 'Payment not found for webhook');
      return;
    }

    // Notify merchant if webhook is configured
    if (payment.merchant.webhookUrl && payment.merchant.webhookSecret) {
      await this.notifyMerchant(payment, event_kind);
    }

    logger.info({ paymentId: payment.id, status }, 'Webhook processed');
  }

  /**
   * Notify merchant about payment status change
   */
  private async notifyMerchant(payment: MobilePaymentWithMerchant, eventType: string): Promise<void> {
    const { webhookUrl, webhookSecret } = payment.merchant;
    if (!webhookUrl || !webhookSecret) return;

    const payload = {
      event: eventType,
      merchantId: payment.merchantId,
      paymentId: payment.id,
      ref: payment.ref,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      phoneNumber: payment.phoneNumber,
      type: payment.type,
      status: payment.status,
      fee: payment.fee,
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
        logger.warn(
          { status: response.status, paymentId: payment.id },
          'Mobile webhook delivery returned non-OK status',
        );
      }
    } catch (err) {
      logger.warn({ err, paymentId: payment.id }, 'Mobile webhook delivery failed');
    }
  }

  /**
   * Normalize phone number to international format (250...)
   * Accepts: 250780478387, +250780478387, 0780478387, 780478387
   * Returns: 250780478387
   */
  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    // If starts with 250, keep as-is
    if (cleaned.startsWith('250') && cleaned.length === 12) {
      return cleaned;
    }

    // Remove leading 0 if present
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    // Add country code
    return '250' + cleaned;
  }

  /**
   * Map Paypack status to our status
   */
  private mapStatus(status: string): MobilePaymentStatus {
    const statusMap: Record<string, MobilePaymentStatus> = {
      pending: 'PENDING',
      processing: 'PROCESSING',
      successful: 'SUCCESSFUL',
      failed: 'FAILED',
    };

    return statusMap[status?.toLowerCase()] ?? 'PENDING';
  }

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof PaypackError) {
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
   * Convert payment to result
   */
  private toResult(payment: MobilePayment): MobilePaymentResult {
    return {
      id: payment.id,
      ref: payment.ref,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      phoneNumber: payment.phoneNumber,
      type: payment.type,
      status: payment.status,
      fee: payment.fee,
      provider: payment.provider ?? undefined,
      createdAt: payment.createdAt,
    };
  }
}

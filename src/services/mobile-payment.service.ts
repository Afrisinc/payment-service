import crypto from 'node:crypto';
import type { MobilePayment, MobilePaymentStatus, MobilePaymentType, Prisma } from '@prisma/client';
import { getPaypackHelper, PaypackError } from '../helpers/paypack.js';
import { getItecHelper, ItecError } from '../helpers/itec.js';
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
export type { CashinRequestParams, CashoutRequestParams, CardPaymentRequestParams } from '../types/mobile-payment.js';
export { PaypackError } from '../helpers/paypack.js';
export { ItecError } from '../helpers/itec.js';

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
   * PRODUCTION: Uses ITEC V2 API (recommended) with idempotency as primary provider
   * Falls back to Paypack if specified
   */
  async cashin(params: CashinRequestParams): Promise<MobilePaymentResult> {
    const { merchant, orderId, amount, phoneNumber, customerName, description, metadata, provider = 'itec' } = params;

    // Check for existing payment with same orderId (idempotency)
    const existing = await this.mobilePaymentRepository.findByMerchantAndOrder(merchant.id, orderId);
    if (existing) {
      logger.info({ paymentId: existing.id, ref: existing.ref }, 'Returning existing cashin payment');
      return this.toResult(existing);
    }

    const normalizedPhone = this.normalizePhone(phoneNumber);
    let transactionRef: string;
    let transactionAmount: number;
    let providerName: string;
    let requestRef: string | undefined;

    try {
      if (provider === 'paypack') {
        // Use Paypack provider
        const paypack = getPaypackHelper();
        const paypackResponse = await paypack.cashin({
          number: normalizedPhone,
          amount,
        });
        transactionRef = paypackResponse.ref;
        transactionAmount = paypackResponse.amount;
        providerName = 'paypack';
      } else {
        // Use ITEC V2 API as default (production-recommended)
        const itec = getItecHelper();
        requestRef = itec.generateRequestRef(); // Generate idempotent req_ref

        const itecResponse = await itec.requestPayment({
          amount,
          phone: normalizedPhone,
          reqRef: requestRef,
          note: description,
          message: `Payment for order ${orderId}`,
        });

        transactionRef = itecResponse.data.transaction_id;
        transactionAmount = Number.parseInt(itecResponse.data.amount, 10);
        providerName = 'itec';
      }
    } catch (err) {
      const message = this.extractErrorMessage(err, `${provider} cashin failed`);
      logger.error({ err, phoneNumber, amount, provider, orderId }, `${provider} cashin error`);
      if (err instanceof PaypackError) throw err;
      if (err instanceof ItecError) throw err;
      throw new Error(message);
    }

    // Create payment record with req_ref in metadata for ITEC status polling
    const paymentMetadata = {
      ...metadata,
      ...(requestRef && { req_ref: requestRef, payment_type: 'mobile_money' }),
    };

    const payment = await this.mobilePaymentRepository.create({
      merchantId: merchant.id,
      orderId,
      ref: transactionRef,
      amount: transactionAmount,
      currency: 'RWF',
      phoneNumber: normalizedPhone,
      type: 'CASHIN',
      customerName,
      description,
      metadata: paymentMetadata as Prisma.InputJsonValue,
      provider: providerName,
    });

    logger.info(
      { paymentId: payment.id, ref: payment.ref, amount, provider: providerName, requestRef },
      'Cashin initiated (ITEC V2 with idempotency)',
    );

    return this.toResult(payment);
  }

  /**
   * Initiate a cashout (send money to recipient)
   * PRODUCTION: Uses ITEC API for transfers/disbursements as primary provider
   * Falls back to Paypack if specified
   */
  async cashout(params: CashoutRequestParams): Promise<MobilePaymentResult> {
    const { merchant, orderId, amount, phoneNumber, recipientName, description, metadata, provider = 'itec' } = params;

    // Check for existing payment with same orderId (idempotency)
    const existing = await this.mobilePaymentRepository.findByMerchantAndOrder(merchant.id, orderId);
    if (existing) {
      logger.info({ paymentId: existing.id, ref: existing.ref }, 'Returning existing cashout payment');
      return this.toResult(existing);
    }

    const normalizedPhone = this.normalizePhone(phoneNumber);
    let transactionRef: string;
    let transactionAmount: number;
    let providerName: string;

    try {
      if (provider === 'paypack') {
        // Use Paypack provider
        const paypack = getPaypackHelper();
        const paypackResponse = await paypack.cashout({
          number: normalizedPhone,
          amount,
        });
        transactionRef = paypackResponse.ref;
        transactionAmount = paypackResponse.amount;
        providerName = 'paypack';
      } else {
        // Use ITEC API (transfer endpoint) as default provider
        const itec = getItecHelper();
        const itecResponse = await itec.requestCashout({
          amount,
          phone: normalizedPhone,
        });
        transactionRef = itecResponse.data.transaction_id;
        transactionAmount = Number.parseInt(itecResponse.data.amount, 10);
        providerName = 'itec';
      }
    } catch (err) {
      const message = this.extractErrorMessage(err, `${provider} cashout failed`);
      logger.error({ err, phoneNumber, amount, provider, orderId }, `${provider} cashout error`);
      if (err instanceof PaypackError) throw err;
      if (err instanceof ItecError) throw err;
      throw new Error(message);
    }

    // Create payment record
    const payment = await this.mobilePaymentRepository.create({
      merchantId: merchant.id,
      orderId,
      ref: transactionRef,
      amount: transactionAmount,
      currency: 'RWF',
      phoneNumber: normalizedPhone,
      type: 'CASHOUT',
      customerName: recipientName,
      description,
      metadata: {
        ...metadata,
        payment_type: 'mobile_money',
      } as Prisma.InputJsonValue,
      provider: providerName,
    });

    logger.info(
      { paymentId: payment.id, ref: payment.ref, amount, provider: providerName },
      'Cashout initiated (ITEC transfer)',
    );

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
   * Note: Only Paypack provides account info endpoint
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
   * Get transaction status (Production-Ready)
   * Supports both Paypack and ITEC V2 status checks
   * Returns normalized status: PENDING | PROCESSING | SUCCESSFUL | FAILED
   * AUTO-UPDATES database with current status from provider
   */
  async getTransactionStatus(
    ref: string,
    payment?: {
      provider?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<{
    status: string;
    fee?: number;
    provider?: string;
  }> {
    try {
      const provider = payment?.provider || 'unknown';

      // ITEC V2 status check (requires req_ref in metadata)
      if (provider === 'itec' && payment?.metadata && typeof payment.metadata === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const metadata = payment.metadata as Record<string, unknown>;
        const reqRef = metadata.req_ref;

        if (typeof reqRef === 'string') {
          const itec = getItecHelper();
          const statusCheck = await itec.checkStatus(reqRef);
          const mappedStatus = this.mapItecStatusToStandard(statusCheck.data.status);

          // UPDATE: Automatically update database with current status from provider
          await this.mobilePaymentRepository.updateByRef(ref, {
            status: mappedStatus,
            provider: 'itec',
          });
          logger.info({ ref, status: mappedStatus }, 'Mobile payment status updated via ITEC polling');

          return {
            status: mappedStatus,
            provider: 'itec',
          };
        }
      }

      // Fallback to Paypack for other providers
      const paypack = getPaypackHelper();
      const transaction = await paypack.findTransaction(ref);
      const mappedStatus = this.mapStatus(transaction.status);

      // UPDATE: Automatically update database with current status from Paypack
      await this.mobilePaymentRepository.updateByRef(ref, {
        status: mappedStatus,
        fee: transaction.fee,
        provider: 'paypack',
      });
      logger.info({ ref, status: mappedStatus }, 'Mobile payment status updated via Paypack polling');

      return {
        status: mappedStatus,
        fee: transaction.fee,
        provider: transaction.provider || 'paypack',
      };
    } catch (err) {
      const message = this.extractErrorMessage(err, 'Failed to get transaction status');
      logger.error({ err, ref, provider: payment?.provider }, 'Transaction status check error');
      if (err instanceof PaypackError) throw err;
      if (err instanceof ItecError) throw err;
      throw new Error(message);
    }
  }

  /**
   * Process webhook event from Paypack, ITEC, or PesaPal (Production-Ready)
   * Handles multiple provider webhook formats:
   * - Paypack: ref-based webhooks
   * - ITEC: transaction_id-based webhooks
   * - PesaPal (Card): PCODE-based webhooks
   */
  async processWebhook(event: {
    event_kind?: string;
    event_type?: string;
    PCODE?: string; // PesaPal card payment callback
    pcode?: string;
    data?: {
      ref?: string;
      transaction_id?: string;
      status?: string;
      fee?: number;
      provider?: string;
      amount?: number;
    };
    status?: string;
  }): Promise<void> {
    // Determine transaction reference from various webhook formats
    const transactionRef = event.data?.ref || event.data?.transaction_id || event.PCODE || event.pcode;
    const eventKind = event.event_kind || event.event_type || 'transaction:processed';
    const paymentStatus = event.data?.status || event.status;

    logger.info(
      { eventKind, ref: transactionRef, provider: event.data?.provider },
      'Processing payment webhook (Production)',
    );

    if (!transactionRef) {
      logger.warn({ event }, 'Webhook missing transaction reference - ignoring');
      return;
    }

    if (!paymentStatus) {
      logger.warn({ ref: transactionRef }, 'Webhook missing payment status - ignoring');
      return;
    }

    const status = this.mapStatus(paymentStatus);

    try {
      const payment = await this.mobilePaymentRepository.updateByRefWithMerchant(transactionRef, {
        status,
        provider: event.data?.provider,
        fee: event.data?.fee,
        failureReason: status === 'FAILED' ? 'Transaction failed via webhook' : undefined,
      });

      if (!payment) {
        logger.warn(
          { ref: transactionRef, eventKind },
          'Payment not found for webhook - may be card payment or processed earlier',
        );
        return;
      }

      logger.info({ paymentId: payment.id, status, provider: payment.provider }, 'Webhook processed successfully');

      // Notify merchant if webhook is configured
      if (payment.merchant.webhookUrl && payment.merchant.webhookSecret) {
        await this.notifyMerchant(payment, eventKind);
      }
    } catch (err) {
      logger.error({ err, ref: transactionRef, eventKind }, 'Error processing webhook');
      throw err;
    }
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
   * Map Paypack status to our standard status
   */
  private mapStatus(status: string): MobilePaymentStatus {
    const statusMap: Record<string, MobilePaymentStatus> = {
      pending: 'PENDING',
      processing: 'PROCESSING',
      successful: 'SUCCESSFUL',
      success: 'SUCCESSFUL',
      failed: 'FAILED',
    };

    return statusMap[status?.toLowerCase()] ?? 'PENDING';
  }

  /**
   * Map ITEC V2 status to our standard status
   * ITEC V2 returns: PENDING | SUCCESS | FAILED
   */
  private mapItecStatusToStandard(itecStatus: string): MobilePaymentStatus {
    const statusMap: Record<string, MobilePaymentStatus> = {
      pending: 'PENDING',
      processing: 'PROCESSING',
      successful: 'SUCCESSFUL',
      success: 'SUCCESSFUL',
      failed: 'FAILED',
    };

    return statusMap[itecStatus?.toLowerCase()] ?? 'PENDING';
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
      createdAt: payment.createdAt.toISOString(),
    };
  }
}

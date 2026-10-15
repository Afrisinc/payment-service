import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { MobilePayment, MobilePaymentStatus, MobilePaymentType } from '@prisma/client';
import { getPaypackHelper, PaypackError } from '../helpers/paypack.js';
import { getItecHelper, ItecError } from '../helpers/itec.js';
import {
  MobilePaymentRepository,
  InsufficientBalanceError,
  type MerchantLedger,
} from '../repositories/mobile-payment.repository.js';
import { logger } from '../lib/logger.js';
import { retry } from '../lib/retry.js';
import { merchantWebhookService } from './merchant-webhook.service.js';
import { ConflictError, HttpError } from '../utils/http-error.js';
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

/**
 * Placeholder ref for a payout reserved in the database before the provider returned its reference.
 * Replaced by the provider transaction reference once the transfer is accepted.
 */
const PENDING_REF_PREFIX = 'pending_';

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
          note: description?.substring(0, 50),
          message: orderId,
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
   * PRODUCTION: Uses ITEC transfer API as primary provider, Paypack if specified.
   *
   * Disbursements move real funds and the ITEC transfer API has no idempotency key, so the payout
   * is reserved in the database (unique merchantId + orderId) BEFORE the provider is called.
   * Concurrent or repeated requests for the same orderId therefore never disburse twice, and the
   * reservation is refused (422) when it exceeds the merchant's available ledger balance.
   */
  async cashout(params: CashoutRequestParams): Promise<MobilePaymentResult> {
    const { merchant, orderId, amount, phoneNumber, recipientName, description, metadata, provider = 'itec' } = params;

    const existing = await this.mobilePaymentRepository.findByMerchantAndOrder(merchant.id, orderId);
    if (existing) {
      return this.resolveExistingCashout(existing);
    }

    const normalizedPhone = this.normalizePhone(phoneNumber);
    const reservation = await this.reserveCashout({
      merchantId: merchant.id,
      orderId,
      ref: `${PENDING_REF_PREFIX}${randomUUID()}`,
      amount,
      currency: 'RWF',
      phoneNumber: normalizedPhone,
      type: 'CASHOUT',
      customerName: recipientName,
      description,
      metadata: {
        ...metadata,
        payment_type: 'mobile_money',
      } as Prisma.InputJsonValue,
      provider,
    });

    if (reservation.alreadyExists) {
      return this.resolveExistingCashout(reservation.payment);
    }

    let transactionRef: string;
    let transactionAmount: number;

    try {
      if (provider === 'paypack') {
        const paypack = getPaypackHelper();
        const paypackResponse = await paypack.cashout({
          number: normalizedPhone,
          amount,
        });
        transactionRef = paypackResponse.ref;
        transactionAmount = paypackResponse.amount;
      } else {
        const itec = getItecHelper();
        const itecResponse = await itec.requestCashout({
          amount,
          phone: normalizedPhone,
        });
        transactionRef = itecResponse.data.transaction_id;
        transactionAmount = Number.parseInt(itecResponse.data.amount, 10);
      }
    } catch (err) {
      await this.recordCashoutFailure(reservation.payment, err, provider);
      if (err instanceof PaypackError) throw err;
      if (err instanceof ItecError) throw err;
      throw new Error(this.extractErrorMessage(err, `${provider} cashout failed`));
    }

    let payment: MobilePayment;
    try {
      payment = await this.mobilePaymentRepository.updateById(reservation.payment.id, {
        ref: transactionRef,
        amount: Number.isFinite(transactionAmount) ? transactionAmount : amount,
      });
    } catch (err) {
      // Funds were disbursed but the reference could not be stored: needs manual reconciliation
      logger.error(
        { err, paymentId: reservation.payment.id, orderId, transactionRef, amount, provider },
        'CRITICAL: Cashout disbursed but provider reference not saved - reconcile manually',
      );
      throw err;
    }

    logger.info({ paymentId: payment.id, ref: payment.ref, amount, provider }, 'Cashout initiated');

    return this.toResult(payment);
  }

  /**
   * Get the merchant's mobile money ledger (collected, fees, paid out, reserved, available)
   */
  async getMerchantLedger(merchantId: string): Promise<MerchantLedger> {
    return this.mobilePaymentRepository.getLedger(merchantId);
  }

  /**
   * Insert the cashout record within the merchant balance,
   * detecting a concurrent request that reserved the same orderId first
   */
  private async reserveCashout(
    data: Parameters<MobilePaymentRepository['createCashoutWithinBalance']>[0],
  ): Promise<{ payment: MobilePayment; alreadyExists: boolean }> {
    try {
      return { payment: await this.mobilePaymentRepository.createCashoutWithinBalance(data), alreadyExists: false };
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        throw new HttpError(422, err.message);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const concurrent = await this.mobilePaymentRepository.findByMerchantAndOrder(data.merchantId, data.orderId);
        if (concurrent) return { payment: concurrent, alreadyExists: true };
      }
      throw err;
    }
  }

  /**
   * Idempotent replay: return the existing cashout, refusing orderIds already used by another payment type
   */
  private resolveExistingCashout(existing: MobilePayment): MobilePaymentResult {
    if (existing.type !== 'CASHOUT') {
      throw new ConflictError(`orderId '${existing.orderId}' is already used by a ${existing.type} payment`);
    }

    logger.info({ paymentId: existing.id, ref: existing.ref }, 'Returning existing cashout payment');
    return this.toResult(existing);
  }

  /**
   * Persist the outcome of a failed provider call on the reserved cashout.
   * A definitive rejection marks it FAILED; an unknown outcome keeps it PENDING and flags it for review,
   * because the provider may have disbursed the funds.
   */
  private async recordCashoutFailure(payment: MobilePayment, err: unknown, provider: string): Promise<void> {
    const reason = this.extractErrorMessage(err, `${provider} cashout failed`);
    const outcomeUnknown = err instanceof ItecError && err.outcomeUnknown;

    try {
      if (outcomeUnknown) {
        await this.mobilePaymentRepository.updateById(payment.id, {
          failureReason: `Provider outcome unknown - verify with ${provider} before retrying: ${reason}`,
          metadata: {
            ...(payment.metadata as Record<string, unknown> | null),
            requires_manual_review: true,
          } as Prisma.InputJsonValue,
        });
        logger.error(
          { err, paymentId: payment.id, orderId: payment.orderId, amount: payment.amount, provider },
          'Cashout outcome unknown - flagged for manual review',
        );
      } else {
        await this.mobilePaymentRepository.updateById(payment.id, { status: 'FAILED', failureReason: reason });
        logger.error(
          { err, paymentId: payment.id, orderId: payment.orderId, amount: payment.amount, provider },
          `${provider} cashout rejected`,
        );
      }
    } catch (updateErr) {
      logger.error(
        { err: updateErr, cause: err, paymentId: payment.id, orderId: payment.orderId },
        'Failed to record cashout failure',
      );
    }
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

  async getPaymentStatusByRef(
    ref: string,
    merchantId: string,
  ): Promise<{ status: string; fee?: number; provider?: string } | null> {
    const payment = await this.mobilePaymentRepository.findByRefAndMerchant(ref, merchantId);
    if (!payment) return null;

    return this.getTransactionStatus(payment.ref, {
      provider: payment.provider,
      metadata: payment.metadata as Record<string, unknown> | null,
      type: payment.type,
      status: payment.status,
      createdAt: payment.createdAt,
    });
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
      type?: MobilePaymentType;
      status?: MobilePaymentStatus;
      createdAt?: Date;
    },
  ): Promise<{
    status: string;
    fee?: number;
    provider?: string;
  }> {
    try {
      const provider = payment?.provider || 'unknown';

      // Reserved payout whose provider call never returned a reference: nothing to query
      if (ref.startsWith(PENDING_REF_PREFIX)) {
        return { status: payment?.status ?? 'PENDING', provider };
      }

      // ITEC transfers have no req_ref; their status is only available from the transfers report
      if (provider === 'itec' && payment?.type === 'CASHOUT') {
        return await this.getItecTransferStatus(ref, payment.createdAt ?? new Date(), payment.status);
      }

      // ITEC V2 status check (requires req_ref in metadata)
      if (provider === 'itec' && payment?.metadata && typeof payment.metadata === 'object') {
        const metadata = payment.metadata as Record<string, unknown>;
        const reqRef = metadata.req_ref;

        if (typeof reqRef === 'string') {
          const itec = getItecHelper();
          const statusCheck = await retry(() => itec.checkStatus(reqRef), 3, 'ITEC status check');
          const mappedStatus = this.mapItecStatusToStandard(statusCheck.data.status);

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

      // Never query Paypack with an ITEC transaction id
      if (provider === 'itec') {
        throw new ItecError('Cannot verify ITEC payment status: req_ref missing from payment metadata', 422);
      }

      // Fallback to Paypack for other providers
      const paypack = getPaypackHelper();
      const transaction = await retry(() => paypack.findTransaction(ref), 3, 'Paypack transaction lookup');
      const mappedStatus = this.mapStatus(transaction.status);

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
   * Resolve an ITEC cashout status from the transfers report.
   * Leaves the record untouched while ITEC has not reported the transfer yet.
   */
  private async getItecTransferStatus(
    ref: string,
    initiatedAt: Date,
    currentStatus?: MobilePaymentStatus,
  ): Promise<{ status: string; provider: string }> {
    const itec = getItecHelper();
    const transfer = await retry(() => itec.findTransfer(ref, initiatedAt), 3, 'ITEC transfer lookup');

    if (!transfer) {
      logger.info({ ref }, 'ITEC transfer not yet in report');
      return { status: currentStatus ?? 'PENDING', provider: 'itec' };
    }

    const mappedStatus = this.mapItecStatusToStandard(transfer.status);
    await this.mobilePaymentRepository.updateByRef(ref, {
      status: mappedStatus,
      provider: 'itec',
      failureReason: mappedStatus === 'FAILED' ? 'Transfer failed (ITEC transfers report)' : undefined,
    });
    logger.info({ ref, status: mappedStatus }, 'Cashout status updated via ITEC transfers report');

    return { status: mappedStatus, provider: 'itec' };
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
    transID?: string; // ITEC top-level transaction ID
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
    const transactionRef = event.data?.ref || event.data?.transaction_id || event.transID || event.PCODE || event.pcode;
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

      await this.notifyMerchantWebhook(payment, status);
    } catch (err) {
      logger.error({ err, ref: transactionRef, eventKind }, 'Error processing webhook');
      throw err;
    }
  }

  private async notifyMerchantWebhook(payment: MobilePaymentWithMerchant, status: MobilePaymentStatus): Promise<void> {
    try {
      const eventTypeMap: Record<MobilePaymentStatus, 'payment.succeeded' | 'payment.failed'> = {
        SUCCESSFUL: 'payment.succeeded',
        FAILED: 'payment.failed',
        PROCESSING: 'payment.succeeded',
        PENDING: 'payment.succeeded',
      };

      const statusMap: Record<MobilePaymentStatus, 'SUCCEEDED' | 'FAILED' | 'PENDING'> = {
        SUCCESSFUL: 'SUCCEEDED',
        FAILED: 'FAILED',
        PROCESSING: 'PENDING',
        PENDING: 'PENDING',
      };

      const eventType = eventTypeMap[status];
      const mappedStatus = statusMap[status];

      const adaptedPayment = {
        id: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        status: mappedStatus,
        metadata: payment.metadata,
        merchant: payment.merchant,
      } as Parameters<typeof merchantWebhookService.notifyPaymentEvent>[0];

      await merchantWebhookService.notifyPaymentEvent(adaptedPayment, eventType);
    } catch (err) {
      logger.error({ err, paymentId: payment.id }, 'Failed to queue merchant webhook notification');
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

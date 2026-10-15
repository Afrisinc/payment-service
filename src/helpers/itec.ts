import { randomUUID } from 'node:crypto';
import { AxiosInstance, isAxiosError } from 'axios';
import requestHelper from '../utils/requestHelper.js';
import { removeCountryCode } from '../utils/phone.js';
import type {
  ItecConfig,
  ItecPaymentRequest,
  ItecPaymentResponse,
  ItecStatusCheckResponse,
  ItecCashoutRequest,
  ItecCashoutResponse,
  ItecReportRequest,
  ItecReportResponse,
  ItecReportEntry,
  ItecV1PaymentRequest,
  ItecV1PaymentResponse,
  ItecCardPaymentRequest,
  ItecCardPaymentResponse,
} from '../types/index.js';
import { env } from '../config/env.js';

/** Timeout for disbursement requests; without it a hung ITEC call would block the request indefinitely */
const TRANSFER_TIMEOUT_MS = 30_000;

/** ITEC report timestamps are expressed in Rwanda local time (CAT, UTC+2, no DST) */
const RWANDA_UTC_OFFSET_MS = 2 * 60 * 60 * 1000;

/** Margin added on both sides of the report window to absorb clock and timezone drift */
const REPORT_WINDOW_MARGIN_MS = 24 * 60 * 60 * 1000;

export class ItecError extends Error {
  /**
   * @param outcomeUnknown true when ITEC may have processed the request even though we got no
   *   definitive answer (timeout, network failure, 5xx). Callers must not assume nothing happened.
   */
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly outcomeUnknown: boolean = false,
  ) {
    super(message);
    this.name = 'ItecError';
    Object.setPrototypeOf(this, ItecError.prototype);
  }
}

export class ItecHelper {
  private readonly api: AxiosInstance;
  private readonly apiKey: string; // Default/fallback API key
  private readonly mtnKey: string; // MTN Mobile Money specific key
  private readonly airtelKey: string; // Airtel Money specific key
  private readonly cardApiKey: string; // Card payment specific key
  private readonly baseUrl: string;

  constructor(config: ItecConfig) {
    this.apiKey = config.apiKey;
    this.mtnKey = config.mtnKey || config.apiKey; // Fall back to default if not specified
    this.airtelKey = config.airtelKey || config.apiKey; // Fall back to default if not specified
    this.cardApiKey = config.cardApiKey || config.apiKey; // Fall back to default if not specified
    this.baseUrl = config.baseUrl;
    this.api = requestHelper(config.baseUrl);
  }

  /**
   * Detect mobile money provider based on Rwanda phone number prefix
   * MTN: 25078, 25079 (or 078, 079)
   * Airtel: 25072, 25073 (or 072, 073)
   */
  private detectProviderFromPhone(phone: string): 'mtn' | 'airtel' {
    const normalized = this.normalizePhone(phone);

    // MTN prefixes: 25078, 25079
    if (normalized.startsWith('25078') || normalized.startsWith('25079')) {
      return 'mtn';
    }

    // Airtel prefixes: 25072, 25073
    if (normalized.startsWith('25072') || normalized.startsWith('25073')) {
      return 'airtel';
    }

    // Default to MTN if prefix doesn't match
    return 'mtn';
  }

  /**
   * Get appropriate API key for the payment method/provider
   */
  private getApiKeyForMethod(method: 'mtn' | 'airtel' | 'card' | 'default' = 'default'): string {
    switch (method) {
      case 'mtn':
        return this.mtnKey;
      case 'airtel':
        return this.airtelKey;
      case 'card':
        return this.cardApiKey;
      default:
        return this.apiKey;
    }
  }

  /**
   * PRODUCTION RECOMMENDED: V2 Mobile Money Payment with Idempotency
   * Uses req_ref for idempotent payments - safe to retry without duplicate charges
   * Auto-detects provider (MTN or Airtel) based on Rwanda phone number prefix if not specified
   * Uses provider-specific API key if configured
   */
  async requestPayment(params: ItecPaymentRequest): Promise<ItecPaymentResponse> {
    try {
      const normalizedPhone = this.normalizePhone(params.phone);

      // Auto-detect provider from phone number if not explicitly specified
      const provider = params.provider || this.detectProviderFromPhone(normalizedPhone);

      const payload = {
        amount: params.amount,
        phone: removeCountryCode(params.phone),
        key: this.getApiKeyForMethod(provider),
        req_ref: params.reqRef,
        ...(env.WEBHOOK_URL && { callback_url: env.WEBHOOK_URL }),
        ...(params.note && { note: params.note }),
        ...(params.message && { message: params.message }),
      };

      console.log('[ITEC Payment Request]', {
        provider,
        normalizedPhone,
        phoneAfterRemoval: removeCountryCode(params.phone),
        endpoint: `${this.baseUrl}/api2/pay`,
        payload: { ...payload, key: '***REDACTED***' },
      });

      const response = await this.api.post<ItecPaymentResponse>(`${this.baseUrl}/api2/pay`, payload);

      if (response.data.status !== 200) {
        const errorMsg = (response.data as unknown as Record<string, unknown>)?.message as string | undefined;
        const details = errorMsg ? `: ${errorMsg}` : '';
        const itecResponse = JSON.stringify(response.data);
        throw new ItecError(`Payment request failed${details} | ITEC: ${itecResponse}`, response.data.status);
      }

      return response.data;
    } catch (error) {
      if (error instanceof ItecError) throw error;
      const message = this.getErrorMessage(error);
      throw new ItecError(`V2 Payment request failed: ${message}`, 500);
    }
  }

  /**
   * Generate idempotent request reference for V2 payments
   * @returns UUID for use as req_ref in V2 API calls
   */
  generateRequestRef(): string {
    return randomUUID();
  }

  /**
   * Check payment status using V2 API (Production-Ready)
   * Use req_ref from the initial payment request
   * Uses Mobile Money specific API key if configured
   * Returns: PENDING | SUCCESS | FAILED
   */
  async checkStatus(reqRef: string): Promise<ItecStatusCheckResponse> {
    try {
      if (!reqRef || typeof reqRef !== 'string') {
        throw new ItecError('Invalid req_ref: must be a non-empty string', 400);
      }

      const payload = {
        action: 'status_check',
        req_ref: reqRef,
        key: this.getApiKeyForMethod('default'), // Use default/fallback API key
      };

      const response = await this.api.post<ItecStatusCheckResponse>(`${this.baseUrl}/api2/verify`, payload);

      if (response.data.status !== 200) {
        throw new ItecError(
          `Status check failed: ${response.data.data?.status || 'Unknown error'}`,
          response.data.status,
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof ItecError) throw error;
      throw new ItecError(`V2 Status check failed: ${this.getErrorMessage(error)}`, 500);
    }
  }

  /**
   * Disburse funds to a mobile money wallet via ITEC transfer API.
   * The transfer endpoint has no idempotency key, so callers must guarantee a single call per payout.
   * Throws ItecError with outcomeUnknown=true when the transfer may have gone through without a definitive response.
   */
  async requestCashout(params: ItecCashoutRequest): Promise<ItecCashoutResponse> {
    const normalizedPhone = this.normalizePhone(params.phone);
    const provider = this.detectProviderFromPhone(normalizedPhone);

    const payload = {
      amount: params.amount,
      phone: removeCountryCode(normalizedPhone),
      key: this.getApiKeyForMethod(provider),
    };

    console.log('[ITEC Cashout Request]', {
      provider,
      normalizedPhone,
      endpoint: `${this.baseUrl}/api/transfer`,
      payload: { ...payload, key: '***REDACTED***' },
    });

    let response;
    try {
      response = await this.api.post<ItecCashoutResponse>(`${this.baseUrl}/api/transfer`, payload, {
        timeout: TRANSFER_TIMEOUT_MS,
      });
    } catch (error) {
      const httpStatus = isAxiosError(error) ? error.response?.status : undefined;
      // No response or a server-side failure: ITEC may still have executed the transfer
      const outcomeUnknown = httpStatus === undefined || httpStatus >= 500;
      throw new ItecError(
        `Cashout request failed: ${this.getErrorMessage(error)}`,
        outcomeUnknown ? 502 : httpStatus,
        outcomeUnknown,
      );
    }

    if (response.data.status !== 200) {
      const errorMsg = (response.data as unknown as Record<string, unknown>)?.message as string | undefined;
      const details = errorMsg ? `: ${errorMsg}` : '';
      throw new ItecError(
        `Cashout request rejected${details} | ITEC: ${JSON.stringify(response.data)}`,
        response.data.status || 502,
      );
    }

    if (!response.data.data?.transaction_id) {
      // Accepted by ITEC but untraceable: the funds may have moved
      throw new ItecError(
        `Cashout accepted without transaction_id | ITEC: ${JSON.stringify(response.data)}`,
        502,
        true,
      );
    }

    return response.data;
  }

  /**
   * Look up a transfer (cashout) in the ITEC transfers report.
   * The transfer API returns no req_ref, so /api2/verify cannot be used for disbursements.
   * @param transactionId transaction_id returned by requestCashout
   * @param initiatedAt when the transfer was initiated, used to bound the report window
   * @returns the report entry, or null if ITEC has not reported the transfer yet
   */
  async findTransfer(transactionId: string, initiatedAt: Date): Promise<ItecReportEntry | null> {
    const report = await this.getReport({
      report: 'transfers',
      start: this.toReportTimestamp(new Date(initiatedAt.getTime() - REPORT_WINDOW_MARGIN_MS)),
      end: this.toReportTimestamp(new Date(Date.now() + REPORT_WINDOW_MARGIN_MS)),
    });

    return (report.data ?? []).find((entry) => entry.transaction_id === transactionId) ?? null;
  }

  /**
   * Format a date as ITEC report timestamp (YYYYMMDDHHmmss, Rwanda local time)
   */
  private toReportTimestamp(date: Date): number {
    const iso = new Date(date.getTime() + RWANDA_UTC_OFFSET_MS).toISOString(); // 2025-01-10T15:30:45.000Z
    return Number(iso.slice(0, 19).replace(/\D/g, ''));
  }

  async getReport(params: ItecReportRequest): Promise<ItecReportResponse> {
    try {
      const payload = {
        key: this.apiKey,
        start: params.start,
        end: params.end,
        report: params.report,
      };

      const response = await this.api.post<ItecReportResponse>(`${this.baseUrl}/api/report`, payload);

      if (response.data.status !== 200) {
        throw new ItecError('Report request failed', response.data.status);
      }

      return response.data;
    } catch (error) {
      if (error instanceof ItecError) throw error;
      throw new ItecError(`Report request failed: ${this.getErrorMessage(error)}`, 500);
    }
  }

  // ============================================================================
  // V1 API Methods (MoMo, SPENN, Airtel, Cards via PesaPal)
  // ============================================================================

  async requestPaymentV1(params: ItecV1PaymentRequest): Promise<ItecV1PaymentResponse> {
    try {
      const payload = {
        amount: params.amount,
        phone: this.normalizePhone(params.phone),
        key: this.apiKey,
      };

      const response = await this.api.post<ItecV1PaymentResponse>(`${this.baseUrl}/api/pay`, payload);

      if (response.data.status !== 200) {
        throw new ItecError('V1 Payment request failed', response.data.status);
      }

      return response.data;
    } catch (error) {
      if (error instanceof ItecError) throw error;
      throw new ItecError(`V1 Payment request failed: ${this.getErrorMessage(error)}`, 500);
    }
  }

  async generateCardPaymentCode(params: ItecCardPaymentRequest): Promise<ItecCardPaymentResponse> {
    try {
      const payload = {
        amount: params.amount,
        email: params.email,
        key: this.getApiKeyForMethod('card'), // Use Card payment specific key
      };

      console.log('[ITEC Card Payment Request]', {
        endpoint: `${this.baseUrl}/api/pay/apis/pesapal/generatecode`,
        payload: { ...payload, key: '***REDACTED***' },
      });

      const response = await this.api.post<ItecCardPaymentResponse>(
        `${this.baseUrl}/api/pay/apis/pesapal/generatecode`,
        payload,
      );

      if (response.data.status !== 200) {
        const errorMsg = (response.data as unknown as Record<string, unknown>)?.message as string | undefined;
        const details = errorMsg ? `: ${errorMsg}` : '';
        throw new ItecError(
          `Card payment code generation failed (Status: ${response.data.status})${details}`,
          response.data.status,
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof ItecError) throw error;
      throw new ItecError(`Card payment code generation failed: ${this.getErrorMessage(error)}`, 500);
    }
  }

  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('250') && cleaned.length === 12) {
      return cleaned;
    }

    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    return '250' + cleaned;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }
}

let itecInstance: ItecHelper | null = null;

export function getItecHelper(): ItecHelper {
  if (!itecInstance) {
    if (!env.ITEC_API_KEY) {
      throw new ItecError('ITEC_API_KEY is not configured in environment variables', 500);
    }
    itecInstance = new ItecHelper({
      apiKey: env.ITEC_API_KEY, // Default/fallback API key for all methods
      mtnKey: env.ITEC_MTN_KEY, // Optional: MTN Mobile Money specific key
      airtelKey: env.ITEC_AIRTEL_KEY, // Optional: Airtel Money specific key
      cardApiKey: env.ITEC_CARD_API_KEY, // Optional: Card payment specific key
      baseUrl: env.ITEC_BASE_URL,
    });
  }
  return itecInstance;
}

import { randomUUID } from 'node:crypto';
import { AxiosInstance } from 'axios';
import requestHelper from '../utils/requestHelper.js';
import type {
  ItecConfig,
  ItecPaymentRequest,
  ItecPaymentResponse,
  ItecStatusCheckResponse,
  ItecCashoutRequest,
  ItecCashoutResponse,
  ItecReportRequest,
  ItecReportResponse,
  ItecV1PaymentRequest,
  ItecV1PaymentResponse,
  ItecCardPaymentRequest,
  ItecCardPaymentResponse,
} from '../types/index.js';
import { env } from '../config/env.js';

export class ItecError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
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
        phone: normalizedPhone,
        key: this.getApiKeyForMethod(provider), // Use provider-specific key (mtn or airtel)
        req_ref: params.reqRef,
        ...(params.note && { note: params.note }),
        ...(params.message && { message: params.message }),
      };

      const response = await this.api.post<ItecPaymentResponse>(`${this.baseUrl}/api2/pay`, payload);

      if (response.data.status !== 200) {
        throw new ItecError(response.data.data?.status || 'Payment request failed', response.data.status);
      }

      return response.data;
    } catch (error) {
      if (error instanceof ItecError) throw error;
      throw new ItecError(`V2 Payment request failed: ${this.getErrorMessage(error)}`, 500);
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

  async requestCashout(params: ItecCashoutRequest): Promise<ItecCashoutResponse> {
    try {
      const normalizedPhone = this.normalizePhone(params.phone);

      // Auto-detect provider from phone number for cashout
      const provider = this.detectProviderFromPhone(normalizedPhone);

      const payload = {
        amount: params.amount,
        phone: normalizedPhone,
        key: this.getApiKeyForMethod(provider), // Use provider-specific key (mtn or airtel)
      };

      const response = await this.api.post<ItecCashoutResponse>(`${this.baseUrl}/api/transfer`, payload);

      if (response.data.status !== 200) {
        throw new ItecError('Cashout request failed', response.data.status);
      }

      return response.data;
    } catch (error) {
      if (error instanceof ItecError) throw error;
      throw new ItecError(`Cashout request failed: ${this.getErrorMessage(error)}`, 500);
    }
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

      const response = await this.api.post<ItecCardPaymentResponse>(
        `${this.baseUrl}/api/pay/apis/pesapal/generatecode`,
        payload,
      );

      if (response.data.status !== 200) {
        throw new ItecError('Card payment code generation failed', response.data.status);
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

import { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env.js';
import requestHelper from '../utils/requestHelper.js';
import { logger } from '../lib/logger.js';
import type {
  PaypackAuthResponse,
  PaypackTransactionRequest,
  PaypackTransactionResponse,
  PaypackTransactionDetails,
  PaypackAccountInfo,
  PaypackEventsResponse,
  PaypackEventsQuery,
} from '../types/paypack.js';

// ============================================================================
// Paypack Helper Class
// ============================================================================

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // Refresh 1 minute before expiry

export class PaypackHelper {
  private readonly api: AxiosInstance;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null;

  constructor() {
    this.clientId = env.PAYPACK_CLIENT_ID;
    this.clientSecret = env.PAYPACK_CLIENT_SECRET;
    this.api = requestHelper(`${env.PAYPACK_API_BASE_URL}/api`);
  }

  // --------------------------------------------------------------------------
  // Authentication
  // --------------------------------------------------------------------------

  /**
   * Authenticate with Paypack API
   */
  async authenticate(): Promise<void> {
    logger.info('Authenticating with Paypack...');

    try {
      const response = await this.api.post<PaypackAuthResponse>('/auth/agents/authorize', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      this.setTokens(response.data);
      logger.info('Paypack authentication successful');
    } catch (error) {
      logger.error({ error }, 'Paypack authentication failed');
      throw this.handleError(error, 'Authentication failed');
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new PaypackError('No refresh token available', 401);
    }

    logger.info('Refreshing Paypack access token...');

    try {
      const response = await this.api.get<PaypackAuthResponse>(`/auth/agents/refresh/${this.refreshToken}`);

      this.setTokens(response.data);
      logger.info('Paypack token refresh successful');
    } catch (error) {
      logger.error({ error }, 'Paypack token refresh failed');
      // If refresh fails, try full re-authentication
      await this.authenticate();
    }
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<string> {
    // No token - authenticate
    if (!this.accessToken || !this.tokenExpiresAt) {
      await this.authenticate();
      if (!this.accessToken) {
        throw new PaypackError('Authentication failed - no access token received', 401);
      }
      return this.accessToken;
    }

    // Token expired or about to expire - refresh
    const now = Date.now();
    if (now >= this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      await this.refreshAccessToken();
    }

    if (!this.accessToken) {
      throw new PaypackError('Token refresh failed - no access token available', 401);
    }

    return this.accessToken;
  }

  /**
   * Set tokens from auth response
   */
  private setTokens(authResponse: PaypackAuthResponse): void {
    this.accessToken = authResponse.access;
    this.refreshToken = authResponse.refresh;

    // Parse expiry - could be timestamp (seconds) or ISO date string
    const expires = authResponse.expires;
    if (/^\d+$/.test(expires)) {
      // Unix timestamp in seconds
      this.tokenExpiresAt = Number.parseInt(expires, 10) * 1000;
    } else {
      // ISO date string
      this.tokenExpiresAt = new Date(expires).getTime();
    }

    logger.debug({ expiresAt: new Date(this.tokenExpiresAt).toISOString() }, 'Token expiry set');
  }

  /**
   * Get authorization headers
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.ensureAuthenticated();
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  // --------------------------------------------------------------------------
  // Transactions
  // --------------------------------------------------------------------------

  /**
   * Initiate a cashin (collect payment from customer)
   */
  async cashin(params: PaypackTransactionRequest): Promise<PaypackTransactionResponse> {
    logger.info({ amount: params.amount, number: params.number }, 'Initiating Paypack cashin');

    try {
      const headers = await this.getAuthHeaders();
      const response = await this.api.post<PaypackTransactionResponse>(
        '/transactions/cashin',
        {
          amount: params.amount,
          number: params.number,
        },
        { headers },
      );

      logger.info({ ref: response.data.ref }, 'Paypack cashin initiated');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Cashin failed');
    }
  }

  /**
   * Initiate a cashout (send payment to customer)
   */
  async cashout(params: PaypackTransactionRequest): Promise<PaypackTransactionResponse> {
    logger.info({ amount: params.amount, number: params.number }, 'Initiating Paypack cashout');

    try {
      const headers = await this.getAuthHeaders();
      const response = await this.api.post<PaypackTransactionResponse>(
        '/transactions/cashout',
        {
          amount: params.amount,
          number: params.number,
        },
        { headers },
      );

      logger.info({ ref: response.data.ref }, 'Paypack cashout initiated');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Cashout failed');
    }
  }

  /**
   * Find a transaction by reference
   */
  async findTransaction(ref: string): Promise<PaypackTransactionDetails> {
    logger.info({ ref }, 'Finding Paypack transaction');

    try {
      const headers = await this.getAuthHeaders();
      const response = await this.api.get<PaypackTransactionDetails>(`/transactions/find/${ref}`, { headers });

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Find transaction failed');
    }
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  /**
   * List transaction events with optional filters
   */
  async listEvents(query?: PaypackEventsQuery): Promise<PaypackEventsResponse> {
    logger.info({ query }, 'Listing Paypack events');

    try {
      const headers = await this.getAuthHeaders();

      // Build query params
      const params = new URLSearchParams();
      if (query?.ref) params.append('ref', query.ref);
      if (query?.kind) params.append('kind', query.kind);
      if (query?.client) params.append('client', query.client);
      if (query?.status) params.append('status', query.status);
      if (query?.offset !== undefined) params.append('offset', query.offset.toString());
      if (query?.limit !== undefined) params.append('limit', query.limit.toString());

      const queryString = params.toString();
      const path = `/events/transactions${queryString ? `?${queryString}` : ''}`;

      const response = await this.api.get<PaypackEventsResponse>(path, { headers });

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'List events failed');
    }
  }

  // --------------------------------------------------------------------------
  // Account
  // --------------------------------------------------------------------------

  /**
   * Get account information (balance, rates, etc.)
   */
  async getAccountInfo(): Promise<PaypackAccountInfo> {
    logger.info('Getting Paypack account info');

    try {
      const headers = await this.getAuthHeaders();
      const response = await this.api.get<PaypackAccountInfo>('/merchants/me', { headers });

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Get account info failed');
    }
  }

  // --------------------------------------------------------------------------
  // Error Handling
  // --------------------------------------------------------------------------

  /**
   * Handle and wrap errors
   */
  private handleError(error: unknown, defaultMessage: string): PaypackError {
    if (error instanceof PaypackError) {
      return error;
    }

    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data as { message?: string } | undefined;
      const message = data?.message ?? error.message ?? defaultMessage;

      return new PaypackError(message, status, data);
    }

    if (error instanceof Error) {
      return new PaypackError(error.message);
    }

    return new PaypackError(defaultMessage);
  }
}

// ============================================================================
// Error Class
// ============================================================================

export class PaypackError extends Error {
  status?: number;
  data?: unknown;

  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'PaypackError';
    this.status = status;
    this.data = data;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let paypackHelperInstance: PaypackHelper | null = null;

export function getPaypackHelper(): PaypackHelper {
  if (!paypackHelperInstance) {
    paypackHelperInstance = new PaypackHelper();
  }
  return paypackHelperInstance;
}

// Default export
export default PaypackHelper;

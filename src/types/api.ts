/**
 * API Request/Response Types
 * Types for HTTP request bodies, URL params, and query strings
 */
import type { PaymentStatus } from '@prisma/client';

// ============================================================================
// Payment API Types
// ============================================================================

/** Request body for creating a checkout session */
export interface CreateCheckoutBody {
  amount: number;
  currency: string;
  orderId: string;
  customerEmail: string;
  successUrl?: string;
  cancelUrl?: string;
}

/** Request body for creating a payment intent */
export interface CreateIntentBody {
  amount: number;
  currency: string;
  orderId: string;
  customerEmail: string;
  metadata?: Record<string, string>;
}

/** Request body for refunding a payment */
export interface RefundBody {
  amount?: number;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

/** URL parameters for payment routes */
export interface PaymentParams {
  id: string;
}

/** Query string parameters for listing payments */
export interface ListPaymentsQuery {
  page?: number;
  limit?: number;
  status?: PaymentStatus;
}

// ============================================================================
// Merchant API Types
// ============================================================================

/** Request body for creating a merchant */
export interface CreateMerchantBody {
  name: string;
  email: string;
  defaultFeePercent?: number;
}

/** URL parameters for merchant routes */
export interface MerchantParams {
  id: string;
}

/** Request body for configuring merchant webhook */
export interface ConfigureWebhookBody {
  webhookUrl: string;
}

// ============================================================================
// Common API Types
// ============================================================================

/** Standard paginated response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Standard error response */
export interface ErrorResponse {
  error: string;
  statusCode?: number;
}

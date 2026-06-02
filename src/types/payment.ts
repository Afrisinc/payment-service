/**
 * Payment Domain Types
 * Types for payment service and repository operations
 */
import type { Merchant, Payment, PaymentType, Prisma } from '@prisma/client';

// ============================================================================
// Service Layer Types
// ============================================================================

/** Parameters for creating a checkout session */
export interface CreateCheckoutParams {
  merchant: Merchant;
  amount: number;
  currency: string;
  orderId: string;
  customerEmail: string;
  successUrl?: string;
  cancelUrl?: string;
}

/** Parameters for creating a payment intent */
export interface CreateIntentParams {
  merchant: Merchant;
  amount: number;
  currency: string;
  orderId: string;
  customerEmail: string;
  metadata?: Record<string, string>;
}

/** Parameters for refunding a payment */
export interface RefundParams {
  payment: Payment;
  amount?: number;
  reason?: string;
}

/** Result of creating a checkout session */
export interface CheckoutResult {
  paymentId: string;
  checkoutUrl: string;
  sessionId: string;
  status: string;
  /** True if returning an existing session (idempotent) */
  idempotent: boolean;
}

/** Result of creating a payment intent */
export interface IntentResult {
  paymentId: string;
  clientSecret: string;
  intentId: string;
  status: string;
  /** True if returning an existing intent (idempotent) */
  idempotent: boolean;
}

/** Result of a refund operation */
export interface RefundResult {
  refundId: string;
  status: string;
  amount: number;
}

// ============================================================================
// Repository Layer Types
// ============================================================================

/** Data for creating a payment with fee */
export interface CreatePaymentData {
  merchantId: string;
  orderId: string;
  amount: number;
  currency: string;
  type: PaymentType;
  feeAmount: number;
  feePercent: number;
  stripeSessionId?: string;
  stripeIntentId?: string;
  metadata?: Prisma.InputJsonValue;
}

/** Paginated payment list result */
export interface PaymentPage {
  items: Payment[];
  total: number;
}

// ============================================================================
// Notification Types
// ============================================================================

/** Data for payment notification to external service */
export interface PaymentNotification {
  merchantId: string;
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  status: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Utility Types
// ============================================================================

/** Payment metadata stored as JSON */
export type PaymentMetadata = Record<string, string> | null;

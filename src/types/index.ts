/**
 * Type Definitions
 *
 * This module exports all application types organized by domain:
 * - api.ts: HTTP request/response types (bodies, params, query strings)
 * - payment.ts: Payment service and repository types
 * - merchant.ts: Merchant service and repository types
 * - fastify.d.ts: Fastify module augmentations (auto-loaded)
 */

// Re-export Prisma types that are commonly used
export type { Merchant, Payment, Fee, WebhookEvent, PaymentStatus, PaymentType } from '@prisma/client';

// API Types
export type {
  CreateCheckoutBody,
  CreateIntentBody,
  RefundBody,
  PaymentParams,
  ListPaymentsQuery,
  CreateMerchantBody,
  MerchantParams,
  ConfigureWebhookBody,
  PaginatedResponse,
  ErrorResponse,
} from './api.js';

// Payment Domain Types
export type {
  CreateCheckoutParams,
  CreateIntentParams,
  RefundParams,
  CheckoutResult,
  IntentResult,
  RefundResult,
  CreatePaymentData,
  PaymentPage,
  PaymentNotification,
  PaymentMetadata,
} from './payment.js';

// Merchant Domain Types
export type { CreateMerchantParams, CreateMerchantResult, RotateApiKeyResult, CreateMerchantData } from './merchant.js';

// Mobile Payment Domain Types
export type {
  CashinParams,
  CashoutParams,
  CashinRequestParams,
  CashoutRequestParams,
  MobilePaymentResult,
  MobilePaymentPage,
  MobilePaymentRecord,
  MobilePaymentWithMerchant,
  TransactionStatusResult,
  AccountBalanceResult,
} from './mobile-payment.js';

// Paypack API Types
export type {
  PaypackConfig,
  PaypackAuthResponse,
  PaypackTransactionRequest,
  PaypackTransactionResponse,
  PaypackTransactionDetails,
  PaypackAccountInfo,
  PaypackEventData,
  PaypackEvent,
  PaypackEventsResponse,
  PaypackEventsQuery,
} from './paypack.js';

// ITEC API Types
export type {
  ItecConfig,
  ItecPaymentRequest,
  ItecPaymentResponse,
  ItecStatusCheckRequest,
  ItecStatusCheckResponse,
  ItecCashoutRequest,
  ItecCashoutResponse,
  ItecReportRequest,
  ItecReportResponse,
  ItecCallbackPayload,
  ItecV1PaymentRequest,
  ItecV1PaymentResponse,
  ItecCardPaymentRequest,
  ItecCardPaymentResponse,
  ItecCardCallbackPayload,
} from './itec.js';

// Payment Provider Types
export type {
  ProviderTransactionRequest,
  ProviderTransactionResponse,
  ProviderStatusResponse,
  PaymentProviderAdapter,
} from './payment-provider.js';

export { PaymentProvider } from './payment-provider.js';

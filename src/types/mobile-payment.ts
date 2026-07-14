/**
 * Mobile Payment Types
 *
 * Type definitions for mobile payment operations (Cashin/Cashout).
 */

import type { Merchant, MobilePayment } from '@prisma/client';

// ============================================================================
// Request Parameters
// ============================================================================

export interface CashinParams {
  merchantId: string;
  orderId: string;
  amount: number;
  phoneNumber: string;
  customerName?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  provider?: 'itec' | 'paypack'; // Default: 'itec' (ITEC is primary provider)
}

export interface CashoutParams {
  merchantId: string;
  orderId: string;
  amount: number;
  phoneNumber: string;
  recipientName?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  provider?: 'itec' | 'paypack'; // Default: 'itec' (ITEC is primary provider)
}

export interface MobilePaymentResult {
  id: string;
  ref: string;
  orderId: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  type: 'CASHIN' | 'CASHOUT';
  status: 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED';
  fee: number;
  provider?: string;
  createdAt: string; // ISO 8601 date-time string
}

export interface MobilePaymentPage {
  payments: MobilePaymentRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MobilePaymentRecord {
  id: string;
  merchantId: string;
  orderId: string;
  ref: string;
  amount: number;
  currency: string;
  phoneNumber: string;
  type: 'CASHIN' | 'CASHOUT';
  status: 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED';
  provider: string | null;
  fee: number;
  customerName: string | null;
  description: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown> | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionStatusResult {
  ref: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED';
  amount: number;
  fee: number;
  provider?: string;
  processedAt?: Date;
}

export interface AccountBalanceResult {
  balance: number;
  currency: string;
  merchantName: string;
  inRate: number;
  outRate: number;
}

// ============================================================================
// Service Request Types
// ============================================================================

export interface CashinRequestParams extends CashinParams {
  merchant: Merchant;
}

export interface CashoutRequestParams extends CashoutParams {
  merchant: Merchant;
}

export interface CardPaymentParams {
  merchantId: string;
  orderId: string;
  amount: number;
  email: string;
  currency?: string; // Default: 'RWF'
  customerName?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface CardPaymentRequestParams extends CardPaymentParams {
  merchant: Merchant;
}

export interface CardPaymentResult {
  id: string;
  ref: string;
  orderId: string;
  amount: number;
  currency: string;
  email: string;
  type: 'CARD';
  status: 'PENDING' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED';
  pcode: string;
  checkoutUrl: string;
  validUntil: string;
  provider: string;
  createdAt: string;
}

// ============================================================================
// Internal Types
// ============================================================================

export interface MobilePaymentWithMerchant extends MobilePayment {
  merchant: {
    id: string;
    webhookUrl: string | null;
    webhookSecret: string | null;
  };
}

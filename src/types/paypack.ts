/**
 * Paypack API Types
 *
 * Type definitions for the Paypack payment gateway API.
 * These types represent the request/response structures of the Paypack REST API.
 */

// ============================================================================
// Configuration
// ============================================================================

export interface PaypackConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  environment?: 'development' | 'production';
}

// ============================================================================
// Authentication
// ============================================================================

export interface PaypackAuthResponse {
  access: string;
  refresh: string;
  expires: string;
}

// ============================================================================
// Transactions
// ============================================================================

export interface PaypackTransactionRequest {
  amount: number;
  number: string;
}

export interface PaypackTransactionResponse {
  amount: number;
  created_at: string;
  kind: 'CASHIN' | 'CASHOUT';
  ref: string;
  status: 'pending' | 'successful' | 'failed';
}

export interface PaypackTransactionDetails {
  amount: number;
  client: string;
  fee: number;
  kind: 'CASHIN' | 'CASHOUT';
  merchant: string;
  ref: string;
  status: 'pending' | 'successful' | 'failed';
  timestamp: string;
  provider?: string;
}

// ============================================================================
// Account
// ============================================================================

export interface PaypackAccountInfo {
  id: string;
  name: string;
  email: string;
  balance: number;
  in_rate: number;
  out_rate: number;
}

// ============================================================================
// Events / Webhooks
// ============================================================================

export interface PaypackEventData {
  ref: string;
  kind: 'CASHIN' | 'CASHOUT';
  fee: number;
  merchant: string;
  client: string;
  amount: number;
  status: 'pending' | 'successful' | 'failed';
  provider?: string;
  created_at: string;
  processed_at?: string;
}

export interface PaypackEvent {
  event_id: string;
  event_kind: string;
  created_at: string;
  data: PaypackEventData;
}

export interface PaypackEventsResponse {
  transactions: PaypackEvent[];
  total: number;
  offset: number;
  limit: number;
}

export interface PaypackEventsQuery {
  ref?: string;
  kind?: 'CASHIN' | 'CASHOUT';
  client?: string;
  status?: 'pending' | 'successful' | 'failed';
  offset?: number;
  limit?: number;
}

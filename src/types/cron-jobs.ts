/**
 * Cron job types and interfaces
 * Types for payment polling, status tracking, and retry metadata
 */

/**
 * Individual status check record
 * Tracks each attempt to check payment status with provider
 */
export interface StatusCheckRecord {
  attempt: number;
  timestamp: string;
  provider: string;
  old_status: string;
  new_status: string;
  success: boolean;
  error?: string;
}

/**
 * Retry metadata stored in payment.metadata JSON
 * Complete audit trail of all status checks and retry attempts
 */
export interface RetryMetadata {
  /** Total number of status check attempts across all polling cycles */
  retry_count: number;

  /** ISO timestamp of the most recent status check */
  last_retry_at: string;

  /** ISO timestamp when polling started for this payment */
  first_attempt_at: string;

  /** History of all status checks (last 10 kept to prevent bloat) */
  status_checks: StatusCheckRecord[];

  /** Whether manual webhook was sent to merchant */
  manual_webhook_sent?: boolean;

  /** When manual webhook was sent */
  manual_webhook_sent_at?: string;

  /** Whether payment was flagged as stale (>24hrs PENDING) */
  stale_alert_triggered?: boolean;

  /** When stale alert was triggered */
  stale_alert_at?: string;

  /** Reason why stale alert was triggered */
  alert_reason?: string;

  /** Flexible field for additional metadata */
  [key: string]: unknown;
}

/**
 * Return type for single payment status check
 */
export interface PaymentCheckStats {
  checked: number;
  updated: number;
  failed: number;
}

/**
 * Payment with merchant relationship for webhook notifications
 */
export interface PaymentWithMerchant {
  id: string;
  merchantId: string;
  orderId: string;
  ref: string;
  amount: number;
  currency: string;
  status: string;
  provider: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  merchant: {
    id: string;
    webhookUrl?: string | null;
    webhookSecret?: string | null;
  };
}

/**
 * Polling job configuration
 */
export interface PollingConfig {
  /** How many minutes old a payment must be to enter polling cycle */
  minAgeMinutes: number;

  /** Maximum number of payments to check per polling run */
  maxBatchSize: number;

  /** How many hours before flagging payment as stale */
  staleThresholdHours: number;

  /** Cron schedule for status polling (default: every 30 minutes) */
  pollSchedule: string;

  /** Cron schedule for stale alerts (default: every hour) */
  staleSchedule: string;

  /** Maximum retry attempts per payment check */
  maxRetries: number;
}

/**
 * Polling job statistics (logged after each run)
 */
export interface PollingStats {
  checked: number;
  updated: number;
  failed: number;
  mobilePending: number;
  cardPending: number;
  timestamp: string;
}

/**
 * Stale payment alert details
 */
export interface StalePaymentAlert {
  id: string;
  orderId: string;
  amount: number;
  merchantId: string;
  createdAt: Date;
  provider: string | null;
  staleSinceDuration: string; // e.g., "48 hours"
  retryCount: number;
}

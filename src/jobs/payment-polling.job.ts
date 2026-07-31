import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { prismaRead, prismaWrite } from '../lib/prisma.js';
import { MobilePaymentService, CardPaymentService } from '../services/index.js';
import { retry } from '../lib/retry.js';
import type { RetryMetadata } from '../types/cron-jobs.js';

/**
 * Production cron job for payment reconciliation
 * - Polls pending payments that may have missed webhooks
 * - Tracks retry attempts and status changes in metadata
 * - Alerts on payments stuck in PENDING state > 24 hours
 * - SCHEDULED: Every 30 minutes for status checks, every hour for stale alerts
 */

const mobilePaymentService = new MobilePaymentService();
const cardPaymentService = new CardPaymentService();

export function startPaymentPollingJobs(): void {
  // Every 30 minutes: Check pending payments older than 5 minutes
  cron.schedule('*/30 * * * *', () => {
    pollPendingPayments().catch((err) => {
      logger.error({ err }, 'Payment polling job failed');
    });
  });

  // Every hour: Alert on stale payments (pending > 24 hours)
  cron.schedule('0 * * * *', () => {
    checkStalePayments().catch((err) => {
      logger.error({ err }, 'Stale payment check job failed');
    });
  });

  logger.info('Payment polling jobs started (30min polling + 1hr stale alerts)');
}

/**
 * Poll pending payments and check their status with payment providers
 * Tracks retry count and status history in metadata for audit trail
 */
async function pollPendingPayments(): Promise<void> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  // Get pending mobile payments
  const pendingMobile = await prismaRead.mobilePayment.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: fiveMinutesAgo },
    },
    take: 100,
    include: { merchant: { select: { id: true, webhookUrl: true, webhookSecret: true } } },
  });

  // Get pending card payments
  const pendingCard = await prismaRead.mobilePayment.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: fiveMinutesAgo },
      metadata: { path: ['payment_type'], equals: 'card' },
    },
    take: 100,
    include: { merchant: { select: { id: true, webhookUrl: true, webhookSecret: true } } },
  });

  let checked = 0;
  let updated = 0;
  let failed = 0;

  // Check mobile payment statuses
  for (const payment of pendingMobile) {
    const stats = await checkMobilePaymentStatus(payment);
    checked += stats.checked;
    updated += stats.updated;
    failed += stats.failed;
  }

  // Check card payment statuses
  for (const payment of pendingCard) {
    const stats = await checkCardPaymentStatus(payment);
    checked += stats.checked;
    updated += stats.updated;
    failed += stats.failed;
  }

  logger.info(
    {
      checked,
      updated,
      failed,
      mobilePending: pendingMobile.length,
      cardPending: pendingCard.length,
      timestamp: new Date().toISOString(),
    },
    'Payment polling completed',
  );
}

/**
 * Check single mobile payment status
 */
async function checkMobilePaymentStatus(payment: any): Promise<{ checked: number; updated: number; failed: number }> {
  try {
    const oldStatus = payment.status;
    const retryMeta = parseRetryMetadata(payment.metadata);

    const result = await retry(
      () =>
        mobilePaymentService.getTransactionStatus(payment.ref, {
          provider: payment.provider,
          metadata: payment.metadata as Record<string, unknown>,
        }),
      3,
      `Mobile payment status check: ${payment.id}`,
    );

    const newStatus = (result as any)?.status || oldStatus;

    if (newStatus !== oldStatus) {
      const updatedMeta = updateRetryMetadata(retryMeta, {
        success: true,
        oldStatus,
        newStatus,
        provider: (result as any)?.provider || payment.provider || 'unknown',
        timestamp: new Date().toISOString(),
      });

      await prismaWrite.mobilePayment.update({
        where: { id: payment.id },
        data: {
          status: newStatus as any,
          metadata: updatedMeta as any,
        },
      });

      logger.info(
        {
          paymentId: payment.id,
          orderId: payment.orderId,
          oldStatus,
          newStatus,
          retryCount: retryMeta.retry_count,
          source: 'polling',
        },
        'Payment status updated via polling',
      );

      return { checked: 1, updated: 1, failed: 0 };
    }

    retryMeta.retry_count += 1;
    retryMeta.last_retry_at = new Date().toISOString();

    await prismaWrite.mobilePayment.update({
      where: { id: payment.id },
      data: {
        metadata: retryMeta as any,
      },
    });

    logger.debug(
      { paymentId: payment.id, status: newStatus, retryCount: retryMeta.retry_count },
      'Payment status checked (no change)',
    );

    return { checked: 1, updated: 0, failed: 0 };
  } catch (err) {
    try {
      const retryMeta = parseRetryMetadata(payment.metadata);
      retryMeta.retry_count += 1;
      retryMeta.last_retry_at = new Date().toISOString();

      await prismaWrite.mobilePayment.update({
        where: { id: payment.id },
        data: {
          metadata: retryMeta as any,
        },
      });
    } catch (metaErr) {
      logger.warn({ metaErr, paymentId: payment.id }, 'Failed to update metadata after status check error');
    }

    logger.warn(
      { err, paymentId: payment.id, orderId: payment.orderId },
      'Failed to check mobile payment status (will retry in 30min)',
    );

    return { checked: 1, updated: 0, failed: 1 };
  }
}

/**
 * Check single card payment status
 */
async function checkCardPaymentStatus(payment: any): Promise<{ checked: number; updated: number; failed: number }> {
  try {
    const oldStatus = payment.status;
    const retryMeta = parseRetryMetadata(payment.metadata);

    const result = await retry(
      () => cardPaymentService.getCardPaymentStatus(payment.ref, payment.merchantId),
      3,
      `Card payment status check: ${payment.id}`,
    );

    const newStatus = (result as any)?.status || oldStatus;

    if (newStatus !== oldStatus) {
      const updatedMeta = updateRetryMetadata(retryMeta, {
        success: true,
        oldStatus,
        newStatus,
        provider: 'itec-pesapal',
        timestamp: new Date().toISOString(),
      });

      await prismaWrite.mobilePayment.update({
        where: { id: payment.id },
        data: {
          status: newStatus as any,
          metadata: updatedMeta as any,
        },
      });

      logger.info(
        {
          paymentId: payment.id,
          orderId: payment.orderId,
          paymentType: 'card',
          oldStatus,
          newStatus,
          retryCount: retryMeta.retry_count,
          source: 'polling',
        },
        'Card payment status updated via polling',
      );

      return { checked: 1, updated: 1, failed: 0 };
    }

    retryMeta.retry_count += 1;
    retryMeta.last_retry_at = new Date().toISOString();

    await prismaWrite.mobilePayment.update({
      where: { id: payment.id },
      data: {
        metadata: retryMeta as any,
      },
    });

    return { checked: 1, updated: 0, failed: 0 };
  } catch (err) {
    try {
      const retryMeta = parseRetryMetadata(payment.metadata);
      retryMeta.retry_count += 1;
      retryMeta.last_retry_at = new Date().toISOString();

      await prismaWrite.mobilePayment.update({
        where: { id: payment.id },
        data: {
          metadata: retryMeta as any,
        },
      });
    } catch (metaErr) {
      logger.warn({ metaErr, paymentId: payment.id }, 'Failed to update metadata after card status check error');
    }

    logger.warn(
      { err, paymentId: payment.id, paymentType: 'card' },
      'Failed to check card payment status (will retry in 30min)',
    );

    return { checked: 1, updated: 0, failed: 1 };
  }
}

/**
 * Alert on payments stuck in PENDING state for too long
 * Indicates potential webhook delivery failure or provider issue
 * If merchant has webhook configured, trigger manual retry
 */
async function checkStalePayments(): Promise<void> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stalePayments = await prismaRead.mobilePayment.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: twentyFourHoursAgo },
    },
    select: {
      id: true,
      orderId: true,
      amount: true,
      merchantId: true,
      createdAt: true,
      provider: true,
      metadata: true,
    },
  });

  if (stalePayments.length > 0) {
    logger.error(
      {
        count: stalePayments.length,
        paymentIds: stalePayments.map((p) => p.id),
        since: twentyFourHoursAgo.toISOString(),
        timestamp: new Date().toISOString(),
      },
      'ALERT: Stale payments detected (pending > 24 hours) - possible webhook delivery failure or provider issue',
    );

    // Mark stale payments with alert flag in metadata for manual intervention
    for (const payment of stalePayments) {
      try {
        const meta = parseRetryMetadata(payment.metadata);
        meta.stale_alert_triggered = true;
        meta.stale_alert_at = new Date().toISOString();
        meta.alert_reason = 'Payment pending > 24 hours - check webhook delivery logs and provider status';

        await prismaWrite.mobilePayment.update({
          where: { id: payment.id },
          data: {
            metadata: meta as any,
          },
        });
      } catch (err) {
        logger.warn({ err, paymentId: payment.id }, 'Failed to mark stale payment alert in metadata');
      }
    }

    // TODO: Send alert to monitoring/alerting system
    // - PagerDuty for oncall notification
    // - Sentry error tracking
    // - Custom Slack webhook to #payments-alerts
    // await alertService.notifyOncall('Stale payments detected', { stalePayments });
  }
}

/**
 * Parse retry metadata from payment JSON
 */
function parseRetryMetadata(metadata: unknown): RetryMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return initializeRetryMetadata();
  }

  const meta = metadata as Record<string, unknown>;

  if (meta.retry_count && typeof meta.retry_count === 'number') {
    return meta as any;
  }

  return initializeRetryMetadata();
}

/**
 * Initialize fresh retry metadata
 */
function initializeRetryMetadata(): RetryMetadata {
  return {
    retry_count: 0,
    last_retry_at: new Date().toISOString(),
    first_attempt_at: new Date().toISOString(),
    status_checks: [],
  };
}

/**
 * Update retry metadata with new status check result
 */
function updateRetryMetadata(
  meta: RetryMetadata,
  check: {
    success: boolean;
    oldStatus: string;
    newStatus: string;
    provider: string;
    timestamp: string;
  },
): RetryMetadata {
  const updated = { ...meta };
  updated.retry_count += 1;
  updated.last_retry_at = check.timestamp;

  updated.status_checks.push({
    attempt: updated.retry_count,
    timestamp: check.timestamp,
    provider: check.provider,
    old_status: check.oldStatus,
    new_status: check.newStatus,
    success: check.success,
  });

  // Keep only last 10 status checks to avoid metadata bloat
  if (updated.status_checks.length > 10) {
    updated.status_checks = updated.status_checks.slice(-10);
  }

  return updated;
}

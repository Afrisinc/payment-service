import type Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { PaymentStatus } from '@prisma/client';
import { stripe } from '../lib/stripe.js';
import { paymentRepository, webhookEventRepository } from '../repositories/index.js';
import {
  merchantWebhookService,
  type WebhookEventType,
  type PaymentWithWebhookMerchant,
} from './merchant-webhook.service.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import crypto from 'crypto';

// ── Subscription lifecycle event types forwarded to notification-service ──────
type SubscriptionEventType =
  | 'subscription.trial_will_end'
  | 'subscription.payment_succeeded'
  | 'subscription.payment_failed'
  | 'subscription.updated'
  | 'subscription.canceled';

function statusToEventType(status: PaymentStatus): WebhookEventType {
  const mapping: Record<PaymentStatus, WebhookEventType> = {
    SUCCEEDED: 'payment.succeeded',
    FAILED: 'payment.failed',
    CANCELLED: 'payment.cancelled',
    REFUNDED: 'payment.refunded',
    DISPUTED: 'payment.disputed',
    EXPIRED: 'payment.expired',
    PENDING: 'payment.succeeded', // Won't be used for PENDING
  };
  return mapping[status];
}

export class WebhookService {
  verifyAndParseEvent(payload: Buffer, signature: string): Stripe.Event {
    return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  }

  async processEvent(event: Stripe.Event): Promise<void> {
    if (await webhookEventRepository.exists(event.id)) {
      logger.warn({ eventId: event.id }, 'Duplicate webhook event — skipping');
      return;
    }

    await webhookEventRepository.create({
      stripeEventId: event.id,
      eventType: event.type,
      payload: event.data.object as Prisma.InputJsonValue,
    });

    const obj = event.data.object;
    switch (event.type) {
      // ── One-off payment events ──────────────────────────────────────────────
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(obj as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentStatusChange(obj as Stripe.PaymentIntent, PaymentStatus.FAILED);
        break;
      case 'payment_intent.canceled':
        await this.handlePaymentIntentStatusChange(obj as Stripe.PaymentIntent, PaymentStatus.CANCELLED);
        break;
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(obj as Stripe.Checkout.Session);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutSessionStatusChange(obj as Stripe.Checkout.Session, PaymentStatus.EXPIRED);
        break;
      case 'checkout.session.async_payment_failed':
        await this.handleCheckoutSessionStatusChange(obj as Stripe.Checkout.Session, PaymentStatus.FAILED);
        break;
      case 'charge.dispute.created':
        await this.handleDisputeCreated(obj as Stripe.Dispute);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(obj as Stripe.Charge);
        break;

      // ── Stripe Subscription lifecycle events ────────────────────────────────
      // These fire for subscriptions created via SetupIntent + stripe.subscriptions.create()
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(obj as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(obj as Stripe.Invoice);
        break;
      case 'customer.subscription.trial_will_end':
        await this.handleSubscriptionTrialWillEnd(obj as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(obj as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(obj as Stripe.Subscription);
        break;

      default:
        logger.info({ eventType: event.type }, 'Unhandled webhook event type');
    }
  }

  // ── One-off payment handlers ──────────────────────────────────────────────

  private async handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
    const payment = await paymentRepository.updateStatusByStripeIntentIdWithMerchant(
      intent.id,
      PaymentStatus.SUCCEEDED,
    );
    if (payment) {
      logger.info({ paymentId: payment.id }, 'Payment intent succeeded');
      await this.notifyMerchant(payment, PaymentStatus.SUCCEEDED);
    }
  }

  private async handlePaymentIntentStatusChange(intent: Stripe.PaymentIntent, status: PaymentStatus): Promise<void> {
    const payment = await paymentRepository.updateStatusByStripeIntentIdWithMerchant(intent.id, status);
    if (payment) {
      logger.info({ paymentId: payment.id, status }, 'Payment intent status updated');
      await this.notifyMerchant(payment, status);
    }
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const payment = await paymentRepository.updateStatusByStripeSessionIdWithMerchant(
      session.id,
      PaymentStatus.SUCCEEDED,
    );
    if (payment) {
      logger.info({ paymentId: payment.id }, 'Checkout session completed');
      await this.notifyMerchant(payment, PaymentStatus.SUCCEEDED);
    }
  }

  private async handleCheckoutSessionStatusChange(
    session: Stripe.Checkout.Session,
    status: PaymentStatus,
  ): Promise<void> {
    const payment = await paymentRepository.updateStatusByStripeSessionIdWithMerchant(session.id, status);
    if (payment) {
      logger.info({ paymentId: payment.id, status }, 'Checkout session status updated');
      await this.notifyMerchant(payment, status);
    }
  }

  private async handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const charge = dispute.charge as string;
    const chargeObj = await stripe.charges.retrieve(charge);
    const intentId = chargeObj.payment_intent as string | null;
    if (intentId) {
      const payment = await paymentRepository.updateStatusByStripeIntentIdWithMerchant(
        intentId,
        PaymentStatus.DISPUTED,
      );
      if (payment) {
        logger.warn({ paymentId: payment.id, disputeId: dispute.id }, 'Dispute created');
        await this.notifyMerchant(payment, PaymentStatus.DISPUTED);
      }
    }
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const intentId = charge.payment_intent as string | null;
    if (intentId) {
      const payment = await paymentRepository.updateStatusByStripeIntentIdWithMerchant(
        intentId,
        PaymentStatus.REFUNDED,
      );
      if (payment) {
        logger.info({ paymentId: payment.id }, 'Charge refunded');
        await this.notifyMerchant(payment, PaymentStatus.REFUNDED);
      }
    }
  }

  // ── Stripe Subscription lifecycle handlers ────────────────────────────────

  /**
   * Fires after each successful invoice payment (including the first post-trial charge).
   * We extract accountId from the subscription metadata and forward to notification-service.
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoice.subscription as string | null;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const accountId = subscription.metadata?.['accountId'];
    if (!accountId) {
      logger.warn({ subscriptionId }, 'invoice.payment_succeeded — no accountId in subscription metadata');
      return;
    }

    logger.info({ accountId, subscriptionId, invoiceId: invoice.id }, 'Subscription invoice payment succeeded');
    await this.forwardSubscriptionEvent('subscription.payment_succeeded', {
      accountId,
      subscriptionId,
      invoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      planId: subscription.metadata?.['planId'],
      billingCycle: subscription.metadata?.['billingCycle'],
    });
  }

  /**
   * Fires when Stripe cannot collect payment after all retry attempts.
   * notification-service should mark the subscription as past_due and notify the user.
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = invoice.subscription as string | null;
    if (!subscriptionId) return;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const accountId = subscription.metadata?.['accountId'];
    if (!accountId) {
      logger.warn({ subscriptionId }, 'invoice.payment_failed — no accountId in subscription metadata');
      return;
    }

    logger.warn({ accountId, subscriptionId, invoiceId: invoice.id }, 'Subscription invoice payment failed');
    await this.forwardSubscriptionEvent('subscription.payment_failed', {
      accountId,
      subscriptionId,
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      nextPaymentAttempt: invoice.next_payment_attempt,
      planId: subscription.metadata?.['planId'],
    });
  }

  /**
   * Fires 3 days before trial ends.
   * notification-service should send a reminder email to the user.
   */
  private async handleSubscriptionTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    const accountId = subscription.metadata?.['accountId'];
    if (!accountId) {
      logger.warn({ subscriptionId: subscription.id }, 'trial_will_end — no accountId in subscription metadata');
      return;
    }

    logger.info({ accountId, subscriptionId: subscription.id, trialEnd: subscription.trial_end }, 'Trial ending soon');
    await this.forwardSubscriptionEvent('subscription.trial_will_end', {
      accountId,
      subscriptionId: subscription.id,
      trialEnd: subscription.trial_end,
      planId: subscription.metadata?.['planId'],
    });
  }

  /**
   * Fires when a subscription status changes (e.g. trialing → active after first charge).
   * notification-service should sync the subscription status.
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const accountId = subscription.metadata?.['accountId'];
    if (!accountId) return; // Not a managed subscription — skip

    logger.info({ accountId, subscriptionId: subscription.id, status: subscription.status }, 'Subscription updated');
    await this.forwardSubscriptionEvent('subscription.updated', {
      accountId,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      trialEnd: subscription.trial_end,
      planId: subscription.metadata?.['planId'],
      billingCycle: subscription.metadata?.['billingCycle'],
    });
  }

  /**
   * Fires when a subscription is cancelled (either by the user or by Stripe after exhausting retries).
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const accountId = subscription.metadata?.['accountId'];
    if (!accountId) return;

    logger.info({ accountId, subscriptionId: subscription.id }, 'Subscription cancelled');
    await this.forwardSubscriptionEvent('subscription.canceled', {
      accountId,
      subscriptionId: subscription.id,
      canceledAt: subscription.canceled_at,
      planId: subscription.metadata?.['planId'],
    });
  }

  /**
   * Forward subscription lifecycle events to the notification-service merchant webhook.
   * We use the existing merchantWebhookService delivery infrastructure but with a
   * dedicated notification-service merchant that has its webhookUrl configured.
   *
   * Finds the merchant whose webhookUrl is the notification-service internal endpoint,
   * then delivers using the same HMAC-signed payload format.
   */
  private async forwardSubscriptionEvent(
    eventType: SubscriptionEventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Find the notification-service merchant (designated by a special flag or known url pattern)
      const merchant = await prisma.merchant.findFirst({
        where: {
          isActive: true,
          webhookUrl: { not: null },
          // The notification-service merchant is identified by its webhook URL pattern
          // In production this should be the only merchant with an internal URL
        },
        orderBy: { createdAt: 'asc' }, // Prefer the first-registered (system) merchant
      });

      if (!merchant?.webhookUrl || !merchant.webhookSecret) {
        logger.warn({ eventType }, 'No merchant with webhookUrl configured for subscription events');
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), data });
      const signed = `${timestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', merchant.webhookSecret).update(signed).digest('hex');
      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const response = await fetch(merchant.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Afrisinc-Signature': signatureHeader,
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        logger.warn(
          { eventType, status: response.status, url: merchant.webhookUrl },
          'Subscription event delivery non-2xx',
        );
      } else {
        logger.info({ eventType, data }, 'Subscription event delivered');
      }
    } catch (error) {
      logger.error({ err: error, eventType }, 'Failed to forward subscription event');
    }
  }

  private async notifyMerchant(payment: PaymentWithWebhookMerchant, status: PaymentStatus): Promise<void> {
    try {
      const eventType = statusToEventType(status);
      await merchantWebhookService.notifyPaymentEvent(payment, eventType);
    } catch (error) {
      logger.error({ err: error, paymentId: payment.id }, 'Failed to queue merchant webhook notification');
    }
  }
}

export const webhookService = new WebhookService();

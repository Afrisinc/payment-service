import type { FastifyRequest, FastifyReply } from 'fastify';
import { setupSubscriptionService } from '../services/setup-subscription.service.js';
import { logger } from '../lib/logger.js';
import { ResponseHandler } from '../utils/response-handler.js';

export class SubscriptionController {
  /**
   * POST /subscriptions/setup-intent
   * Body: { email: string; name?: string }
   * Returns: { customerId, clientSecret, setupIntentId }
   *
   * Call this before the frontend payment form to get a SetupIntent.
   * The frontend calls stripe.confirmCardSetup(clientSecret) to save the card.
   */
  async createSetupIntent(
    request: FastifyRequest<{ Body: { email: string; name?: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { email, name } = request.body;

    if (!email?.trim()) {
      await ResponseHandler.validationError(reply, 'email is required');
      return;
    }

    const customerId = await setupSubscriptionService.ensureCustomer(email, name);
    const result = await setupSubscriptionService.createSetupIntent(customerId);

    logger.info({ customerId: result.customerId, setupIntentId: result.setupIntentId }, 'Setup intent created');
    await ResponseHandler.created(reply, result, 'Setup intent created successfully');
  }

  /**
   * POST /subscriptions/create
   * Body: {
   *   customerId: string;        — Stripe cus_xxx from setup-intent
   *   paymentMethodId: string;   — pm_xxx returned after confirmCardSetup
   *   amountCents: number;       — plan price in cents
   *   currency: string;          — e.g. 'usd'
   *   trialDays: number;         — 0 = no trial, 14 = standard
   *   metadata: Record<string, string>; — { accountId, planId, billingCycle, planName }
   * }
   * Returns: { subscriptionId, status, currentPeriodStart, currentPeriodEnd, trialEnd, defaultPaymentMethod }
   */
  async createSubscription(
    request: FastifyRequest<{
      Body: {
        customerId: string;
        paymentMethodId: string;
        amountCents: number;
        currency: string;
        trialDays: number;
        metadata: Record<string, string>;
      };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { customerId, paymentMethodId, amountCents, currency, trialDays, metadata } = request.body;

    if (!customerId || !paymentMethodId || !amountCents || !currency) {
      await ResponseHandler.validationError(
        reply,
        'customerId, paymentMethodId, amountCents, and currency are required',
      );
      return;
    }

    if (amountCents <= 0) {
      await ResponseHandler.validationError(reply, 'amountCents must be positive');
      return;
    }

    const result = await setupSubscriptionService.createSubscription(
      customerId,
      paymentMethodId,
      amountCents,
      currency,
      trialDays ?? 0,
      metadata ?? {},
    );

    logger.info(
      { subscriptionId: result.subscriptionId, customerId, status: result.status },
      'Stripe subscription created via API',
    );
    await ResponseHandler.created(reply, result, 'Subscription created successfully');
  }
}

export const subscriptionController = new SubscriptionController();

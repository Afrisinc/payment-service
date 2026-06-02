/**
 * SetupSubscriptionService
 *
 * Handles Stripe-native trial subscription lifecycle:
 *   1. Create or retrieve a Stripe Customer (idempotent by email)
 *   2. Create a SetupIntent so the frontend can save a card off-session
 *   3. Create a Stripe Subscription with trial_period_days — Stripe owns the
 *      auto-charge, dunning, and invoice lifecycle from this point
 *
 * All Stripe calls are made here (in afrisinc-pay, the Stripe layer).
 * notification-service calls these endpoints and stores the resulting IDs.
 */
import { stripe } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';

export interface CreateSetupIntentResult {
  customerId: string;
  clientSecret: string;
  setupIntentId: string;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  status: string; // 'trialing' | 'active' | 'past_due' etc.
  currentPeriodStart: number; // Unix timestamp
  currentPeriodEnd: number; // Unix timestamp
  trialEnd: number | null; // Unix timestamp or null
  defaultPaymentMethod: string | null; // pm_xxx
}

export class SetupSubscriptionService {
  /**
   * Ensure a Stripe Customer exists for the given email.
   * If one already exists (looked up by email), returns the existing one.
   * This prevents duplicate Stripe Customers across signup retries.
   */
  async ensureCustomer(email: string, name?: string): Promise<string> {
    // Look up by email first to prevent duplicates
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data?.length) {
      const cus = existing.data[0]!;
      logger.info({ customerId: cus.id, email }, 'Reusing existing Stripe customer');
      return cus.id;
    }

    const customer = await stripe.customers.create({
      email,
      name: name ?? email,
      metadata: { source: 'afrisinc-notify' },
    });

    logger.info({ customerId: customer.id, email }, 'Stripe customer created');
    return customer.id;
  }

  /**
   * Create a SetupIntent scoped to the given Customer.
   * usage: 'off_session' tells Stripe this card will be charged automatically
   * (i.e., without the user being present) — required for trial auto-charge.
   *
   * The frontend calls stripe.confirmCardSetup(clientSecret) to save the card.
   * After confirmation, Stripe attaches the resulting pm_xxx to the Customer.
   */
  async createSetupIntent(customerId: string): Promise<CreateSetupIntentResult> {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    });

    logger.info({ setupIntentId: setupIntent.id, customerId }, 'SetupIntent created');

    return {
      customerId,
      clientSecret: setupIntent.client_secret!,
      setupIntentId: setupIntent.id,
    };
  }

  /**
   * Create a Stripe Subscription with a free trial.
   *
   * Stripe will:
   *   - Start the subscription in 'trialing' status
   *   - Auto-charge defaultPaymentMethod after trialDays days
   *   - Retry failed payments using its built-in Smart Retries / dunning
   *   - Fire webhooks: invoice.payment_succeeded, invoice.payment_failed,
   *     customer.subscription.trial_will_end (3 days before), etc.
   *
   * @param customerId  Stripe cus_xxx
   * @param paymentMethodId  pm_xxx returned from confirmCardSetup — attached to the Customer
   * @param amountCents  Billing amount in cents (e.g. 4900 for $49/mo)
   * @param currency  ISO code e.g. 'usd'
   * @param trialDays  Free trial length (typically 14)
   * @param metadata  Forwarded to Stripe metadata (accountId, planId, billingCycle)
   */
  async createSubscription(
    customerId: string,
    paymentMethodId: string,
    amountCents: number,
    currency: string,
    trialDays: number,
    metadata: Record<string, string>,
  ): Promise<CreateSubscriptionResult> {
    // Set the payment method as the Customer's default for invoices
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const product = await stripe.products.create({
      name: `Afrisinc Notify — ${metadata['planName'] ?? metadata['planId'] ?? 'Plan'}`,
      metadata: {
        billingCycle: metadata['billingCycle'] ?? 'unknown',
        source: 'afrisinc-pay',
      },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product: product.id,
            unit_amount: amountCents,
            recurring: {
              interval: metadata['billingCycle'] === 'yearly' ? 'year' : 'month',
            },
          },
        },
      ],
      default_payment_method: paymentMethodId,
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata,
      // Expand so we can log useful info
      expand: ['latest_invoice'],
    });

    logger.info(
      {
        subscriptionId: subscription.id,
        customerId,
        status: subscription.status,
        trialEnd: subscription.trial_end,
      },
      'Stripe subscription created',
    );

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      trialEnd: subscription.trial_end,
      defaultPaymentMethod: paymentMethodId,
    };
  }
}

export const setupSubscriptionService = new SetupSubscriptionService();

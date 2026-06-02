import type { FastifyInstance } from 'fastify';
import { subscriptionController } from '../controllers/subscription.controller.js';

export function subscriptionRoutes(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  /**
   * POST /subscriptions/setup-intent
   * Creates a Stripe Customer (idempotent by email) + SetupIntent.
   * Returns clientSecret for stripe.confirmCardSetup() on the frontend.
   */
  fastify.post<{ Body: { email: string; name?: string } }>('/setup-intent', {
    preHandler: [fastify.authenticate],
    handler: subscriptionController.createSetupIntent.bind(subscriptionController),
  });

  /**
   * POST /subscriptions/create
   * Creates a Stripe Subscription with optional trial period.
   * Must be called after the frontend has confirmed the card via confirmCardSetup().
   */
  fastify.post<{
    Body: {
      customerId: string;
      paymentMethodId: string;
      amountCents: number;
      currency: string;
      trialDays: number;
      metadata: Record<string, string>;
    };
  }>('/create', {
    preHandler: [fastify.authenticate],
    handler: subscriptionController.createSubscription.bind(subscriptionController),
  });

  done();
}

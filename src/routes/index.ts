import type { FastifyInstance } from 'fastify';
import { paymentRoutes } from './payment.routes.js';
import { webhookRoutes } from './webhook.routes.js';
import { healthRoutes } from './health.routes.js';
import { merchantRoutes } from './merchant.routes.js';
import { subscriptionRoutes } from './subscription.routes.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(paymentRoutes, { prefix: '/payments' });
  await fastify.register(webhookRoutes, { prefix: '/webhooks' });
  await fastify.register(merchantRoutes, { prefix: '/admin/merchants' });
  await fastify.register(subscriptionRoutes, { prefix: '/subscriptions' });
}

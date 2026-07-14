import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

async function swaggerPlugin(fastify: FastifyInstance): Promise<void> {
  if (!env.ENABLE_SWAGGER) {
    return;
  }

  // Build servers array based on environment
  const servers: Array<{ url: string; description: string }> = [];

  // Only use API_BASE_URL if configured
  if (env.API_BASE_URL) {
    servers.push({ url: env.API_BASE_URL, description: `${env.NODE_ENV} server` });
  }

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Afrisinc Pay API',
        description: 'Payment Gateway API - ITEC (MTN/Airtel/Card) + Paypack',
        version: '1.0.0',
        contact: {
          name: 'Afrisinc Support',
          url: 'https://afrisinc.com',
        },
      },
      servers,
      tags: [
        {
          name: 'Mobile Payments',
          description: 'Mobile Money payment operations (Cashin/Cashout) - Auto-detects MTN vs Airtel',
        },
        { name: 'Card Payments', description: 'Card payment operations (Visa/Mastercard/Amex via PesaPal)' },
        { name: 'Webhooks', description: 'Webhook endpoints for payment provider callbacks' },
      ],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'JWT Bearer token' } },
      },
    },
  });

  await fastify.register(swaggerUi, { routePrefix: '/docs' });

  logger.info({ environment: env.NODE_ENV, servers: servers.map((s) => s.url) }, 'Swagger documentation enabled');
}

export default fp(swaggerPlugin, { name: 'swagger-plugin' });

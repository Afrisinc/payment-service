import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../lib/logger.js';
import { webhookEventRepository } from '../repositories/index.js';

const WEBHOOK_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function webhookPrunePlugin(fastify: FastifyInstance): Promise<void> {
  const interval = setInterval(() => {
    webhookEventRepository
      .pruneOld()
      .then((count) => {
        if (count > 0) logger.info({ count }, 'Pruned old webhook events');
      })
      .catch((err: unknown) => {
        logger.warn({ err }, 'Webhook event pruning failed');
      });
  }, WEBHOOK_PRUNE_INTERVAL_MS);
  interval.unref();

  fastify.addHook('onClose', async () => {
    clearInterval(interval);
  });
}

export default fp(webhookPrunePlugin, { name: 'webhook-prune-plugin' });

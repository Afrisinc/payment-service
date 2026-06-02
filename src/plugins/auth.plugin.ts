import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { merchantRepository } from '../repositories/index.js';
import { hashApiKey } from '../lib/crypto.js';

function authPlugin(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await reply.status(401).send({ error: 'Missing or invalid authorization header' });
      return;
    }

    const apiKey = authHeader.substring(7);
    const apiKeyHash = hashApiKey(apiKey);
    const merchant = await merchantRepository.findByApiKeyHash(apiKeyHash);

    if (!merchant) {
      await reply.status(401).send({ error: 'Invalid API key' });
      return;
    }

    if (!merchant.isActive) {
      await reply.status(403).send({ error: 'Merchant account is inactive' });
      return;
    }

    request.merchant = merchant;
  });
  done();
}

export default fp(authPlugin, { name: 'auth-plugin' });

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// TODO: Implement admin authentication (ADMIN_API_KEY) when ready
function adminAuthPlugin(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.decorate('authenticateAdmin', async function (_request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    // No-op for now - admin auth will be implemented later
  });
  done();
}

export default fp(adminAuthPlugin, { name: 'admin-auth-plugin' });

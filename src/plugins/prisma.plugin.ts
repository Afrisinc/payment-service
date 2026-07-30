import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { prismaRead, prismaWrite } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

async function prismaPlugin(fastify: FastifyInstance): Promise<void> {
  await Promise.all([prismaWrite.$connect(), prismaRead.$connect()]);
  logger.info('Database connected (write + read)');

  fastify.addHook('onClose', async () => {
    await Promise.all([prismaWrite.$disconnect(), prismaRead.$disconnect()]);
    logger.info('Database disconnected');
  });
}

export default fp(prismaPlugin, { name: 'prisma-plugin' });

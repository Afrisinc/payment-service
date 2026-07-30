import type { FastifyRequest, FastifyReply } from 'fastify';
import { prismaRead, prismaWrite } from '../lib/prisma.js';
import { env } from '../config/env.js';

export class HealthController {
  async check(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      await Promise.all([prismaWrite.$queryRaw`SELECT 1`, prismaRead.$queryRaw`SELECT 1`]);
      await reply.send({
        service: 'afrisinc-pay',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        env: env.NODE_ENV,
      });
    } catch {
      await reply.status(503).send({
        service: 'afrisinc-pay',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        env: env.NODE_ENV,
      });
    }
  }
}

export const healthController = new HealthController();

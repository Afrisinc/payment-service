import type { FastifyRequest, FastifyReply } from 'fastify';
import { prismaRead, prismaWrite } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { checkDBHealth } from '../utils/health.check.js';

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

  async live(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await reply.code(200).send({ status: 'up' });
  }

  async ready(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const dbResult = await checkDBHealth();

    await reply.code(dbResult.statusCode).send({
      status: dbResult.statusCode === 200 ? 'healthy' : 'degraded',
      db: dbResult.db,
    });
  }
}

export const healthController = new HealthController();

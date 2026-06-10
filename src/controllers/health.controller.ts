import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { ResponseHandler } from '../utils/response-handler.js';

export class HealthController {
  async check(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await ResponseHandler.success(
        reply,
        {
          service: 'afrisinc-pay',
          status: 'healthy',
          env: env.NODE_ENV,
        },
        'Service is healthy',
      );
    } catch {
      await ResponseHandler.serviceUnavailable(reply, 'Database connection failed');
    }
  }
}

export const healthController = new HealthController();

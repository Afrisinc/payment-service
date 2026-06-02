import type { FastifySchema } from 'fastify';

export const healthCheckSchema: FastifySchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        status: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        env: { type: 'string' },
      },
    },
  },
};

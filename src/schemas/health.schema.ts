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

const checkResultSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' },
    latencyMs: { type: 'number' },
    error: { type: 'string' },
  },
};

export const livenessSchema: FastifySchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string' },
      },
    },
  },
};

export const readinessSchema: FastifySchema = {
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        db: {
          type: 'object',
          properties: {
            read: checkResultSchema,
            write: checkResultSchema,
          },
        },
      },
    },
    503: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        db: {
          type: 'object',
          properties: {
            read: checkResultSchema,
            write: checkResultSchema,
          },
        },
      },
    },
  },
};

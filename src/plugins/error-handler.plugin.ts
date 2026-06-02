import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from '../lib/logger.js';

function errorHandlerPlugin(fastify: FastifyInstance, _opts: unknown, done: () => void): void {
  fastify.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    logger.error(
      {
        err: error,
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      'Request error',
    );

    if (error.validation) {
      await reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
        details: error.validation,
      });
      return;
    }

    if (error.statusCode) {
      await reply.status(error.statusCode).send({
        error: error.name,
        message: error.message,
      });
      return;
    }

    await reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });
  done();
}

export default fp(errorHandlerPlugin, {
  name: 'error-handler-plugin',
});

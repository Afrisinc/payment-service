import { FastifyReply, FastifyRequest } from 'fastify';
import { ExceptionProcessor, HttpError } from '../utils/http-error.js';
import { ResponseHandler } from '../utils/response.js';
import { mapPrismaError } from '../utils/prisma.error.js';

type AsyncHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function asyncWrapper(fn: AsyncHandler): AsyncHandler {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      await fn(request, reply);
    } catch (err: unknown) {
      const prismaErr = mapPrismaError(err);
      if (prismaErr) {
        return ResponseHandler.error(reply, prismaErr, prismaErr.code, prismaErr.status);
      }
      if (err instanceof HttpError) {
        return ResponseHandler.error(reply, err.message, 1001, err.statusCode);
      }
      if (err && typeof err === 'object' && 'response' in err) {
        ExceptionProcessor.handle(err);
      }
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      return ResponseHandler.error(reply, message, 999, 500);
    }
  };
}

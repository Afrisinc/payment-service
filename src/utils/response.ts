import { FastifyReply } from 'fastify';
import { serializeBigInt } from './serialize';

interface PaginatedData {
  data: unknown;
  pagination: unknown;
}

interface ErrorDetails {
  message?: string;
  details?: unknown;
  emptyData?: unknown;
}

type ResponseData = PaginatedData | object | unknown[] | string | number | boolean | null;
type ResponseError = string | Error | ErrorDetails;

export class ResponseHandler {
  static success(
    reply: FastifyReply,
    resp_code: number = 1000,
    message = 'Success',
    data: ResponseData = null,
    statusCode: number = 200,
  ) {
    if (data && typeof data === 'object' && 'pagination' in data && 'data' in data) {
      return reply.status(statusCode).send({
        success: true,
        resp_msg: message,
        resp_code,
        data: serializeBigInt(data.data),
        pagination: serializeBigInt(data.pagination),
      });
    }

    return reply.status(statusCode).send({
      success: true,
      resp_msg: message,
      resp_code,
      data: serializeBigInt(data),
    });
  }

  static error(reply: FastifyReply, error: ResponseError, resp_code: number = 1001, statusCode: number = 400) {
    let errorMessage: string;
    let errorDetails: unknown = null;
    let emptyData: unknown = null;

    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage =
        error.message || "We couldn't process this request, Please contact gwiza customer support for assistance.";
      errorDetails = error.details ?? null;
      emptyData = error.emptyData ?? null;
    }

    return reply.status(statusCode).send({
      success: false,
      resp_msg: errorMessage,
      resp_code,
      errors: errorDetails,
      data: emptyData,
    });
  }
}

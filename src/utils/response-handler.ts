import type { FastifyReply } from 'fastify';

/**
 * Standard API response wrapper with consistent formatting
 * Supports success, error, paginated, and empty responses
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  resp_message: string;
  resp_code: number;
  data?: T;
  pagination?: PaginationMeta;
  errors?: Record<string, unknown> | null;
  timestamp: string;
}

export class ResponseHandler {
  /**
   * Success response (200 OK)
   * @param reply FastifyReply object
   * @param data Response payload
   * @param message Success message
   * @param code Response code (100 = success)
   */
  static async success<T>(
    reply: FastifyReply,
    data: T,
    message: string = 'Success',
    code: number = 100,
  ): Promise<void> {
    await reply.status(200).send(this.formatResponse(true, message, code, data));
  }

  /**
   * Created response (201 Created)
   * @param reply FastifyReply object
   * @param data Created resource
   * @param message Success message
   * @param code Response code (101 = resource created)
   */
  static async created<T>(
    reply: FastifyReply,
    data: T,
    message: string = 'Resource created successfully',
    code: number = 101,
  ): Promise<void> {
    await reply.status(201).send(this.formatResponse(true, message, code, data));
  }

  /**
   * Idempotent operation response - sends 201 for new, 200 for existing
   * Useful for POST endpoints that may create or return existing resource
   * @param reply FastifyReply object
   * @param data Resource data
   * @param isNew Whether this is a newly created resource
   * @param message Success message
   */
  static async idempotent<T>(
    reply: FastifyReply,
    data: T & { idempotent?: boolean },
    message: string = 'Success',
  ): Promise<void> {
    const isNew = !data.idempotent;
    const statusCode = isNew ? 201 : 200;
    const code = isNew ? 101 : 100;
    const msg = isNew ? 'Resource created successfully' : message;
    await reply.status(statusCode).send(this.formatResponse(true, msg, code, data));
  }

  /**
   * Paginated response (200 OK with pagination metadata)
   * @param reply FastifyReply object
   * @param items Array of items
   * @param total Total number of items
   * @param page Current page
   * @param limit Items per page
   * @param message Success message
   * @param code Response code
   */
  static async paginated<T>(
    reply: FastifyReply,
    items: T[],
    total: number,
    page: number,
    limit: number,
    message: string = 'Success',
    code: number = 100,
  ): Promise<void> {
    const pages = Math.ceil(total / limit);
    const pagination: PaginationMeta = { page, limit, total, pages };

    await reply.status(200).send({
      success: true,
      resp_message: message,
      resp_code: code,
      data: items,
      pagination,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * No content response (204 No Content)
   * Used for DELETE or actions that return no data
   * @param reply FastifyReply object
   */
  static async noContent(reply: FastifyReply): Promise<void> {
    await reply.status(204).send();
  }

  /**
   * Error response
   * @param reply FastifyReply object
   * @param message Error message
   * @param statusCode HTTP status code
   * @param code Response code (default 999 = server error)
   * @param errors Additional error details
   */
  static async error(
    reply: FastifyReply,
    message: string,
    statusCode: number = 500,
    code: number = 999,
    errors: Record<string, unknown> | null = null,
  ): Promise<void> {
    await reply.status(statusCode).send({
      success: false,
      resp_message: message,
      resp_code: code,
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Validation error response (400 Bad Request)
   * @param reply FastifyReply object
   * @param message Error message
   * @param errors Validation error details
   * @param code Response code (default 400 = validation error)
   */
  static async validationError(
    reply: FastifyReply,
    message: string = 'Validation failed',
    errors: Record<string, unknown> | null = null,
    code: number = 400,
  ): Promise<void> {
    await reply.status(400).send({
      success: false,
      resp_message: message,
      resp_code: code,
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Not found error response (404 Not Found)
   * @param reply FastifyReply object
   * @param message Error message
   * @param code Response code (default 404 = not found)
   */
  static async notFound(
    reply: FastifyReply,
    message: string = 'Resource not found',
    code: number = 404,
  ): Promise<void> {
    await reply.status(404).send({
      success: false,
      resp_message: message,
      resp_code: code,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Conflict error response (409 Conflict)
   * Used for duplicate resources or constraint violations
   * @param reply FastifyReply object
   * @param message Error message
   * @param code Response code (default 409 = conflict)
   */
  static async conflict(reply: FastifyReply, message: string = 'Resource conflict', code: number = 409): Promise<void> {
    await reply.status(409).send({
      success: false,
      resp_message: message,
      resp_code: code,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Unauthorized error response (401 Unauthorized)
   * @param reply FastifyReply object
   * @param message Error message
   * @param code Response code (default 401 = unauthorized)
   */
  static async unauthorized(reply: FastifyReply, message: string = 'Unauthorized', code: number = 401): Promise<void> {
    await reply.status(401).send({
      success: false,
      resp_message: message,
      resp_code: code,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Forbidden error response (403 Forbidden)
   * @param reply FastifyReply object
   * @param message Error message
   * @param code Response code (default 403 = forbidden)
   */
  static async forbidden(reply: FastifyReply, message: string = 'Forbidden', code: number = 403): Promise<void> {
    await reply.status(403).send({
      success: false,
      resp_message: message,
      resp_code: code,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Internal server error response (500)
   * @param reply FastifyReply object
   * @param message Error message
   * @param code Response code (default 500 = server error)
   */
  static async serverError(
    reply: FastifyReply,
    message: string = 'Internal server error',
    code: number = 500,
  ): Promise<void> {
    await reply.status(500).send({
      success: false,
      resp_message: message,
      resp_code: code,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Service unavailable error response (503)
   * Used for database connection issues, external service failures
   * @param reply FastifyReply object
   * @param message Error message
   * @param code Response code (default 503 = service unavailable)
   */
  static async serviceUnavailable(
    reply: FastifyReply,
    message: string = 'Service temporarily unavailable',
    code: number = 503,
  ): Promise<void> {
    await reply.status(503).send({
      success: false,
      resp_message: message,
      resp_code: code,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Format response with standard structure
   * @private
   */
  private static formatResponse<T>(success: boolean, message: string, code: number, data?: T): ApiResponse<T> {
    return {
      success,
      resp_message: message,
      resp_code: code,
      ...(data !== undefined && { data }),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Response code reference for API documentation
 */
export const ResponseCodes = {
  // Success (100-199)
  SUCCESS: 100,
  CREATED: 101,

  // Client errors (400-499)
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 400,

  // Server errors (500-599)
  SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,

  // Prisma/Database errors (170-179)
  UNIQUE_CONSTRAINT: 170,
  FOREIGN_KEY_CONSTRAINT: 171,
  INVALID_VALUE_LENGTH: 172,
  RESOURCE_NOT_FOUND: 173,
  INVALID_TRANSACTION: 174,
  PRISMA_ERROR: 175,
  PRISMA_VALIDATION: 176,
  PRISMA_INIT_ERROR: 177,
  PRISMA_UNKNOWN_ERROR: 178,
  PRISMA_PANIC: 179,
} as const;

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public emptyData: unknown = null,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string = 'Resource not found', emptyData: unknown = []) {
    super(404, message, emptyData);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string = 'Request invalid') {
    super(400, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string = 'Resource conflict') {
    super(409, message);
  }
}

export class ServerError extends HttpError {
  constructor(message: string = 'Server error') {
    super(500, message);
  }
}

// Type guard for response-like errors (e.g., axios errors)
interface ResponseError {
  response: {
    status: number;
    data?: {
      resp_msg?: string;
      data?: unknown;
    };
  };
  message?: string;
}

function isResponseError(err: unknown): err is ResponseError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as ResponseError).response === 'object' &&
    (err as ResponseError).response !== null &&
    typeof (err as ResponseError).response.status === 'number'
  );
}

// Type guard for errors with statusCode
interface StatusCodeError {
  statusCode: number;
  message?: string;
}

function isStatusCodeError(err: unknown): err is StatusCodeError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    typeof (err as StatusCodeError).statusCode === 'number'
  );
}

// Type guard for errors with message
function hasMessage(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: string }).message === 'string'
  );
}

export class ExceptionProcessor {
  private static handleResponseError(status: number, message: string, payload: unknown): never {
    if (status >= 400 && status < 500) {
      switch (status) {
        case 400:
          throw new BadRequestError(message);
        case 404:
          throw new NotFoundError(message, payload);
        case 409:
          throw new ConflictError(message);
        default:
          throw new HttpError(status, message, payload);
      }
    }

    if (status >= 500) {
      throw new ServerError(message);
    }

    throw new HttpError(status, message, payload);
  }

  private static handleStatusCodeError(statusCode: number, message: string): never {
    if (statusCode >= 400 && statusCode < 500) {
      switch (statusCode) {
        case 400:
          throw new BadRequestError(message);
        case 401:
          throw new HttpError(401, message);
        case 404:
          throw new NotFoundError(message);
        case 409:
          throw new ConflictError(message);
        default:
          throw new HttpError(statusCode, message);
      }
    }

    if (statusCode >= 500) {
      throw new ServerError(message);
    }

    throw new HttpError(statusCode, message);
  }

  static handle(err: unknown): never {
    if (isResponseError(err)) {
      const { status, data } = err.response;
      const message = data?.resp_msg ?? (hasMessage(err) ? err.message : 'Unexpected error');
      const payload = data ?? null;
      this.handleResponseError(status, message, payload);
    }

    if (isStatusCodeError(err)) {
      const message = hasMessage(err) ? err.message : 'Unexpected error';
      this.handleStatusCodeError(err.statusCode, message);
    }

    if (err instanceof HttpError) {
      throw err;
    }

    const errorMessage = hasMessage(err) ? err.message : 'Internal server error';
    throw new ServerError(errorMessage);
  }
}

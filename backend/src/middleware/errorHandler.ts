import { APIGatewayProxyResultV2 } from 'aws-lambda';
import { ApiResponseData, ApiErrorResponse } from '../types/api';

export const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code: string = 'HTTP_ERROR', details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, code: string = 'BAD_REQUEST', details?: unknown) {
    super(400, message, code, details);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string, code: string = 'UNAUTHORIZED', details?: unknown) {
    super(401, message, code, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string, code: string = 'FORBIDDEN', details?: unknown) {
    super(403, message, code, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string, code: string = 'NOT_FOUND', details?: unknown) {
    super(404, message, code, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor(message: string, code: string = 'CONFLICT', details?: unknown) {
    super(409, message, code, details);
    this.name = 'ConflictError';
  }
}

export class QuotaExceededError extends HttpError {
  constructor(message: string, code: string = 'QUOTA_EXCEEDED', details?: unknown) {
    super(409, message, code, details);
    this.name = 'QuotaExceededError';
  }
}

export function formatSuccessResponse(statusCode: number, data: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { ...CORS_HEADERS },
    body: typeof data === 'string' ? data : JSON.stringify(data),
  };
}

export function formatErrorResponse(error: unknown): APIGatewayProxyResultV2 {
  if (error instanceof HttpError) {
    const errorBody: ApiErrorResponse = {
      error: error.message,
      code: error.code,
      details: error.details,
    };
    return {
      statusCode: error.statusCode,
      headers: { ...CORS_HEADERS },
      body: JSON.stringify(errorBody),
    };
  }

  const genericMsg = error instanceof Error ? error.message : 'Internal server error occurred';
  const errorBody: ApiErrorResponse = {
    error: genericMsg,
    code: 'INTERNAL_SERVER_ERROR',
  };
  return {
    statusCode: 500,
    headers: { ...CORS_HEADERS },
    body: JSON.stringify(errorBody),
  };
}

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { AuthenticatedUser } from './auth';
import { OrgMemberItem } from './database';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

export interface ApiRequest {
  method: HttpMethod;
  rawPath: string;
  pathParameters: Record<string, string>;
  queryStringParameters: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  rawBody?: string;
  user?: AuthenticatedUser;
  member?: OrgMemberItem;
  rawEvent: APIGatewayProxyEventV2;
}

export interface ApiResponseData {
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

export type RouteHandler = (req: ApiRequest) => Promise<ApiResponseData | APIGatewayProxyResultV2>;
export type Middleware = (req: ApiRequest) => Promise<ApiResponseData | void>;

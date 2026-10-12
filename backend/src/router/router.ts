import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  ApiRequest,
  HttpMethod,
  Middleware,
  RouteHandler,
  ApiResponseData,
} from '../types/api';
import {
  formatSuccessResponse,
  formatErrorResponse,
  NotFoundError,
  CORS_HEADERS,
} from '../middleware/errorHandler';

interface RouteDefinition {
  method: HttpMethod;
  pathPattern: string;
  regex: RegExp;
  paramNames: string[];
  middlewares: Middleware[];
  handler: RouteHandler;
}

export class Router {
  private routes: RouteDefinition[] = [];

  /**
   * Registers a route with method, path, and middleware/handler chain
   */
  public register(
    method: HttpMethod,
    pathPattern: string,
    ...chain: (Middleware | RouteHandler)[]
  ): void {
    if (chain.length === 0) {
      throw new Error(`Route ${method} ${pathPattern} has no handler.`);
    }

    const handler = chain[chain.length - 1] as RouteHandler;
    const middlewares = chain.slice(0, chain.length - 1) as Middleware[];

    // Convert path pattern with :param into regex and extract param names
    const paramNames: string[] = [];
    const normalizedPattern = pathPattern.replace(/\/+$/, '') || '/';
    const regexPattern = normalizedPattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexPattern}$`);

    this.routes.push({
      method,
      pathPattern: normalizedPattern,
      regex,
      paramNames,
      middlewares,
      handler,
    });
  }

  public get(path: string, ...chain: (Middleware | RouteHandler)[]): void {
    this.register('GET', path, ...chain);
  }

  public post(path: string, ...chain: (Middleware | RouteHandler)[]): void {
    this.register('POST', path, ...chain);
  }

  public put(path: string, ...chain: (Middleware | RouteHandler)[]): void {
    this.register('PUT', path, ...chain);
  }

  public delete(path: string, ...chain: (Middleware | RouteHandler)[]): void {
    this.register('DELETE', path, ...chain);
  }

  public patch(path: string, ...chain: (Middleware | RouteHandler)[]): void {
    this.register('PATCH', path, ...chain);
  }

  /**
   * Dispatches an APIGatewayProxyEventV2 through matching route and middlewares
   */
  public async handle(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    const httpMethod = (event.requestContext?.http?.method || 'GET').toUpperCase() as HttpMethod;
    const rawPath = (event.rawPath || '/').replace(/\/+$/, '') || '/';

    // Automatic CORS Preflight Handling
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS },
        body: '',
      };
    }

    // Match route
    let matchedRoute: RouteDefinition | null = null;
    let pathParams: Record<string, string> = {};

    for (const route of this.routes) {
      if (route.method !== httpMethod) continue;
      const match = rawPath.match(route.regex);
      if (match) {
        matchedRoute = route;
        route.paramNames.forEach((name, index) => {
          pathParams[name] = decodeURIComponent(match[index + 1]);
        });
        break;
      }
    }

    if (!matchedRoute) {
      return formatErrorResponse(
        new NotFoundError(`Cannot ${httpMethod} ${rawPath}`, 'ROUTE_NOT_FOUND')
      );
    }

    // Parse body if present
    let parsedBody: unknown = null;
    if (event.body) {
      try {
        const rawBody = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body;
        parsedBody = JSON.parse(rawBody);
      } catch {
        parsedBody = event.body;
      }
    }

    // Build ApiRequest
    const req: ApiRequest = {
      method: httpMethod,
      rawPath,
      pathParameters: pathParams,
      queryStringParameters: (event.queryStringParameters as Record<string, string>) || {},
      headers: (event.headers as Record<string, string>) || {},
      body: parsedBody,
      rawBody: event.body,
      rawEvent: event,
    };

    try {
      // Execute middlewares in order
      for (const middleware of matchedRoute.middlewares) {
        const res = await middleware(req);
        if (res) {
          // Middleware returned an early response
          return formatSuccessResponse(res.statusCode, res.body);
        }
      }

      // Execute route handler
      const result = await matchedRoute.handler(req);

      // If handler returned full APIGatewayProxyResultV2
      if (typeof result === 'object' && result !== null && 'statusCode' in result) {
        const resData = result as ApiResponseData;
        return formatSuccessResponse(resData.statusCode, resData.body);
      }

      return formatSuccessResponse(200, result);
    } catch (err) {
      return formatErrorResponse(err);
    }
  }
}

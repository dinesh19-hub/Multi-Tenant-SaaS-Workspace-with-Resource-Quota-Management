import { describe, it, expect } from 'vitest';
import { Router } from '../src/router/router';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeEvent(
  method: string,
  rawPath: string,
  body?: string,
  headers: Record<string, string> = {}
): APIGatewayProxyEventV2 {
  return {
    rawPath,
    headers,
    body,
    isBase64Encoded: false,
    requestContext: {
      http: { method },
    },
  } as unknown as APIGatewayProxyEventV2;
}

describe('Router & Request Dispatching', () => {
  it('registers and matches GET routes with path parameters', async () => {
    const router = new Router();
    router.get('/api/v1/organizations/:orgId/projects/:projectId', async (req) => {
      return {
        statusCode: 200,
        body: {
          orgId: req.pathParameters.orgId,
          projectId: req.pathParameters.projectId,
        },
      };
    });

    const event = makeEvent('GET', '/api/v1/organizations/org-456/projects/proj-789');
    const response = (await router.handle(event)) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.orgId).toBe('org-456');
    expect(data.projectId).toBe('proj-789');
  });

  it('handles automatic OPTIONS CORS preflight', async () => {
    const router = new Router();
    const event = makeEvent('OPTIONS', '/api/v1/any/endpoint');
    const response = (await router.handle(event)) as {
      statusCode: number;
      headers: Record<string, string>;
    };

    expect(response.statusCode).toBe(200);
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Access-Control-Allow-Methods']).toContain('GET');
  });

  it('returns 404 with structured error response for unregistered routes', async () => {
    const router = new Router();
    const event = makeEvent('GET', '/api/v1/nonexistent');
    const response = (await router.handle(event)) as { statusCode: number; body: string };

    expect(response.statusCode).toBe(404);
    const err = JSON.parse(response.body);
    expect(err.code).toBe('ROUTE_NOT_FOUND');
    expect(err.error).toContain('Cannot GET /api/v1/nonexistent');
  });

  it('executes middleware chain and parses JSON request bodies', async () => {
    const router = new Router();
    let middlewareExecuted = false;

    const sampleMiddleware = async () => {
      middlewareExecuted = true;
    };

    router.post('/api/v1/items', sampleMiddleware, async (req) => {
      return {
        statusCode: 201,
        body: { received: req.body },
      };
    });

    const event = makeEvent('POST', '/api/v1/items', JSON.stringify({ name: 'Alpha' }));
    const response = (await router.handle(event)) as { statusCode: number; body: string };

    expect(middlewareExecuted).toBe(true);
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.received.name).toBe('Alpha');
  });
});

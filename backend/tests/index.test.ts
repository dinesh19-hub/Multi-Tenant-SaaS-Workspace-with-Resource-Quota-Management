import { describe, it, expect } from 'vitest';
import { handler } from '../src/index';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

describe('Lambda API Entry Handler', () => {
  it('should return 200 with initialized message', async () => {
    const mockEvent = {
      version: '2.0',
      routeKey: '$default',
      rawPath: '/api/v1/health',
      rawQueryString: '',
      headers: {},
      requestContext: {
        http: {
          method: 'GET',
          path: '/api/v1/health',
          protocol: 'HTTP/1.1',
          sourceIp: '127.0.0.1',
          userAgent: 'vitest',
        },
      },
      isBase64Encoded: false,
    } as unknown as APIGatewayProxyEventV2;

    const result = await handler(mockEvent);
    expect(result).toBeDefined();
    if (typeof result === 'object' && result !== null && 'statusCode' in result) {
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.message).toContain('Multi-Tenant SaaS Workspace API initialized');
    }
  });
});

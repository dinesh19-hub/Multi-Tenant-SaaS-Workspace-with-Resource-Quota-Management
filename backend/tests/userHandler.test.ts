import { describe, it, expect } from 'vitest';
import { handler } from '../src/index';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

describe('User Handler & Lambda End-to-End API', () => {
  it('returns health check status', async () => {
    const event = {
      rawPath: '/health',
      requestContext: { http: { method: 'GET' } },
      headers: {},
    } as unknown as APIGatewayProxyEventV2;

    const res = (await handler(event)) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('healthy');
  });

  it('returns 401 when GET /api/v1/users/profile has no authorization', async () => {
    const event = {
      rawPath: '/api/v1/users/profile',
      requestContext: { http: { method: 'GET' } },
      headers: {},
    } as unknown as APIGatewayProxyEventV2;

    const res = (await handler(event)) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns user profile when invoked with valid authorizer claims', async () => {
    const event = {
      rawPath: '/api/v1/users/profile',
      requestContext: {
        http: { method: 'GET' },
        authorizer: {
          jwt: {
            claims: {
              sub: 'usr-cognito-001',
              email: 'verified.user@cloud.com',
              email_verified: 'true',
              token_use: 'id',
              iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_mock',
              aud: 'client-001',
            },
          },
        },
      },
      headers: {},
    } as unknown as APIGatewayProxyEventV2;

    const res = (await handler(event)) as { statusCode: number; body: string };
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.userId).toBe('usr-cognito-001');
    expect(body.email).toBe('verified.user@cloud.com');
    expect(body.emailVerified).toBe(true);
    expect(body.claims.tokenUse).toBe('id');
  });
});

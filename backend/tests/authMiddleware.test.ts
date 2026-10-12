import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  extractClaimsFromRequest,
  validateCognitoClaims,
  authMiddleware,
} from '../src/middleware/authMiddleware';
import { ApiRequest } from '../src/types/api';
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { UnauthorizedError, ForbiddenError } from '../src/middleware/errorHandler';

function createMockRequest(
  options: {
    rawPath?: string;
    authHeader?: string;
    authorizerClaims?: Record<string, unknown>;
  } = {}
): ApiRequest {
  const rawPath = options.rawPath || '/api/v1/organizations';
  const headers: Record<string, string> = {};
  if (options.authHeader) {
    headers['authorization'] = options.authHeader;
  }

  const rawEvent = {
    rawPath,
    headers,
    requestContext: {
      http: { method: 'GET' },
      authorizer: options.authorizerClaims
        ? {
            jwt: {
              claims: options.authorizerClaims,
            },
          }
        : undefined,
    },
  } as unknown as APIGatewayProxyEventV2;

  return {
    method: 'GET',
    rawPath,
    pathParameters: {},
    queryStringParameters: {},
    headers,
    body: null,
    rawEvent,
  };
}

describe('Auth Middleware & Cognito JWT Claims Verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.COGNITO_USER_POOL_ID = 'us-east-1_testPool';
    process.env.COGNITO_CLIENT_ID = 'testClientId123';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('successfully extracts and validates claims from API Gateway authorizer context', async () => {
    const req = createMockRequest({
      authorizerClaims: {
        sub: 'usr-12345',
        email: 'alice@example.com',
        email_verified: 'true',
        token_use: 'id',
        iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testPool',
        aud: 'testClientId123',
      },
    });

    await authMiddleware(req);
    expect(req.user).toBeDefined();
    expect(req.user?.userId).toBe('usr-12345');
    expect(req.user?.email).toBe('alice@example.com');
    expect(req.user?.emailVerified).toBe(true);
  });

  it('rejects request with missing token / claims', () => {
    const req = createMockRequest();
    expect(() => validateCognitoClaims(null, req.rawPath)).toThrowError(UnauthorizedError);
    expect(() => validateCognitoClaims(null, req.rawPath)).toThrowError(/Missing or invalid authentication token/);
  });

  it('rejects access tokens where token_use is "access"', () => {
    const claims = {
      sub: 'usr-12345',
      email: 'alice@example.com',
      email_verified: 'true',
      token_use: 'access',
    };

    expect(() => validateCognitoClaims(claims, '/api/v1/projects')).toThrowError(
      new UnauthorizedError(
        'Invalid token_use claim. Only Cognito ID tokens are accepted for API operations.',
        'INVALID_TOKEN_USE'
      )
    );
  });

  it('rejects token with mismatched issuer', () => {
    const claims = {
      sub: 'usr-12345',
      email: 'alice@example.com',
      email_verified: 'true',
      token_use: 'id',
      iss: 'https://cognito-idp.us-east-1.amazonaws.com/wrong_pool',
      aud: 'testClientId123',
    };

    expect(() => validateCognitoClaims(claims, '/api/v1/projects')).toThrowError(
      new UnauthorizedError(
        'Token issuer does not match configured Cognito User Pool.',
        'INVALID_TOKEN_ISSUER'
      )
    );
  });

  it('rejects token with mismatched audience', () => {
    const claims = {
      sub: 'usr-12345',
      email: 'alice@example.com',
      email_verified: 'true',
      token_use: 'id',
      iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testPool',
      aud: 'wrong_client_id',
    };

    expect(() => validateCognitoClaims(claims, '/api/v1/projects')).toThrowError(
      new UnauthorizedError(
        'Token audience does not match configured Cognito App Client.',
        'INVALID_TOKEN_AUDIENCE'
      )
    );
  });

  it('rejects token missing sub or email claims', () => {
    const missingSub = {
      sub: '',
      email: 'alice@example.com',
      email_verified: 'true',
      token_use: 'id',
    };
    expect(() => validateCognitoClaims(missingSub, '/api/v1/projects')).toThrowError(
      /Missing required sub/
    );

    const missingEmail = {
      sub: 'usr-12345',
      email: '',
      email_verified: 'true',
      token_use: 'id',
    };
    expect(() => validateCognitoClaims(missingEmail, '/api/v1/projects')).toThrowError(
      /Missing required email/
    );
  });

  it('enforces email verification on normal routes', () => {
    const unverifiedClaims = {
      sub: 'usr-12345',
      email: 'unconfirmed@example.com',
      email_verified: 'false',
      token_use: 'id',
    };

    expect(() => validateCognitoClaims(unverifiedClaims, '/api/v1/organizations')).toThrowError(
      ForbiddenError
    );
  });

  it('exempts /api/v1/users/profile from email verification check', () => {
    const unverifiedClaims = {
      sub: 'usr-12345',
      email: 'unconfirmed@example.com',
      email_verified: false,
      token_use: 'id',
    };

    const user = validateCognitoClaims(unverifiedClaims, '/api/v1/users/profile');
    expect(user.userId).toBe('usr-12345');
    expect(user.emailVerified).toBe(false);
  });

  it('parses base64 JWT payload from Authorization Bearer header fallback', () => {
    const payload = {
      sub: 'usr-jwt-999',
      email: 'bearer@example.com',
      email_verified: 'true',
      token_use: 'id',
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const fakeJwt = `header.${b64}.signature`;

    const req = createMockRequest({
      authHeader: `Bearer ${fakeJwt}`,
    });

    const claims = extractClaimsFromRequest(req);
    expect(claims?.sub).toBe('usr-jwt-999');
    expect(claims?.email).toBe('bearer@example.com');
  });
});

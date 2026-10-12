import { ApiRequest } from '../types/api';
import { CognitoJwtClaims, AuthenticatedUser } from '../types/auth';
import { UnauthorizedError, ForbiddenError } from './errorHandler';

/**
 * Routes that do not require email to be verified
 */
const EMAIL_VERIFICATION_EXEMPT_ROUTES = [
  '/api/v1/users/profile',
  '/health',
];

/**
 * Extracts raw claims from either API Gateway JWT authorizer context or Authorization header
 */
export function extractClaimsFromRequest(req: ApiRequest): CognitoJwtClaims | null {
  // 1. Production API Gateway HTTP API v2 native JWT authorizer
  const authorizerClaims = (req.rawEvent.requestContext as unknown as {
    authorizer?: {
      jwt?: {
        claims?: Record<string, unknown>;
      };
    };
  })?.authorizer?.jwt?.claims;

  if (authorizerClaims && typeof authorizerClaims === 'object') {
    return authorizerClaims as unknown as CognitoJwtClaims;
  }

  // 2. Authorization header fallback (for local development, integration, and unit tests)
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  const token = parts[1];

  // Try decoding base64 JWT payload if 3-part token
  const tokenParts = token.split('.');
  if (tokenParts.length === 3) {
    try {
      const payloadBase64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = Buffer.from(payloadBase64, 'base64').toString('utf8');
      return JSON.parse(json) as CognitoJwtClaims;
    } catch {
      // Continue to check mock formats
    }
  }

  // Check JSON string directly (e.g. from tests)
  try {
    const parsed = JSON.parse(token);
    if (parsed && typeof parsed === 'object') {
      return parsed as CognitoJwtClaims;
    }
  } catch {
    // Continue
  }

  // Check mock token pattern: mock-jwt-token-<userId>
  if (token.startsWith('mock-jwt-token-')) {
    const rawUserId = token.replace('mock-jwt-token-', '');
    return {
      sub: rawUserId,
      email: rawUserId.includes('@') ? rawUserId : `${rawUserId}@mock.com`,
      email_verified: 'true',
      token_use: 'id',
      iss: process.env.COGNITO_USER_POOL_ID
        ? `https://cognito-idp.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
        : 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_mockPoolId',
      aud: process.env.COGNITO_CLIENT_ID || 'mockClientId',
    };
  }

  return null;
}

/**
 * Validates Cognito JWT claims per Implementation Plan v1.4 specification
 */
export function validateCognitoClaims(
  claims: CognitoJwtClaims | null,
  rawPath: string
): AuthenticatedUser {
  if (!claims) {
    throw new UnauthorizedError(
      'Missing or invalid authentication token. A valid Cognito ID token is required.',
      'UNAUTHORIZED'
    );
  }

  // 1. Mandatory token_use validation: MUST BE 'id'
  if (claims.token_use !== 'id') {
    throw new UnauthorizedError(
      'Invalid token_use claim. Only Cognito ID tokens are accepted for API operations.',
      'INVALID_TOKEN_USE'
    );
  }

  // 2. Issuer validation (when environment is configured)
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const region = process.env.AWS_REGION || 'us-east-1';
  if (userPoolId && claims.iss) {
    const expectedIss = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    if (claims.iss !== expectedIss) {
      throw new UnauthorizedError(
        'Token issuer does not match configured Cognito User Pool.',
        'INVALID_TOKEN_ISSUER'
      );
    }
  }

  // 3. Audience validation (when environment is configured)
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (clientId && claims.aud) {
    if (claims.aud !== clientId) {
      throw new UnauthorizedError(
        'Token audience does not match configured Cognito App Client.',
        'INVALID_TOKEN_AUDIENCE'
      );
    }
  }

  // 4. Subject (sub) validation
  if (!claims.sub || typeof claims.sub !== 'string' || claims.sub.trim() === '') {
    throw new UnauthorizedError(
      'Missing required sub (subject) claim in authentication token.',
      'MISSING_REQUIRED_CLAIMS'
    );
  }

  // 5. Email claim validation
  if (!claims.email || typeof claims.email !== 'string' || !claims.email.includes('@')) {
    throw new UnauthorizedError(
      'Missing required email claim in authentication token.',
      'MISSING_REQUIRED_CLAIMS'
    );
  }

  // 6. Email verification status
  const isEmailVerified = claims.email_verified === true || claims.email_verified === 'true';
  const isExempt = EMAIL_VERIFICATION_EXEMPT_ROUTES.some((exemptPath) =>
    rawPath.startsWith(exemptPath)
  );

  if (!isEmailVerified && !isExempt) {
    throw new ForbiddenError(
      'Email address must be confirmed before performing workspace operations.',
      'EMAIL_NOT_VERIFIED'
    );
  }

  return {
    userId: claims.sub,
    email: claims.email,
    emailVerified: isEmailVerified,
    claims,
  };
}

/**
 * Authentication Middleware: enforces token validation and binds user to request
 */
export async function authMiddleware(req: ApiRequest): Promise<void> {
  const claims = extractClaimsFromRequest(req);
  req.user = validateCognitoClaims(claims, req.rawPath);
}

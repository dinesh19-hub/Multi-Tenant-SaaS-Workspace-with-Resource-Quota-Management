export interface CognitoJwtClaims {
  sub: string;
  email: string;
  email_verified: boolean | string;
  token_use: 'id' | 'access' | string;
  iss?: string;
  aud?: string;
  'cognito:username'?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  emailVerified: boolean;
  claims: CognitoJwtClaims;
}

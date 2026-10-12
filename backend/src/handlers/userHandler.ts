import { ApiRequest, ApiResponseData } from '../types/api';
import { UnauthorizedError } from '../middleware/errorHandler';

/**
 * Handles GET /api/v1/users/profile
 * Returns authenticated user details and email verification status
 */
export async function getUserProfileHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  return {
    statusCode: 200,
    body: {
      userId: req.user.userId,
      email: req.user.email,
      emailVerified: req.user.emailVerified,
      claims: {
        iss: req.user.claims.iss,
        aud: req.user.claims.aud,
        tokenUse: req.user.claims.token_use,
      },
    },
  };
}

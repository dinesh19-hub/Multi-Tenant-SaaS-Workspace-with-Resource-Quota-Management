import { ApiRequest } from '../types/api';
import { DynamoRepository } from '../services/dynamoRepository';
import { OrgMemberItem } from '../types/database';
import { BadRequestError, UnauthorizedError, ForbiddenError } from './errorHandler';

const repo = new DynamoRepository();

/**
 * Middleware verifying that the authenticated user is a verified member of the requested organization
 */
export async function requireTenantMember(req: ApiRequest): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const orgId = req.pathParameters.orgId;
  if (!orgId) {
    throw new BadRequestError('Organization ID is missing in request path.', 'MISSING_ORG_ID');
  }

  const memberRes = await repo.getItem<OrgMemberItem>({
    Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${req.user.userId}` },
  });

  if (!memberRes.Item) {
    throw new ForbiddenError(
      'You are not a member of this organization.',
      'NOT_A_MEMBER'
    );
  }

  req.member = memberRes.Item;
}

/**
 * Middleware verifying that the authenticated user holds the ADMIN role in the requested organization
 */
export async function requireTenantAdmin(req: ApiRequest): Promise<void> {
  await requireTenantMember(req);

  if (req.member?.role !== 'ADMIN') {
    throw new ForbiddenError(
      'Administrator permissions are required for this action.',
      'ADMIN_REQUIRED'
    );
  }
}

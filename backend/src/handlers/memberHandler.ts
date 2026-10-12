import { ApiRequest, ApiResponseData } from '../types/api';
import { DynamoRepository } from '../services/dynamoRepository';
import { QuotaService } from '../services/quotaService';
import { AuditService } from '../services/auditService';
import { OrgMemberItem, MemberRole } from '../types/database';
import { BadRequestError, UnauthorizedError, ForbiddenError } from '../middleware/errorHandler';

const repo = new DynamoRepository();
const quotaService = new QuotaService(repo);
const auditService = new AuditService(repo);

/**
 * GET /api/v1/organizations/:orgId/members
 * Lists all active members of an organization
 */
export async function listMembersHandler(req: ApiRequest): Promise<ApiResponseData> {
  const orgId = req.pathParameters.orgId;

  const res = await repo.query<OrgMemberItem>({
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
  });

  const members = res.Items
    .filter((item) => (item.SK as string)?.startsWith('MEMBER#'))
    .map((item) => ({
      userId: item.userId,
      email: item.email,
      role: item.role,
      joinedAt: item.joinedAt,
    }));

  return {
    statusCode: 200,
    body: {
      members,
      totalCount: members.length,
    },
  };
}

/**
 * PATCH /api/v1/organizations/:orgId/members/:userId
 * Updates a member's role (Promote to Admin or Demote to Member)
 * Requires ADMIN permissions and enforces Last-Admin Protection
 */
export async function updateMemberRoleHandler(req: ApiRequest): Promise<ApiResponseData> {
  const orgId = req.pathParameters.orgId;
  const targetUserId = req.pathParameters.userId;

  if (!targetUserId) {
    throw new BadRequestError('Target userId is required.', 'INVALID_PARAMETERS');
  }

  const body = req.body as { role?: MemberRole };
  if (!body || !body.role || (body.role !== 'ADMIN' && body.role !== 'MEMBER')) {
    throw new BadRequestError('Valid role (ADMIN or MEMBER) is required.', 'INVALID_ROLE');
  }

  await quotaService.updateMemberRole({
    orgId,
    userId: targetUserId,
    newRole: body.role,
  });

  // Record audit log for successful role update
  if (req.user) {
    await auditService.recordEvent({
      orgId,
      action: 'MEMBER_ROLE_UPDATED',
      actorUserId: req.user.userId,
      actorEmail: req.user.email,
      targetId: targetUserId,
      targetType: 'MEMBER',
      details: {
        newRole: body.role,
      },
    });
  }

  return {
    statusCode: 200,
    body: {
      message: `Member role updated to ${body.role} successfully.`,
      userId: targetUserId,
      role: body.role,
    },
  };
}

/**
 * DELETE /api/v1/organizations/:orgId/members/:userId
 * Removes a member from the organization or enables self-leave
 * Enforces Last-Admin Protection and Sole-Member Protection
 */
export async function removeMemberHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user || !req.member) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const orgId = req.pathParameters.orgId;
  const targetUserId = req.pathParameters.userId;

  if (!targetUserId) {
    throw new BadRequestError('Target userId is required.', 'INVALID_PARAMETERS');
  }

  // Permission check: Self-leave is permitted; removing others requires ADMIN role
  const isSelf = req.user.userId === targetUserId;
  if (!isSelf && req.member.role !== 'ADMIN') {
    throw new ForbiddenError(
      'Only administrators can remove other members from the organization.',
      'ADMIN_REQUIRED'
    );
  }

  await quotaService.removeMember({
    orgId,
    userId: targetUserId,
  });

  // Record audit log for successful member removal
  await auditService.recordEvent({
    orgId,
    action: 'MEMBER_REMOVED',
    actorUserId: req.user.userId,
    actorEmail: req.user.email,
    targetId: targetUserId,
    targetType: 'MEMBER',
    details: {
      isSelf,
    },
  });

  return {
    statusCode: 200,
    body: {
      message: isSelf
        ? 'You have left the organization.'
        : 'Member has been removed from the organization.',
      userId: targetUserId,
    },
  };
}

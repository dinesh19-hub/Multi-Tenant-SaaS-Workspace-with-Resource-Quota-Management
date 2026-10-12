import { ApiRequest, ApiResponseData } from '../types/api';
import { DynamoRepository } from '../services/dynamoRepository';
import { QuotaService } from '../services/quotaService';
import { OrgDeleteService } from '../services/orgDeleteService';
import { InviteService } from '../services/inviteService';
import { WorkspaceTier, OrgMemberItem, OrgMetadataItem } from '../types/database';
import { BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';

const repo = new DynamoRepository();
const quotaService = new QuotaService(repo);
const deleteService = new OrgDeleteService(repo);
const inviteService = new InviteService(repo, quotaService);

/**
 * POST /api/v1/organizations
 * Creates a new organization with the requesting user as owner and Admin
 */
export async function createOrgHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const body = req.body as { name?: string; tier?: WorkspaceTier };
  if (!body || !body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new BadRequestError('Organization name is required.', 'VALIDATION_ERROR');
  }

  const tier: WorkspaceTier = body.tier || 'FREE';
  const org = await quotaService.createOrganization({
    name: body.name.trim(),
    tier,
    ownerUserId: req.user.userId,
    ownerEmail: req.user.email,
  });

  return {
    statusCode: 201,
    body: org,
  };
}

/**
 * GET /api/v1/organizations
 * Lists all organizations that the authenticated user belongs to
 */
export async function listOrgsHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  // Query GSI1 for user memberships
  const res = await repo.query<OrgMemberItem>({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :userKey',
    ExpressionAttributeValues: {
      ':userKey': `USER#${req.user.userId}`,
    },
  });

  const memberships = res.Items.filter((item) => (item.SK as string)?.startsWith('MEMBER#'));

  // Fetch metadata for each organization
  const orgsWithDetails = await Promise.all(
    memberships.map(async (m) => {
      const meta = await quotaService.getOrgMetadata(m.orgId);
      if (!meta || meta.status === 'DELETING') return null;
      return {
        orgId: meta.orgId,
        name: meta.name,
        tier: meta.tier,
        role: m.role,
        projectCount: meta.projectCount,
        maxProjects: meta.maxProjects,
        memberCount: meta.memberCount,
        maxMembers: meta.maxMembers,
        createdAt: meta.createdAt,
      };
    })
  );

  return {
    statusCode: 200,
    body: {
      organizations: orgsWithDetails.filter(Boolean),
    },
  };
}

/**
 * GET /api/v1/organizations/:orgId
 * Fetches organization details for a verified member
 */
export async function getOrgHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const orgId = req.pathParameters.orgId;
  if (!orgId) {
    throw new BadRequestError('Missing orgId parameter.', 'INVALID_PARAMETERS');
  }

  // Verify membership
  const member = await repo.getItem<OrgMemberItem>({
    Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${req.user.userId}` },
  });
  if (!member.Item) {
    throw new ForbiddenError('You are not a member of this organization.', 'NOT_A_MEMBER');
  }

  const meta = await quotaService.getOrgMetadata(orgId);
  if (!meta) {
    throw new NotFoundError('Organization not found.', 'ORG_NOT_FOUND');
  }

  return {
    statusCode: 200,
    body: {
      ...meta,
      userRole: member.Item.role,
    },
  };
}

/**
 * DELETE /api/v1/organizations/:orgId
 * Executes the 7-step resumable organization deletion workflow
 */
export async function deleteOrgHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const orgId = req.pathParameters.orgId;
  if (!orgId) {
    throw new BadRequestError('Missing orgId parameter.', 'INVALID_PARAMETERS');
  }

  const result = await deleteService.deleteOrganization(orgId, req.user.userId);

  return {
    statusCode: 200,
    body: {
      message: 'Organization deleted successfully.',
      details: result,
    },
  };
}

/**
 * POST /api/v1/organizations/:orgId/invites
 * Creates an invitation link/code (Admin only)
 */
export async function createInviteHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const orgId = req.pathParameters.orgId;
  const member = await repo.getItem<OrgMemberItem>({
    Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${req.user.userId}` },
  });
  if (!member.Item || member.Item.role !== 'ADMIN') {
    throw new ForbiddenError('Only administrators can generate invites.', 'ADMIN_REQUIRED');
  }

  const body = (req.body as { role?: 'ADMIN' | 'MEMBER'; maxUses?: number }) || {};
  const invite = await inviteService.createInvite({
    orgId,
    createdByUserId: req.user.userId,
    role: body.role || 'MEMBER',
    maxUses: body.maxUses || 1,
  });

  return {
    statusCode: 201,
    body: invite,
  };
}

/**
 * POST /api/v1/organizations/join
 * Redeems an invite code to join an organization
 */
export async function joinOrgHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const body = req.body as { inviteCode?: string };
  if (!body || !body.inviteCode) {
    throw new BadRequestError('Invite code is required.', 'MISSING_INVITE_CODE');
  }

  const joined = await inviteService.redeemInvite({
    inviteCode: body.inviteCode.trim(),
    userId: req.user.userId,
    email: req.user.email,
  });

  return {
    statusCode: 200,
    body: {
      message: 'Successfully joined organization.',
      orgId: joined.orgId,
      role: joined.role,
    },
  };
}

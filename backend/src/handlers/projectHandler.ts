import { ApiRequest, ApiResponseData } from '../types/api';
import { DynamoRepository } from '../services/dynamoRepository';
import { QuotaService } from '../services/quotaService';
import { AuditService } from '../services/auditService';
import { OrgProjectItem } from '../types/database';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from '../middleware/errorHandler';

const repo = new DynamoRepository();
const quotaService = new QuotaService(repo);
const auditService = new AuditService(repo);

/**
 * POST /api/v1/organizations/:orgId/projects
 * Creates a new project in the organization under atomic quota enforcement
 */
export async function createProjectHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user || !req.member) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const orgId = req.pathParameters.orgId;
  const body = req.body as { name?: string; description?: string };

  if (!body || !body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new BadRequestError('Project name is required.', 'VALIDATION_ERROR');
  }

  const project = await quotaService.createProject({
    orgId,
    name: body.name.trim(),
    description: body.description?.trim() || '',
    userId: req.user.userId,
    userEmail: req.user.email,
  });

  // Record audit log
  await auditService.recordEvent({
    orgId,
    action: 'PROJECT_CREATED',
    actorUserId: req.user.userId,
    actorEmail: req.user.email,
    targetId: project.projectId,
    targetType: 'PROJECT',
    details: { name: project.name },
  });

  return {
    statusCode: 201,
    body: project,
  };
}

/**
 * GET /api/v1/organizations/:orgId/projects
 * Lists all projects in the organization
 */
export async function listProjectsHandler(req: ApiRequest): Promise<ApiResponseData> {
  const orgId = req.pathParameters.orgId;

  const res = await repo.query<OrgProjectItem>({
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
  });

  const projects = res.Items
    .filter((item) => (item.SK as string)?.startsWith('PROJECT#'))
    .map((p) => ({
      projectId: p.projectId,
      name: p.name,
      description: p.description,
      createdBy: p.createdBy,
      creatorEmail: p.creatorEmail,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

  return {
    statusCode: 200,
    body: {
      projects,
      totalCount: projects.length,
    },
  };
}

/**
 * GET /api/v1/organizations/:orgId/projects/:projectId
 * Gets details for a specific project
 */
export async function getProjectHandler(req: ApiRequest): Promise<ApiResponseData> {
  const orgId = req.pathParameters.orgId;
  const projectId = req.pathParameters.projectId;

  const res = await repo.getItem<OrgProjectItem>({
    Key: { PK: `ORG#${orgId}`, SK: `PROJECT#${projectId}` },
  });

  if (!res.Item) {
    throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND');
  }

  return {
    statusCode: 200,
    body: res.Item,
  };
}

/**
 * PUT /api/v1/organizations/:orgId/projects/:projectId
 * Updates project details (Allowed for Project Creator OR Organization Admin)
 */
export async function updateProjectHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user || !req.member) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const orgId = req.pathParameters.orgId;
  const projectId = req.pathParameters.projectId;

  const res = await repo.getItem<OrgProjectItem>({
    Key: { PK: `ORG#${orgId}`, SK: `PROJECT#${projectId}` },
  });

  if (!res.Item) {
    throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND');
  }

  // Authorization: Creator or Admin
  const isCreator = res.Item.createdBy === req.user.userId;
  const isAdmin = req.member.role === 'ADMIN';

  if (!isCreator && !isAdmin) {
    throw new ForbiddenError(
      'Only the project creator or an organization administrator can modify this project.',
      'FORBIDDEN'
    );
  }

  const body = req.body as { name?: string; description?: string };
  if (!body || !body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    throw new BadRequestError('Project name is required.', 'VALIDATION_ERROR');
  }

  const now = new Date().toISOString();
  const updatedRes = await repo.updateItem({
    Key: { PK: `ORG#${orgId}`, SK: `PROJECT#${projectId}` },
    UpdateExpression: 'SET #name = :name, #desc = :desc, #updatedAt = :now',
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeNames: {
      '#name': 'name',
      '#desc': 'description',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':name': body.name.trim(),
      ':desc': body.description?.trim() || '',
      ':now': now,
    },
  });

  return {
    statusCode: 200,
    body: updatedRes.Attributes,
  };
}

/**
 * DELETE /api/v1/organizations/:orgId/projects/:projectId
 * Deletes a project and reclaims quota slot (Allowed for Project Creator OR Organization Admin)
 */
export async function deleteProjectHandler(req: ApiRequest): Promise<ApiResponseData> {
  if (!req.user || !req.member) {
    throw new UnauthorizedError('User authentication context is missing.', 'UNAUTHORIZED');
  }

  const orgId = req.pathParameters.orgId;
  const projectId = req.pathParameters.projectId;

  const res = await repo.getItem<OrgProjectItem>({
    Key: { PK: `ORG#${orgId}`, SK: `PROJECT#${projectId}` },
  });

  if (!res.Item) {
    throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND');
  }

  // Authorization: Creator or Admin
  const isCreator = res.Item.createdBy === req.user.userId;
  const isAdmin = req.member.role === 'ADMIN';

  if (!isCreator && !isAdmin) {
    throw new ForbiddenError(
      'Only the project creator or an organization administrator can delete this project.',
      'FORBIDDEN'
    );
  }

  await quotaService.deleteProject({
    orgId,
    projectId,
  });

  // Record audit log
  await auditService.recordEvent({
    orgId,
    action: 'PROJECT_DELETED',
    actorUserId: req.user.userId,
    actorEmail: req.user.email,
    targetId: projectId,
    targetType: 'PROJECT',
  });

  return {
    statusCode: 200,
    body: {
      message: 'Project deleted successfully.',
      projectId,
    },
  };
}

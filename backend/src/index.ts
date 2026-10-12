import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { Router } from './router/router';
import { authMiddleware } from './middleware/authMiddleware';
import { requireTenantMember, requireTenantAdmin } from './middleware/tenantMiddleware';
import { getUserProfileHandler } from './handlers/userHandler';
import {
  createOrgHandler,
  listOrgsHandler,
  getOrgHandler,
  deleteOrgHandler,
  createInviteHandler,
  joinOrgHandler,
} from './handlers/orgHandler';
import {
  listMembersHandler,
  updateMemberRoleHandler,
  removeMemberHandler,
} from './handlers/memberHandler';
import {
  createProjectHandler,
  listProjectsHandler,
  getProjectHandler,
  updateProjectHandler,
  deleteProjectHandler,
} from './handlers/projectHandler';
import { getAnalyticsHandler } from './handlers/analyticsHandler';

export const appRouter = new Router();

// Health check endpoints
const healthHandler = async () => ({
  statusCode: 200,
  body: {
    status: 'healthy',
    message: 'Multi-Tenant SaaS Workspace API initialized',
    timestamp: new Date().toISOString(),
    service: 'multi-tenant-saas-backend',
  },
});

appRouter.get('/health', healthHandler);
appRouter.get('/api/v1/health', healthHandler);

// User Profile endpoint
appRouter.get('/api/v1/users/profile', authMiddleware, getUserProfileHandler);

// Organization Endpoints
appRouter.post('/api/v1/organizations', authMiddleware, createOrgHandler);
appRouter.get('/api/v1/organizations', authMiddleware, listOrgsHandler);
appRouter.get('/api/v1/organizations/:orgId', authMiddleware, getOrgHandler);
appRouter.delete('/api/v1/organizations/:orgId', authMiddleware, deleteOrgHandler);

// Invite & Membership Endpoints
appRouter.post('/api/v1/organizations/:orgId/invites', authMiddleware, createInviteHandler);
appRouter.post('/api/v1/organizations/join', authMiddleware, joinOrgHandler);

// Member Management Endpoints (RBAC)
appRouter.get('/api/v1/organizations/:orgId/members', authMiddleware, requireTenantMember, listMembersHandler);
appRouter.patch('/api/v1/organizations/:orgId/members/:userId', authMiddleware, requireTenantAdmin, updateMemberRoleHandler);
appRouter.delete('/api/v1/organizations/:orgId/members/:userId', authMiddleware, requireTenantMember, removeMemberHandler);

// Project Management Endpoints (Atomic Quotas & Creator vs Admin Rules)
appRouter.post('/api/v1/organizations/:orgId/projects', authMiddleware, requireTenantMember, createProjectHandler);
appRouter.get('/api/v1/organizations/:orgId/projects', authMiddleware, requireTenantMember, listProjectsHandler);
appRouter.get('/api/v1/organizations/:orgId/projects/:projectId', authMiddleware, requireTenantMember, getProjectHandler);
appRouter.put('/api/v1/organizations/:orgId/projects/:projectId', authMiddleware, requireTenantMember, updateProjectHandler);
appRouter.delete('/api/v1/organizations/:orgId/projects/:projectId', authMiddleware, requireTenantMember, deleteProjectHandler);

// Analytics & Audit Logging Endpoint
appRouter.get('/api/v1/organizations/:orgId/analytics', authMiddleware, requireTenantMember, getAnalyticsHandler);

/**
 * Main AWS Lambda handler entry point
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  return await appRouter.handle(event);
};

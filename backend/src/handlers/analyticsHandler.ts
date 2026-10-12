import { ApiRequest, ApiResponseData } from '../types/api';
import { DynamoRepository } from '../services/dynamoRepository';
import { QuotaService } from '../services/quotaService';
import { AuditService } from '../services/auditService';
import { NotFoundError } from '../middleware/errorHandler';

const repo = new DynamoRepository();
const quotaService = new QuotaService(repo);
const auditService = new AuditService(repo);

/**
 * GET /api/v1/organizations/:orgId/analytics
 * Returns comprehensive resource quota metrics and recent audit log events
 */
export async function getAnalyticsHandler(req: ApiRequest): Promise<ApiResponseData> {
  const orgId = req.pathParameters.orgId;

  const meta = await quotaService.getOrgMetadata(orgId);
  if (!meta) {
    throw new NotFoundError('Organization not found.', 'ORG_NOT_FOUND');
  }

  const auditLogs = await auditService.getAuditLogs(orgId);

  const projectUtilization = Math.min(
    100,
    Math.round(((meta.projectCount || 0) / (meta.maxProjects || 1)) * 100)
  );
  const memberUtilization = Math.min(
    100,
    Math.round(((meta.memberCount || 0) / (meta.maxMembers || 1)) * 100)
  );

  return {
    statusCode: 200,
    body: {
      quotas: {
        tier: meta.tier,
        projectCount: meta.projectCount,
        maxProjects: meta.maxProjects,
        projectUtilizationPercent: projectUtilization,
        memberCount: meta.memberCount,
        maxMembers: meta.maxMembers,
        memberUtilizationPercent: memberUtilization,
        adminCount: meta.adminCount,
      },
      auditLogs: auditLogs.map((log) => ({
        auditId: log.auditId,
        action: log.action,
        actorEmail: log.actorEmail,
        actorUserId: log.actorUserId,
        targetId: log.targetId,
        targetType: log.targetType,
        details: log.details,
        timestamp: log.timestamp,
      })),
    },
  };
}

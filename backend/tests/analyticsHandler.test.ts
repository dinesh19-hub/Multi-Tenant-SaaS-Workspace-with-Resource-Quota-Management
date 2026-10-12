import { describe, it, expect, beforeEach } from 'vitest';
import { handler } from '../src/index';
import { DynamoRepository } from '../src/services/dynamoRepository';
import { QuotaService } from '../src/services/quotaService';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeAuthEvent(
  method: string,
  rawPath: string,
  user: { sub: string; email: string },
  body?: Record<string, unknown>
): APIGatewayProxyEventV2 {
  return {
    rawPath,
    headers: {},
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
    requestContext: {
      http: { method },
      authorizer: {
        jwt: {
          claims: {
            sub: user.sub,
            email: user.email,
            email_verified: 'true',
            token_use: 'id',
          },
        },
      },
    },
  } as unknown as APIGatewayProxyEventV2;
}

describe('Audit Logging & Analytics Endpoints (Phase 11)', () => {
  let quotaService: QuotaService;

  const admin = { sub: 'usr-admin-analytics', email: 'admin@analytics.com' };
  const outsider = { sub: 'usr-outsider-analytics', email: 'outsider@analytics.com' };

  let orgId = '';

  beforeEach(async () => {
    DynamoRepository.clearMemory();
    quotaService = new QuotaService();

    const org = await quotaService.createOrganization({
      name: 'Analytics Test Org',
      tier: 'FREE', // max 5 projects, max 10 members
      ownerUserId: admin.sub,
      ownerEmail: admin.email,
      orgId: 'org-analytics-1',
    });
    orgId = org.orgId;
  });

  it('records audit events and returns analytics with quota calculations', async () => {
    // 1. Create two projects via handler (generates PROJECT_CREATED audit logs)
    const p1 = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, admin, {
        name: 'Alpha Project',
      })
    )) as { statusCode: number; body: string };
    expect(p1.statusCode).toBe(201);
    const p1Data = JSON.parse(p1.body);

    const p2 = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, admin, {
        name: 'Beta Project',
      })
    )) as { statusCode: number; body: string };
    expect(p2.statusCode).toBe(201);

    // 2. Delete project 1 (generates PROJECT_DELETED audit log)
    const del = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgId}/projects/${p1Data.projectId}`, admin)
    )) as { statusCode: number; body: string };
    expect(del.statusCode).toBe(200);

    // 3. Query Analytics endpoint
    const analyticsRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/analytics`, admin)
    )) as { statusCode: number; body: string };

    expect(analyticsRes.statusCode).toBe(200);
    const analytics = JSON.parse(analyticsRes.body);

    // Verify Quota Breakdown
    expect(analytics.quotas).toBeDefined();
    expect(analytics.quotas.tier).toBe('FREE');
    expect(analytics.quotas.projectCount).toBe(1);
    expect(analytics.quotas.maxProjects).toBe(10);
    expect(analytics.quotas.projectUtilizationPercent).toBe(10);
    expect(analytics.quotas.memberCount).toBe(1);
    expect(analytics.quotas.maxMembers).toBe(5);
    expect(analytics.quotas.memberUtilizationPercent).toBe(20);

    // Verify Audit Logs
    expect(analytics.auditLogs).toBeDefined();
    expect(analytics.auditLogs.length).toBeGreaterThanOrEqual(3);

    const actions = analytics.auditLogs.map((log: { action: string }) => log.action);
    expect(actions).toContain('PROJECT_CREATED');
    expect(actions).toContain('PROJECT_DELETED');

    // Most recent action should be first (reverse chronological order)
    expect(analytics.auditLogs[0].action).toBe('PROJECT_DELETED');

    // 4. Outsider cannot access analytics (403)
    const outsiderRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/analytics`, outsider)
    )) as { statusCode: number; body: string };
    expect(outsiderRes.statusCode).toBe(403);
  });
});

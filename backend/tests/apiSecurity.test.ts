import { describe, it, expect, beforeEach } from 'vitest';
import { handler } from '../src/index';
import { DynamoRepository } from '../src/services/dynamoRepository';
import { QuotaService } from '../src/services/quotaService';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeAuthEvent(
  method: string,
  rawPath: string,
  user?: { sub: string; email: string },
  body?: Record<string, unknown>
): APIGatewayProxyEventV2 {
  return {
    rawPath,
    headers: {},
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
    requestContext: {
      http: { method },
      authorizer: user
        ? {
            jwt: {
              claims: {
                sub: user.sub,
                email: user.email,
                email_verified: 'true',
                token_use: 'id',
              },
            },
          }
        : undefined,
    },
  } as unknown as APIGatewayProxyEventV2;
}

describe('Direct API Security, RBAC & Cross-Tenant Isolation (Section 5)', () => {
  let quotaService: QuotaService;
  let repo: DynamoRepository;

  const adminAlpha = { sub: 'usr-admin-alpha', email: 'admin@alpha.com' };
  const memberAlpha = { sub: 'usr-member-alpha', email: 'member@alpha.com' };
  const adminBeta = { sub: 'usr-admin-beta', email: 'admin@beta.com' };
  const outsider = { sub: 'usr-outsider', email: 'outsider@other.com' };

  let orgAlphaId: string;
  let orgBetaId: string;
  let alphaProjectId: string;
  let betaProjectId: string;

  beforeEach(async () => {
    DynamoRepository.clearMemory();
    repo = new DynamoRepository();
    quotaService = new QuotaService(repo);

    // Setup Tenant Alpha
    const orgA = await quotaService.createOrganization({
      name: 'Tenant Alpha',
      tier: 'FREE',
      ownerUserId: adminAlpha.sub,
      ownerEmail: adminAlpha.email,
      orgId: 'org-alpha',
    });
    orgAlphaId = orgA.orgId;

    await quotaService.joinOrganization({
      orgId: orgAlphaId,
      userId: memberAlpha.sub,
      email: memberAlpha.email,
      role: 'MEMBER',
    });

    const pAlpha = await quotaService.createProject({
      orgId: orgAlphaId,
      name: 'Alpha Secret Project',
      description: 'Alpha confidential data',
      userId: adminAlpha.sub,
      userEmail: adminAlpha.email,
    });
    alphaProjectId = pAlpha.projectId;

    // Setup Tenant Beta
    const orgB = await quotaService.createOrganization({
      name: 'Tenant Beta',
      tier: 'FREE',
      ownerUserId: adminBeta.sub,
      ownerEmail: adminBeta.email,
      orgId: 'org-beta',
    });
    orgBetaId = orgB.orgId;

    const pBeta = await quotaService.createProject({
      orgId: orgBetaId,
      name: 'Beta Project',
      description: 'Beta secret data',
      userId: adminBeta.sub,
      userEmail: adminBeta.email,
    });
    betaProjectId = pBeta.projectId;
  });

  it('SEC-01: Rejects unauthenticated requests with HTTP 401', async () => {
    const unauthRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgAlphaId}/projects`)
    )) as { statusCode: number; body: string };

    expect(unauthRes.statusCode).toBe(401);
    expect(JSON.parse(unauthRes.body).code).toBe('UNAUTHORIZED');
  });

  it('SEC-02: Prevents Member from executing Admin-only actions and self-promoting', async () => {
    // 1. Member attempting to generate invite code -> 403 ADMIN_REQUIRED
    const inviteRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgAlphaId}/invites`, memberAlpha, {
        role: 'MEMBER',
      })
    )) as { statusCode: number; body: string };
    expect(inviteRes.statusCode).toBe(403);
    expect(JSON.parse(inviteRes.body).code).toBe('ADMIN_REQUIRED');

    // 2. Member attempting self-promotion to ADMIN -> 403 ADMIN_REQUIRED
    const promoteSelfRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${orgAlphaId}/members/${memberAlpha.sub}`, memberAlpha, {
        role: 'ADMIN',
      })
    )) as { statusCode: number; body: string };
    expect(promoteSelfRes.statusCode).toBe(403);
    expect(JSON.parse(promoteSelfRes.body).code).toBe('ADMIN_REQUIRED');

    // Verify member role in storage remains MEMBER
    const memberItem = await repo.getItem({
      Key: { PK: `ORG#${orgAlphaId}`, SK: `MEMBER#${memberAlpha.sub}` },
    });
    expect((memberItem.Item as { role: string }).role).toBe('MEMBER');
  });

  it('SEC-03: Blocks cross-tenant project read, update, and delete tampering', async () => {
    // 1. Tenant Alpha admin tries to read Tenant Beta project by substituting ID
    const crossReadRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgAlphaId}/projects/${betaProjectId}`, adminAlpha)
    )) as { statusCode: number; body: string };
    // Not found under Tenant Alpha partition
    expect(crossReadRes.statusCode).toBe(404);

    // 2. Tenant Alpha admin directly calls Tenant Beta org endpoint
    const directCrossRead = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgBetaId}/projects/${betaProjectId}`, adminAlpha)
    )) as { statusCode: number; body: string };
    expect(directCrossRead.statusCode).toBe(403);
    expect(JSON.parse(directCrossRead.body).code).toBe('NOT_A_MEMBER');

    // 3. Tenant Alpha member tries to update Tenant Beta project
    const crossUpdateRes = (await handler(
      makeAuthEvent('PUT', `/api/v1/organizations/${orgBetaId}/projects/${betaProjectId}`, memberAlpha, {
        name: 'Hacked Beta Project',
      })
    )) as { statusCode: number; body: string };
    expect(crossUpdateRes.statusCode).toBe(403);

    // 4. Tenant Alpha admin tries to delete Tenant Beta project
    const crossDeleteRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgBetaId}/projects/${betaProjectId}`, adminAlpha)
    )) as { statusCode: number; body: string };
    expect(crossDeleteRes.statusCode).toBe(403);

    // Verify Beta project is completely intact and untouched
    const betaProj = await repo.getItem({
      Key: { PK: `ORG#${orgBetaId}`, SK: `PROJECT#${betaProjectId}` },
    });
    expect((betaProj.Item as { name: string }).name).toBe('Beta Project');
  });

  it('SEC-04: Blocks cross-tenant member inspection and role tampering', async () => {
    // Outsider or other tenant admin cannot view Alpha members
    const memberInspectRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgAlphaId}/members`, adminBeta)
    )) as { statusCode: number; body: string };
    expect(memberInspectRes.statusCode).toBe(403);
    expect(JSON.parse(memberInspectRes.body).code).toBe('NOT_A_MEMBER');

    // Tenant Beta admin cannot alter member role in Tenant Alpha
    const roleTamperRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${orgAlphaId}/members/${memberAlpha.sub}`, adminBeta, {
        role: 'ADMIN',
      })
    )) as { statusCode: number; body: string };
    expect(roleTamperRes.statusCode).toBe(403);
  });

  it('SEC-05: Blocks cross-tenant audit log and analytics access', async () => {
    // Tenant Beta admin cannot access Tenant Alpha analytics
    const auditRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgAlphaId}/analytics`, adminBeta)
    )) as { statusCode: number; body: string };
    expect(auditRes.statusCode).toBe(403);
    expect(JSON.parse(auditRes.body).code).toBe('NOT_A_MEMBER');
  });

  it('SEC-06: Verifies unauthorized mutations do not generate misleading audit logs', async () => {
    // Member attempts unauthorized role change
    await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${orgAlphaId}/members/${memberAlpha.sub}`, memberAlpha, {
        role: 'ADMIN',
      })
    );

    // Check Alpha audit logs
    const analyticsRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgAlphaId}/analytics`, adminAlpha)
    )) as { statusCode: number; body: string };
    const analytics = JSON.parse(analyticsRes.body);

    const roleEvents = analytics.auditLogs.filter(
      (log: { action: string }) => log.action === 'MEMBER_ROLE_UPDATED'
    );
    expect(roleEvents.length).toBe(0);
  });
});

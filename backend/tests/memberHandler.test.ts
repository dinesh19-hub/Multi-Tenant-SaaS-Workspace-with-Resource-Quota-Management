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

describe('Multi-Tenant RBAC & Member Management (Phase 8)', () => {
  let quotaService: QuotaService;

  const admin1 = { sub: 'usr-admin-1', email: 'admin1@org.com' };
  const admin2 = { sub: 'usr-admin-2', email: 'admin2@org.com' };
  const member1 = { sub: 'usr-member-1', email: 'member1@org.com' };
  const outsider = { sub: 'usr-outsider', email: 'outsider@other.com' };

  beforeEach(async () => {
    DynamoRepository.clearMemory();
    quotaService = new QuotaService();
  });

  it('enforces RBAC permissions for listing, role changes, and removals', async () => {
    // 1. Setup organization with admin1
    const org = await quotaService.createOrganization({
      name: 'RBAC Test Org',
      tier: 'FREE',
      ownerUserId: admin1.sub,
      ownerEmail: admin1.email,
      orgId: 'org-rbac-100',
    });

    // 2. Add member1 and admin2
    await quotaService.joinOrganization({
      orgId: org.orgId,
      userId: member1.sub,
      email: member1.email,
      role: 'MEMBER',
    });

    await quotaService.joinOrganization({
      orgId: org.orgId,
      userId: admin2.sub,
      email: admin2.email,
      role: 'ADMIN',
    });

    // 3. Member listing: Both member1 and admin1 can list members
    const memberListRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${org.orgId}/members`, member1)
    )) as { statusCode: number; body: string };
    expect(memberListRes.statusCode).toBe(200);
    const memberListData = JSON.parse(memberListRes.body);
    expect(memberListData.totalCount).toBe(3);

    // Outsider cannot list members (403 NOT_A_MEMBER)
    const outsiderListRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${org.orgId}/members`, outsider)
    )) as { statusCode: number; body: string };
    expect(outsiderListRes.statusCode).toBe(403);

    // 4. Role Change: Member attempting role change receives 403
    const unauthorizedRoleChange = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${org.orgId}/members/${member1.sub}`, member1, {
        role: 'ADMIN',
      })
    )) as { statusCode: number; body: string };
    expect(unauthorizedRoleChange.statusCode).toBe(403);
    expect(JSON.parse(unauthorizedRoleChange.body).code).toBe('ADMIN_REQUIRED');

    // Admin demoting admin2 to Member succeeds (because 2 admins exist)
    const demoteRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${org.orgId}/members/${admin2.sub}`, admin1, {
        role: 'MEMBER',
      })
    )) as { statusCode: number; body: string };
    expect(demoteRes.statusCode).toBe(200);

    // Now admin1 is the sole admin. Demoting admin1 MUST fail with 409 CANNOT_DEMOTE_LAST_ADMIN
    const demoteLastAdminRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${org.orgId}/members/${admin1.sub}`, admin1, {
        role: 'MEMBER',
      })
    )) as { statusCode: number; body: string };
    expect(demoteLastAdminRes.statusCode).toBe(409);
    expect(JSON.parse(demoteLastAdminRes.body).code).toBe('CANNOT_DEMOTE_LAST_ADMIN');

    // 5. Member Removal & Self-Leave:
    // Member attempting to remove another member receives 403
    const memberRemoveAnother = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${org.orgId}/members/${admin2.sub}`, member1)
    )) as { statusCode: number; body: string };
    expect(memberRemoveAnother.statusCode).toBe(403);

    // Member self-leave succeeds
    const selfLeaveRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${org.orgId}/members/${member1.sub}`, member1)
    )) as { statusCode: number; body: string };
    expect(selfLeaveRes.statusCode).toBe(200);

    // Admin removing sole remaining admin fails with CANNOT_REMOVE_LAST_ADMIN
    const removeLastAdminRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${org.orgId}/members/${admin1.sub}`, admin1)
    )) as { statusCode: number; body: string };
    expect(removeLastAdminRes.statusCode).toBe(409);
    expect(JSON.parse(removeLastAdminRes.body).code).toBe('CANNOT_REMOVE_LAST_ADMIN');
  });

  it('TC-REG-M05: records role promotions and demotions in audit history, and rejects unauthorized/invalid changes without logging', async () => {
    // 1. Setup organization with admin1
    const org = await quotaService.createOrganization({
      name: 'Role Audit Test Org',
      tier: 'FREE',
      ownerUserId: admin1.sub,
      ownerEmail: admin1.email,
      orgId: 'org-audit-m05',
    });

    // 2. Add bob as member
    await quotaService.joinOrganization({
      orgId: org.orgId,
      userId: member1.sub,
      email: member1.email,
      role: 'MEMBER',
    });

    // 3. Unauthorized role change: member1 tries to promote themselves to ADMIN -> 403 Forbidden
    const unauthorizedRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${org.orgId}/members/${member1.sub}`, member1, {
        role: 'ADMIN',
      })
    )) as { statusCode: number; body: string };
    expect(unauthorizedRes.statusCode).toBe(403);

    // 4. Admin1 promotes member1 to ADMIN -> 200 OK
    const promoteRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${org.orgId}/members/${member1.sub}`, admin1, {
        role: 'ADMIN',
      })
    )) as { statusCode: number; body: string };
    expect(promoteRes.statusCode).toBe(200);

    // 5. Admin1 restores member1 to MEMBER -> 200 OK
    const restoreRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${org.orgId}/members/${member1.sub}`, admin1, {
        role: 'MEMBER',
      })
    )) as { statusCode: number; body: string };
    expect(restoreRes.statusCode).toBe(200);

    // 6. Admin1 attempts invalid demotion of last admin (themselves) -> 409 Conflict
    const invalidDemoteRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${org.orgId}/members/${admin1.sub}`, admin1, {
        role: 'MEMBER',
      })
    )) as { statusCode: number; body: string };
    expect(invalidDemoteRes.statusCode).toBe(409);

    // 7. Verify audit logs via GET /analytics
    const analyticsRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${org.orgId}/analytics`, admin1)
    )) as { statusCode: number; body: string };
    expect(analyticsRes.statusCode).toBe(200);
    const analytics = JSON.parse(analyticsRes.body);

    const roleEvents = analytics.auditLogs.filter(
      (log: { action: string }) => log.action === 'MEMBER_ROLE_UPDATED'
    );
    // Exactly 2 successful role changes recorded (promotion + restoration)
    expect(roleEvents.length).toBe(2);

    // Latest role update: restoration to MEMBER
    expect(roleEvents[0].targetId).toBe(member1.sub);
    expect(roleEvents[0].actorUserId).toBe(admin1.sub);
    expect(roleEvents[0].details.newRole).toBe('MEMBER');

    // Prior role update: promotion to ADMIN
    expect(roleEvents[1].targetId).toBe(member1.sub);
    expect(roleEvents[1].actorUserId).toBe(admin1.sub);
    expect(roleEvents[1].details.newRole).toBe('ADMIN');
  });
});


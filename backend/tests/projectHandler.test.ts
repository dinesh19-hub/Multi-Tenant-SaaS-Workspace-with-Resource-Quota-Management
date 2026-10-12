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

describe('Project Management & Atomic Quotas (Phase 9)', () => {
  let quotaService: QuotaService;

  const admin = { sub: 'usr-admin-alpha', email: 'admin@alpha.com' };
  const memberBob = { sub: 'usr-bob', email: 'bob@alpha.com' };
  const memberCharlie = { sub: 'usr-charlie', email: 'charlie@alpha.com' };

  let orgId = '';

  beforeEach(async () => {
    DynamoRepository.clearMemory();
    quotaService = new QuotaService();

    // Create organization (FREE tier: max 5 projects)
    const org = await quotaService.createOrganization({
      name: 'Alpha Projects Org',
      tier: 'FREE',
      ownerUserId: admin.sub,
      ownerEmail: admin.email,
      orgId: 'org-alpha-99',
    });
    orgId = org.orgId;

    // Add Bob and Charlie as members
    await quotaService.joinOrganization({
      orgId,
      userId: memberBob.sub,
      email: memberBob.email,
      role: 'MEMBER',
    });

    await quotaService.joinOrganization({
      orgId,
      userId: memberCharlie.sub,
      email: memberCharlie.email,
      role: 'MEMBER',
    });
  });

  it('handles project creation, listing, permissions, and atomic quota enforcement', async () => {
    // 1. Bob creates Project 1
    const createRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, memberBob, {
        name: 'Bob Project',
        description: 'Initiated by Bob',
      })
    )) as { statusCode: number; body: string };

    expect(createRes.statusCode).toBe(201);
    const bobProject = JSON.parse(createRes.body);
    expect(bobProject.name).toBe('Bob Project');
    expect(bobProject.createdBy).toBe(memberBob.sub);

    // 2. Charlie attempts to edit Bob's project -> receives 403 Forbidden
    const charlieEditRes = (await handler(
      makeAuthEvent('PUT', `/api/v1/organizations/${orgId}/projects/${bobProject.projectId}`, memberCharlie, {
        name: 'Hacked by Charlie',
      })
    )) as { statusCode: number; body: string };
    expect(charlieEditRes.statusCode).toBe(403);

    // 3. Bob edits his own project -> succeeds
    const bobEditRes = (await handler(
      makeAuthEvent('PUT', `/api/v1/organizations/${orgId}/projects/${bobProject.projectId}`, memberBob, {
        name: 'Bob Project Updated',
        description: 'New Description',
      })
    )) as { statusCode: number; body: string };
    expect(bobEditRes.statusCode).toBe(200);

    // 4. Admin edits Bob's project -> succeeds
    const adminEditRes = (await handler(
      makeAuthEvent('PUT', `/api/v1/organizations/${orgId}/projects/${bobProject.projectId}`, admin, {
        name: 'Bob Project Admin Approved',
      })
    )) as { statusCode: number; body: string };
    expect(adminEditRes.statusCode).toBe(200);

    // 5. Fill remaining quota slots (9 more projects to reach limit of 10)
    for (let i = 2; i <= 10; i++) {
      const res = (await handler(
        makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, memberCharlie, {
          name: `Charlie Project ${i}`,
        })
      )) as { statusCode: number; body: string };
      expect(res.statusCode).toBe(201);
    }

    // 6. Attempting 11th project MUST be rejected with 409 QuotaExceededError
    const overLimitRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, admin, {
        name: 'Project 11 (Over limit)',
      })
    )) as { statusCode: number; body: string };
    expect(overLimitRes.statusCode).toBe(409);
    expect(JSON.parse(overLimitRes.body).code).toBe('PROJECT_QUOTA_EXCEEDED');

    // 7. Charlie attempts to delete Bob's project -> receives 403
    const charlieDeleteRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgId}/projects/${bobProject.projectId}`, memberCharlie)
    )) as { statusCode: number; body: string };
    expect(charlieDeleteRes.statusCode).toBe(403);

    // 8. Bob deletes his project -> succeeds (reclaims quota slot!)
    const bobDeleteRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgId}/projects/${bobProject.projectId}`, memberBob)
    )) as { statusCode: number; body: string };
    expect(bobDeleteRes.statusCode).toBe(200);

    // 9. Now creating another project succeeds in the freed slot!
    const reclaimRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, memberCharlie, {
        name: 'Reclaimed Project',
      })
    )) as { statusCode: number; body: string };
    expect(reclaimRes.statusCode).toBe(201);
  });

  it('TC-REG-P06: preserves existing project data and creates distinct records when projects share the same name within or across organizations', async () => {
    // 1. Create first project named "Local Test Project"
    const firstCreateRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, memberBob, {
        name: 'Local Test Project',
        description: 'First instance of Local Test Project',
      })
    )) as { statusCode: number; body: string };
    expect(firstCreateRes.statusCode).toBe(201);
    const firstProject = JSON.parse(firstCreateRes.body);
    expect(firstProject.projectId).toBeDefined();

    // 2. Create second project with IDENTICAL name "Local Test Project" in the same organization
    const secondCreateRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, memberBob, {
        name: 'Local Test Project',
        description: 'Second instance with same name',
      })
    )) as { statusCode: number; body: string };
    expect(secondCreateRes.statusCode).toBe(201);
    const secondProject = JSON.parse(secondCreateRes.body);
    expect(secondProject.projectId).toBeDefined();

    // 3. Verify they have distinct IDs and neither overwrote the other
    expect(firstProject.projectId).not.toBe(secondProject.projectId);

    // 4. Retrieve first project by ID — verify its original attributes are completely intact
    const getFirstRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/projects/${firstProject.projectId}`, memberBob)
    )) as { statusCode: number; body: string };
    expect(getFirstRes.statusCode).toBe(200);
    const fetchedFirst = JSON.parse(getFirstRes.body);
    expect(fetchedFirst.projectId).toBe(firstProject.projectId);
    expect(fetchedFirst.description).toBe('First instance of Local Test Project');
    expect(fetchedFirst.createdAt).toBe(firstProject.createdAt);

    // 5. Retrieve second project by ID — verify it exists as a separate item
    const getSecondRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/projects/${secondProject.projectId}`, memberBob)
    )) as { statusCode: number; body: string };
    expect(getSecondRes.statusCode).toBe(200);
    const fetchedSecond = JSON.parse(getSecondRes.body);
    expect(fetchedSecond.projectId).toBe(secondProject.projectId);
    expect(fetchedSecond.description).toBe('Second instance with same name');

    // 6. List projects in org — verify both are present
    const listRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/projects`, memberBob)
    )) as { statusCode: number; body: string };
    expect(listRes.statusCode).toBe(200);
    const listData = JSON.parse(listRes.body);
    const projectIds = listData.projects.map((p: { projectId: string }) => p.projectId);
    expect(projectIds).toContain(firstProject.projectId);
    expect(projectIds).toContain(secondProject.projectId);

    // 7. Create a second organization and add a project with the identical name
    const org2 = await quotaService.createOrganization({
      name: 'Beta Organization',
      tier: 'FREE',
      ownerUserId: admin.sub,
      ownerEmail: admin.email,
      orgId: 'org-beta-p06',
    });

    const org2ProjectRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${org2.orgId}/projects`, admin, {
        name: 'Local Test Project',
        description: 'Org2 instance with identical name',
      })
    )) as { statusCode: number; body: string };
    expect(org2ProjectRes.statusCode).toBe(201);
    const org2Project = JSON.parse(org2ProjectRes.body);
    expect(org2Project.projectId).toBeDefined();
    expect(org2Project.projectId).not.toBe(firstProject.projectId);
    expect(org2Project.projectId).not.toBe(secondProject.projectId);

    // 8. Ensure tenant isolation: Org2's project does NOT appear in orgId's list
    const org1ListAfterRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/projects`, memberBob)
    )) as { statusCode: number; body: string };
    const org1ProjectIds = JSON.parse(org1ListAfterRes.body).projects.map(
      (p: { projectId: string }) => p.projectId
    );
    expect(org1ProjectIds).not.toContain(org2Project.projectId);

    // 9. Update first project — verify second project remains completely unchanged
    const updateFirstRes = (await handler(
      makeAuthEvent('PUT', `/api/v1/organizations/${orgId}/projects/${firstProject.projectId}`, memberBob, {
        name: 'Local Test Project',
        description: 'Updated First instance description',
      })
    )) as { statusCode: number; body: string };
    expect(updateFirstRes.statusCode).toBe(200);

    const getSecondAfterUpdate = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/projects/${secondProject.projectId}`, memberBob)
    )) as { statusCode: number; body: string };
    expect(getSecondAfterUpdate.statusCode).toBe(200);
    const secondUnchanged = JSON.parse(getSecondAfterUpdate.body);
    expect(secondUnchanged.description).toBe('Second instance with same name');
    expect(secondUnchanged.createdAt).toBe(secondProject.createdAt);

    // 10. Delete first project — verify second project survives
    const deleteFirstRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgId}/projects/${firstProject.projectId}`, memberBob)
    )) as { statusCode: number; body: string };
    expect(deleteFirstRes.statusCode).toBe(200);

    // Verify first is gone (404)
    const getFirstAfterDelete = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/projects/${firstProject.projectId}`, memberBob)
    )) as { statusCode: number; body: string };
    expect(getFirstAfterDelete.statusCode).toBe(404);

    // Verify second survives intact (200)
    const getSecondAfterDelete = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/projects/${secondProject.projectId}`, memberBob)
    )) as { statusCode: number; body: string };
    expect(getSecondAfterDelete.statusCode).toBe(200);
    expect(JSON.parse(getSecondAfterDelete.body).projectId).toBe(secondProject.projectId);

    // 11. Verify project count and analytics match remaining records
    const metaAfterDelete = await quotaService.getOrgMetadata(orgId);
    expect(metaAfterDelete?.projectCount).toBe(1);

    const analyticsRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/analytics`, memberBob)
    )) as { statusCode: number; body: string };
    expect(analyticsRes.statusCode).toBe(200);
    const analytics = JSON.parse(analyticsRes.body);
    expect(analytics.quotas.projectCount).toBe(1);
  });
});



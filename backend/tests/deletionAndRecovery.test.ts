import { describe, it, expect, beforeEach } from 'vitest';
import { handler } from '../src/index';
import { DynamoRepository } from '../src/services/dynamoRepository';
import { QuotaService } from '../src/services/quotaService';
import { OrgDeleteService } from '../src/services/orgDeleteService';
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

describe('Organization Deletion, Recovery, and Data Integrity (Section 6)', () => {
  let quotaService: QuotaService;
  let deleteService: OrgDeleteService;
  let repo: DynamoRepository;

  const admin1 = { sub: 'usr-admin-del1', email: 'admin1@del.org' };
  const admin2 = { sub: 'usr-admin-del2', email: 'admin2@del.org' };
  const memberBob = { sub: 'usr-bob-del', email: 'bob@del.org' };
  const survivorAdmin = { sub: 'usr-survivor', email: 'survivor@other.org' };

  let delOrgId: string;
  let survivorOrgId: string;

  beforeEach(async () => {
    DynamoRepository.clearMemory();
    repo = new DynamoRepository();
    quotaService = new QuotaService(repo);
    deleteService = new OrgDeleteService(repo);

    // Setup Target Organization for Deletion
    const delOrg = await quotaService.createOrganization({
      name: 'Org Slated For Deletion',
      tier: 'FREE',
      ownerUserId: admin1.sub,
      ownerEmail: admin1.email,
      orgId: 'org-delete-target',
    });
    delOrgId = delOrg.orgId;

    await quotaService.joinOrganization({
      orgId: delOrgId,
      userId: admin2.sub,
      email: admin2.email,
      role: 'ADMIN',
    });

    await quotaService.joinOrganization({
      orgId: delOrgId,
      userId: memberBob.sub,
      email: memberBob.email,
      role: 'MEMBER',
    });

    await quotaService.createProject({
      orgId: delOrgId,
      name: 'Project to Delete',
      description: 'Will be purged',
      userId: memberBob.sub,
      userEmail: memberBob.email,
    });

    // Setup Unrelated Survivor Organization
    const survivorOrg = await quotaService.createOrganization({
      name: 'Survivor Organization',
      tier: 'FREE',
      ownerUserId: survivorAdmin.sub,
      ownerEmail: survivorAdmin.email,
      orgId: 'org-survivor-1',
    });
    survivorOrgId = survivorOrg.orgId;

    await quotaService.createProject({
      orgId: survivorOrgId,
      name: 'Survivor Project',
      description: 'Must remain intact',
      userId: survivorAdmin.sub,
      userEmail: survivorAdmin.email,
    });
  });

  it('DEL-01: Rejects deletion attempts by regular non-admin members', async () => {
    const nonAdminDelRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${delOrgId}`, memberBob)
    )) as { statusCode: number; body: string };

    expect(nonAdminDelRes.statusCode).toBe(403);
  });

  it('DEL-02: Blocks normal operations while organization is in DELETING status', async () => {
    // Put organization in DELETING lockdown
    await repo.updateItem({
      Key: { PK: `ORG#${delOrgId}`, SK: 'METADATA' },
      UpdateExpression: 'SET #s = :deleting, #adm = :adm',
      ExpressionAttributeNames: { '#s': 'status', '#adm': 'authorizedAdminIds' },
      ExpressionAttributeValues: { ':deleting': 'DELETING', ':adm': [admin1.sub, admin2.sub] },
    });

    // Project creation blocked
    await expect(
      quotaService.createProject({
        orgId: delOrgId,
        name: 'Blocked Project',
        description: 'Should fail',
        userId: admin1.sub,
        userEmail: admin1.email,
      })
    ).rejects.toThrow(/being deleted/);

    // Member joining blocked
    await expect(
      quotaService.joinOrganization({
        orgId: delOrgId,
        userId: 'usr-newbie',
        email: 'newbie@del.org',
      })
    ).rejects.toThrow(/being deleted/);
  });

  it('DEL-03: Successfully executes 7-step deletion and leaves other orgs untouched', async () => {
    const delRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${delOrgId}`, admin1)
    )) as { statusCode: number; body: string };

    expect(delRes.statusCode).toBe(200);
    const body = JSON.parse(delRes.body);
    expect(body.details.status).toBe('COMPLETED');
    expect(body.details.step).toBe(7);

    // Verify all records under ORG#delOrgId are deleted (0 items remaining)
    const remaining = await repo.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ORG#${delOrgId}` },
      ConsistentRead: true,
    });
    expect(remaining.Items.length).toBe(0);

    // Verify Survivor Organization is completely untouched
    const survivorMeta = await quotaService.getOrgMetadata(survivorOrgId);
    expect(survivorMeta?.status).toBe('ACTIVE');
    expect(survivorMeta?.name).toBe('Survivor Organization');
    expect(survivorMeta?.projectCount).toBe(1);
  });

  it('DEL-04: Resumes interrupted deletion by secondary authorized administrator', async () => {
    // 1. Initiate deletion lockdown with snapshot of admins [admin1, admin2]
    await repo.updateItem({
      Key: { PK: `ORG#${delOrgId}`, SK: 'METADATA' },
      UpdateExpression: 'SET #s = :deleting, #adm = :adm',
      ExpressionAttributeNames: { '#s': 'status', '#adm': 'authorizedAdminIds' },
      ExpressionAttributeValues: { ':deleting': 'DELETING', ':adm': [admin1.sub, admin2.sub] },
    });

    // 2. Outsider cannot resume deletion
    await expect(
      deleteService.deleteOrganization(delOrgId, survivorAdmin.sub)
    ).rejects.toThrow('Only authorized administrators captured at deletion lockdown can resume cleanup.');

    // 3. Admin2 (secondary admin from snapshot) resumes and completes cleanup
    const resumeResult = await deleteService.deleteOrganization(delOrgId, admin2.sub);
    expect(resumeResult.status).toBe('COMPLETED');
    expect(resumeResult.step).toBe(7);

    // Verify metadata deleted
    const metaAfterResume = await quotaService.getOrgMetadata(delOrgId);
    expect(metaAfterResume).toBeNull();
  });
});

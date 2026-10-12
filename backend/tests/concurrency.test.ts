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

describe('Concurrent Operations & Atomic Quota Integrity (Section 8)', () => {
  let quotaService: QuotaService;
  let repo: DynamoRepository;

  const admin = { sub: 'usr-admin-conc', email: 'admin@conc.org' };
  let orgId: string;

  beforeEach(async () => {
    DynamoRepository.clearMemory();
    repo = new DynamoRepository();
    quotaService = new QuotaService(repo);

    const org = await quotaService.createOrganization({
      name: 'Concurrency Test Org',
      tier: 'FREE', // max 10 projects, max 5 members
      ownerUserId: admin.sub,
      ownerEmail: admin.email,
      orgId: 'org-conc-1',
    });
    orgId = org.orgId;
  });

  it('CONC-01: Exactly one of multiple concurrent project creation requests succeeds when one slot remains', async () => {
    // 1. Fill 9 slots out of 10
    for (let i = 1; i <= 9; i++) {
      await quotaService.createProject({
        orgId,
        name: `Pre-existing Project ${i}`,
        description: 'Baseline',
        userId: admin.sub,
        userEmail: admin.email,
      });
    }

    const metaBefore = await quotaService.getOrgMetadata(orgId);
    expect(metaBefore?.projectCount).toBe(9);
    expect(metaBefore?.maxProjects).toBe(10);

    // 2. Launch 5 concurrent project creation requests attempting to claim the 10th slot
    const concurrentRequests = Array.from({ length: 5 }, (_, idx) =>
      handler(
        makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, admin, {
          name: `Concurrent Race Project ${idx + 1}`,
          description: 'Racing for the final slot',
        })
      ) as Promise<{ statusCode: number; body: string }>
    );

    const results = await Promise.all(concurrentRequests);

    // 3. Exactly 1 request must succeed with 201; exactly 4 must be rejected with 409
    const successes = results.filter((r) => r.statusCode === 201);
    const failures = results.filter((r) => r.statusCode === 409);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(4);

    for (const failure of failures) {
      expect(JSON.parse(failure.body).code).toBe('PROJECT_QUOTA_EXCEEDED');
    }

    // 4. Verify stored project count is exactly 10 and cannot exceed quota limit
    const metaAfter = await quotaService.getOrgMetadata(orgId);
    expect(metaAfter?.projectCount).toBe(10);

    const allProjects = await repo.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
    });
    const projectItems = allProjects.Items.filter((i) => (i.SK as string).startsWith('PROJECT#'));
    expect(projectItems.length).toBe(10);
  });

  it('CONC-02: Exactly one of multiple concurrent member joins succeeds when one slot remains', async () => {
    // 1. Fill 4 slots out of 5 (owner admin is member #1)
    for (let i = 2; i <= 4; i++) {
      await quotaService.joinOrganization({
        orgId,
        userId: `usr-pre-${i}`,
        email: `pre${i}@conc.org`,
      });
    }

    const metaBefore = await quotaService.getOrgMetadata(orgId);
    expect(metaBefore?.memberCount).toBe(4);
    expect(metaBefore?.maxMembers).toBe(5);

    // 2. Launch 5 concurrent member join requests with distinct users
    const candidateUsers = Array.from({ length: 5 }, (_, idx) => ({
      sub: `usr-race-candidate-${idx + 1}`,
      email: `candidate${idx + 1}@conc.org`,
    }));

    const concurrentJoins = candidateUsers.map((candidate) =>
      quotaService
        .joinOrganization({
          orgId,
          userId: candidate.sub,
          email: candidate.email,
        })
        .then(() => ({ success: true }))
        .catch((err) => ({ success: false, error: err.code || err.name }))
    );

    const joinResults = await Promise.all(concurrentJoins);

    // 3. Exactly 1 join must succeed; exactly 4 must fail with MEMBER_QUOTA_EXCEEDED
    const successfulJoins = joinResults.filter((r) => r.success);
    const failedJoins = joinResults.filter((r) => !r.success);

    expect(successfulJoins.length).toBe(1);
    expect(failedJoins.length).toBe(4);

    for (const fail of failedJoins) {
      expect(fail.error).toBe('MEMBER_QUOTA_EXCEEDED');
    }

    // 4. Stored member count is strictly capped at 5
    const metaAfter = await quotaService.getOrgMetadata(orgId);
    expect(metaAfter?.memberCount).toBe(5);
  });
});

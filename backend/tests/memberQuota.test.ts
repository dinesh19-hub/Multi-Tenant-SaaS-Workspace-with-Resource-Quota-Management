import { describe, it, expect, beforeEach } from 'vitest';
import { handler } from '../src/index';
import { DynamoRepository } from '../src/services/dynamoRepository';
import { QuotaService } from '../src/services/quotaService';
import { InviteService } from '../src/services/inviteService';
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

describe('Member Quota Enforcement & Invite Lifecycle (M-06 through M-10)', () => {
  let quotaService: QuotaService;
  let inviteService: InviteService;
  let repo: DynamoRepository;

  const admin = { sub: 'usr-admin-mquota', email: 'admin@mquota.org' };
  const member2 = { sub: 'usr-m2', email: 'm2@mquota.org' };
  const member3 = { sub: 'usr-m3', email: 'm3@mquota.org' };
  const member4 = { sub: 'usr-m4', email: 'm4@mquota.org' };
  const member5 = { sub: 'usr-m5', email: 'm5@mquota.org' };
  const member6 = { sub: 'usr-m6', email: 'm6@mquota.org' };

  let orgId: string;

  beforeEach(async () => {
    DynamoRepository.clearMemory();
    repo = new DynamoRepository();
    quotaService = new QuotaService(repo);
    inviteService = new InviteService(repo, quotaService);

    // Create Free tier organization (owner admin is member #1)
    const org = await quotaService.createOrganization({
      name: 'Member Quota Org',
      tier: 'FREE', // max 5 members, max 10 projects
      ownerUserId: admin.sub,
      ownerEmail: admin.email,
      orgId: 'org-mquota-1',
    });
    orgId = org.orgId;
  });

  it('M-06: Member count agrees with actual stored membership records', async () => {
    const listRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/members`, admin)
    )) as { statusCode: number; body: string };
    expect(listRes.statusCode).toBe(200);
    const data = JSON.parse(listRes.body);
    expect(data.totalCount).toBe(1);
    expect(data.members.length).toBe(1);
    expect(data.members[0].userId).toBe(admin.sub);

    const meta = await quotaService.getOrgMetadata(orgId);
    expect(meta?.memberCount).toBe(1);
    expect(meta?.maxMembers).toBe(5);
  });

  it('M-07 & M-08: Allows valid members to join up to exactly 5/5, then rejects 6th member', async () => {
    // Generate multi-use invite code
    const inviteRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/invites`, admin, {
        role: 'MEMBER',
        maxUses: 10,
      })
    )) as { statusCode: number; body: string };
    expect(inviteRes.statusCode).toBe(201);
    const inviteCode = JSON.parse(inviteRes.body).inviteCode;

    // Join members 2, 3, 4, 5
    const membersToJoin = [member2, member3, member4, member5];
    for (const m of membersToJoin) {
      const joinRes = (await handler(
        makeAuthEvent('POST', '/api/v1/organizations/join', m, {
          inviteCode,
        })
      )) as { statusCode: number; body: string };
      expect(joinRes.statusCode).toBe(200);
    }

    // Verify exactly 5 members exist in storage
    const metaAtLimit = await quotaService.getOrgMetadata(orgId);
    expect(metaAtLimit?.memberCount).toBe(5);

    const listRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/members`, admin)
    )) as { statusCode: number; body: string };
    expect(JSON.parse(listRes.body).totalCount).toBe(5);

    // M-08: Attempting 6th member MUST be rejected with 409 MEMBER_QUOTA_EXCEEDED
    const overLimitRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations/join', member6, {
        inviteCode,
      })
    )) as { statusCode: number; body: string };
    expect(overLimitRes.statusCode).toBe(409);
    expect(JSON.parse(overLimitRes.body).code).toBe('MEMBER_QUOTA_EXCEEDED');

    // Verify stored member count and membership list are completely unchanged
    const metaAfterReject = await quotaService.getOrgMetadata(orgId);
    expect(metaAfterReject?.memberCount).toBe(5);

    const checkMember6 = await repo.getItem({
      Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${member6.sub}` },
    });
    expect(checkMember6.Item).toBeUndefined();
  });

  it('M-09: Handles invalid, expired, and exhausted invitations correctly', async () => {
    // 1. Invalid invite code -> 404 INVITE_NOT_FOUND
    const invalidRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations/join', member2, {
        inviteCode: 'NONEXIST',
      })
    )) as { statusCode: number; body: string };
    expect(invalidRes.statusCode).toBe(404);
    expect(JSON.parse(invalidRes.body).code).toBe('INVITE_NOT_FOUND');

    // 2. Single-use invite exhausted after 1 use -> 409 INVITE_EXHAUSTED on second attempt
    const singleUseInvite = await inviteService.createInvite({
      orgId,
      createdByUserId: admin.sub,
      role: 'MEMBER',
      maxUses: 1,
    });

    const firstUseRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations/join', member2, {
        inviteCode: singleUseInvite.inviteCode,
      })
    )) as { statusCode: number; body: string };
    expect(firstUseRes.statusCode).toBe(200);

    const secondUseRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations/join', member3, {
        inviteCode: singleUseInvite.inviteCode,
      })
    )) as { statusCode: number; body: string };
    expect(secondUseRes.statusCode).toBe(409);
    expect(JSON.parse(secondUseRes.body).code).toBe('INVITE_EXHAUSTED');

    // 3. Expired invite -> 400 INVITE_EXPIRED
    const expiredInvite = await inviteService.createInvite({
      orgId,
      createdByUserId: admin.sub,
      role: 'MEMBER',
      maxUses: 5,
      expiresInHours: -1, // Expired in the past
    });

    const expiredUseRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations/join', member4, {
        inviteCode: expiredInvite.inviteCode,
      })
    )) as { statusCode: number; body: string };
    expect(expiredUseRes.statusCode).toBe(400);
    expect(JSON.parse(expiredUseRes.body).code).toBe('INVITE_EXPIRED');
  });

  it('M-10: Removing a member restores capacity, while protecting sole-member and last-admin', async () => {
    // Fill to 5 members
    await quotaService.joinOrganization({ orgId, userId: member2.sub, email: member2.email });
    await quotaService.joinOrganization({ orgId, userId: member3.sub, email: member3.email });
    await quotaService.joinOrganization({ orgId, userId: member4.sub, email: member4.email });
    await quotaService.joinOrganization({ orgId, userId: member5.sub, email: member5.email });

    expect((await quotaService.getOrgMetadata(orgId))?.memberCount).toBe(5);

    // Remove member5 -> count becomes 4
    const removeRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgId}/members/${member5.sub}`, admin)
    )) as { statusCode: number; body: string };
    expect(removeRes.statusCode).toBe(200);

    const metaAfterRemove = await quotaService.getOrgMetadata(orgId);
    expect(metaAfterRemove?.memberCount).toBe(4);

    // Now member6 can join in the freed capacity slot!
    await quotaService.joinOrganization({ orgId, userId: member6.sub, email: member6.email });
    expect((await quotaService.getOrgMetadata(orgId))?.memberCount).toBe(5);

    // Cannot remove admin (last administrator)
    const removeAdminRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgId}/members/${admin.sub}`, admin)
    )) as { statusCode: number; body: string };
    expect(removeAdminRes.statusCode).toBe(409);
    expect(JSON.parse(removeAdminRes.body).code).toBe('CANNOT_REMOVE_LAST_ADMIN');
  });
});

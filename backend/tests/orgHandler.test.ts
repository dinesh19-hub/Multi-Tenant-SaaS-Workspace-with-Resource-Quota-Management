import { describe, it, expect, beforeEach } from 'vitest';
import { handler } from '../src/index';
import { DynamoRepository } from '../src/services/dynamoRepository';
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

describe('Organization & Invite HTTP Handlers (Phase 7)', () => {
  beforeEach(() => {
    DynamoRepository.clearMemory();
  });

  it('performs full organization lifecycle: create, list, get, invite, join, and delete', async () => {
    const userA = { sub: 'usr-alice-100', email: 'alice@cloud.com' };
    const userB = { sub: 'usr-bob-200', email: 'bob@cloud.com' };

    // 1. Create Organization
    const createRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations', userA, {
        name: 'Nexus Cloud',
        tier: 'STANDARD',
      })
    )) as { statusCode: number; body: string };

    expect(createRes.statusCode).toBe(201);
    const org = JSON.parse(createRes.body);
    expect(org.name).toBe('Nexus Cloud');
    expect(org.tier).toBe('STANDARD');
    expect(org.orgId).toBeDefined();

    // 2. List Organizations for userA
    const listRes = (await handler(
      makeAuthEvent('GET', '/api/v1/organizations', userA)
    )) as { statusCode: number; body: string };

    expect(listRes.statusCode).toBe(200);
    const listData = JSON.parse(listRes.body);
    expect(listData.organizations.length).toBe(1);
    expect(listData.organizations[0].name).toBe('Nexus Cloud');
    expect(listData.organizations[0].role).toBe('ADMIN');

    // 3. Get Organization details
    const getRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${org.orgId}`, userA)
    )) as { statusCode: number; body: string };

    expect(getRes.statusCode).toBe(200);
    const getOrg = JSON.parse(getRes.body);
    expect(getOrg.orgId).toBe(org.orgId);
    expect(getOrg.maxProjects).toBe(50);

    // 4. Generate Invite Code (Admin only)
    const inviteRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${org.orgId}/invites`, userA, {
        role: 'MEMBER',
      })
    )) as { statusCode: number; body: string };

    expect(inviteRes.statusCode).toBe(201);
    const invite = JSON.parse(inviteRes.body);
    expect(invite.inviteCode).toBeDefined();

    // 5. UserB joins via Invite Code
    const joinRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations/join', userB, {
        inviteCode: invite.inviteCode,
      })
    )) as { statusCode: number; body: string };

    expect(joinRes.statusCode).toBe(200);
    const joinData = JSON.parse(joinRes.body);
    expect(joinData.orgId).toBe(org.orgId);
    expect(joinData.role).toBe('MEMBER');

    // UserB can now list and view the organization
    const bobList = (await handler(
      makeAuthEvent('GET', '/api/v1/organizations', userB)
    )) as { statusCode: number; body: string };
    const bobData = JSON.parse(bobList.body);
    expect(bobData.organizations.length).toBe(1);
    expect(bobData.organizations[0].role).toBe('MEMBER');

    // 6. Delete Organization
    const deleteRes = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${org.orgId}`, userA)
    )) as { statusCode: number; body: string };

    expect(deleteRes.statusCode).toBe(200);
    const deleteData = JSON.parse(deleteRes.body);
    expect(deleteData.details.status).toBe('COMPLETED');
  });
});

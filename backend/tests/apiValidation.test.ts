import { describe, it, expect, beforeEach } from 'vitest';
import { handler } from '../src/index';
import { DynamoRepository } from '../src/services/dynamoRepository';
import { QuotaService } from '../src/services/quotaService';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

function makeAuthEvent(
  method: string,
  rawPath: string,
  user?: { sub: string; email: string },
  body?: string | Record<string, unknown>
): APIGatewayProxyEventV2 {
  return {
    rawPath,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
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

describe('API Validation & Error Handling (Section 7)', () => {
  let quotaService: QuotaService;

  const admin = { sub: 'usr-admin-val', email: 'admin@val.org' };
  let orgId: string;

  beforeEach(async () => {
    DynamoRepository.clearMemory();
    quotaService = new QuotaService();

    const org = await quotaService.createOrganization({
      name: 'Validation Test Org',
      tier: 'FREE',
      ownerUserId: admin.sub,
      ownerEmail: admin.email,
      orgId: 'org-val-1',
    });
    orgId = org.orgId;
  });

  it('VAL-01: Rejects empty and whitespace-only strings for project and organization names', async () => {
    // 1. Empty organization name
    const emptyOrgRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations', admin, { name: '' })
    )) as { statusCode: number; body: string };
    expect(emptyOrgRes.statusCode).toBe(400);
    expect(JSON.parse(emptyOrgRes.body).code).toBe('VALIDATION_ERROR');

    // 2. Whitespace-only organization name
    const spaceOrgRes = (await handler(
      makeAuthEvent('POST', '/api/v1/organizations', admin, { name: '    ' })
    )) as { statusCode: number; body: string };
    expect(spaceOrgRes.statusCode).toBe(400);

    // 3. Empty project name
    const emptyProjRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, admin, { name: '' })
    )) as { statusCode: number; body: string };
    expect(emptyProjRes.statusCode).toBe(400);

    // 4. Whitespace-only project name
    const spaceProjRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, admin, { name: ' \t  ' })
    )) as { statusCode: number; body: string };
    expect(spaceProjRes.statusCode).toBe(400);
  });

  it('VAL-02: Gracefully handles malformed JSON request bodies without crashing or exposing stack traces', async () => {
    const malformedJsonRes = (await handler(
      makeAuthEvent('POST', `/api/v1/organizations/${orgId}/projects`, admin, '{ "name": "bad json ...')
    )) as { statusCode: number; body: string };

    expect(malformedJsonRes.statusCode).toBe(400);
    const parsed = JSON.parse(malformedJsonRes.body);
    expect(parsed.code).toBe('VALIDATION_ERROR');
    // Ensure no stack traces or raw errors are leaked
    expect(parsed.stack).toBeUndefined();
    expect(malformedJsonRes.body).not.toContain('node_modules');
  });

  it('VAL-03: Rejects invalid roles and wrong parameter types', async () => {
    // Invalid role in member update
    const invalidRoleRes = (await handler(
      makeAuthEvent('PATCH', `/api/v1/organizations/${orgId}/members/${admin.sub}`, admin, {
        role: 'SUPERUSER',
      })
    )) as { statusCode: number; body: string };
    expect(invalidRoleRes.statusCode).toBe(400);
    expect(JSON.parse(invalidRoleRes.body).code).toBe('INVALID_ROLE');
  });

  it('VAL-04: Returns 404 for unknown routes and nonexistent resources', async () => {
    // Unknown route
    const unknownRouteRes = (await handler(
      makeAuthEvent('GET', '/api/v1/nonexistent/endpoint', admin)
    )) as { statusCode: number; body: string };
    expect(unknownRouteRes.statusCode).toBe(404);
    expect(JSON.parse(unknownRouteRes.body).code).toBe('ROUTE_NOT_FOUND');

    // Nonexistent project
    const notFoundProjRes = (await handler(
      makeAuthEvent('GET', `/api/v1/organizations/${orgId}/projects/does-not-exist`, admin)
    )) as { statusCode: number; body: string };
    expect(notFoundProjRes.statusCode).toBe(404);
    expect(JSON.parse(notFoundProjRes.body).code).toBe('PROJECT_NOT_FOUND');
  });

  it('VAL-05: Handles repeated deletes safely with structured error without corruption', async () => {
    // Create and delete project
    const p = await quotaService.createProject({
      orgId,
      name: 'To Be Repeatedly Deleted',
      description: 'Test',
      userId: admin.sub,
      userEmail: admin.email,
    });

    // First delete -> 200
    const del1 = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgId}/projects/${p.projectId}`, admin)
    )) as { statusCode: number; body: string };
    expect(del1.statusCode).toBe(200);

    // Second delete -> 404
    const del2 = (await handler(
      makeAuthEvent('DELETE', `/api/v1/organizations/${orgId}/projects/${p.projectId}`, admin)
    )) as { statusCode: number; body: string };
    expect(del2.statusCode).toBe(404);
    expect(JSON.parse(del2.body).code).toBe('PROJECT_NOT_FOUND');
  });
});

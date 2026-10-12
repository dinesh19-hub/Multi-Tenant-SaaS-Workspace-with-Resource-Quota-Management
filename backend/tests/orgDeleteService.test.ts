import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoRepository } from '../src/services/dynamoRepository';
import { QuotaService } from '../src/services/quotaService';
import { OrgDeleteService } from '../src/services/orgDeleteService';
import { InviteService } from '../src/services/inviteService';
import { ForbiddenError } from '../src/middleware/errorHandler';

describe('7-Step Resumable Organization Deletion (Phase 7)', () => {
  let repo: DynamoRepository;
  let quotaService: QuotaService;
  let deleteService: OrgDeleteService;
  let inviteService: InviteService;

  beforeEach(() => {
    DynamoRepository.clearMemory();
    repo = new DynamoRepository();
    quotaService = new QuotaService(repo);
    deleteService = new OrgDeleteService(repo);
    inviteService = new InviteService(repo, quotaService);
  });

  it('successfully cleans up all projects, invites, and members without orphans', async () => {
    // 1. Create org
    const org = await quotaService.createOrganization({
      name: 'Deletion Target',
      tier: 'FREE',
      ownerUserId: 'admin-1',
      ownerEmail: 'admin@target.com',
      orgId: 'org-delete-1',
    });

    // 2. Add projects
    await quotaService.createProject({
      orgId: org.orgId,
      name: 'Proj 1',
      description: 'Desc 1',
      userId: 'admin-1',
      userEmail: 'admin@target.com',
    });
    await quotaService.createProject({
      orgId: org.orgId,
      name: 'Proj 2',
      description: 'Desc 2',
      userId: 'admin-1',
      userEmail: 'admin@target.com',
    });

    // 3. Add second member & invite
    await quotaService.joinOrganization({
      orgId: org.orgId,
      userId: 'member-2',
      email: 'm2@target.com',
      role: 'MEMBER',
    });
    await inviteService.createInvite({
      orgId: org.orgId,
      createdByUserId: 'admin-1',
    });

    // 4. Execute 7-step deletion
    const result = await deleteService.deleteOrganization(org.orgId, 'admin-1');

    expect(result.status).toBe('COMPLETED');
    expect(result.deletedProjects).toBe(2);
    expect(result.deletedMembers).toBe(2);
    expect(result.deletedInvites).toBe(1);

    // 5. Verify zero records remain in DynamoDB
    const check = await repo.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ORG#${org.orgId}` },
    });
    expect(check.Items.length).toBe(0);
  });

  it('rejects deletion attempt by non-admin member', async () => {
    const org = await quotaService.createOrganization({
      name: 'Protected Org',
      tier: 'FREE',
      ownerUserId: 'admin-chief',
      ownerEmail: 'chief@org.com',
      orgId: 'org-prot-1',
    });

    await quotaService.joinOrganization({
      orgId: org.orgId,
      userId: 'regular-user',
      email: 'regular@org.com',
      role: 'MEMBER',
    });

    await expect(
      deleteService.deleteOrganization(org.orgId, 'regular-user')
    ).rejects.toThrowError(ForbiddenError);
  });

  it('supports resuming deletion by a secondary administrator in the authorized snapshot', async () => {
    const org = await quotaService.createOrganization({
      name: 'Resume Org',
      tier: 'FREE',
      ownerUserId: 'admin-alpha',
      ownerEmail: 'alpha@org.com',
      orgId: 'org-resume-1',
    });

    // Add co-admin
    await quotaService.joinOrganization({
      orgId: org.orgId,
      userId: 'admin-beta',
      email: 'beta@org.com',
      role: 'ADMIN',
    });

    // Simulate Step 1 lockdown with authorized snapshot
    await repo.updateItem({
      Key: { PK: `ORG#${org.orgId}`, SK: 'METADATA' },
      UpdateExpression: 'SET #status = :deleting, #admins = :admins',
      ExpressionAttributeNames: { '#status': 'status', '#admins': 'authorizedAdminIds' },
      ExpressionAttributeValues: {
        ':deleting': 'DELETING',
        ':admins': ['admin-alpha', 'admin-beta'],
      },
    });

    // Admin-beta resumes the deletion
    const result = await deleteService.deleteOrganization(org.orgId, 'admin-beta');
    expect(result.status).toBe('COMPLETED');

    const check = await repo.getItem({
      Key: { PK: `ORG#${org.orgId}`, SK: 'METADATA' },
    });
    expect(check.Item).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { DynamoRepository } from '../src/services/dynamoRepository';
import { QuotaService } from '../src/services/quotaService';
import { QuotaExceededError, ConflictError } from '../src/middleware/errorHandler';

describe('DynamoDB Single-Table Design & Quota Service (Phase 6)', () => {
  let quotaService: QuotaService;

  beforeEach(() => {
    DynamoRepository.clearMemory();
    quotaService = new QuotaService();
  });

  describe('Transaction 0: Organization Creation', () => {
    it('creates organization metadata with correct tier limits and owner admin', async () => {
      const org = await quotaService.createOrganization({
        name: 'Acme Corp',
        tier: 'FREE',
        ownerUserId: 'usr-alice-1',
        ownerEmail: 'alice@acme.com',
        orgId: 'org-acme-1',
      });

      expect(org.orgId).toBe('org-acme-1');
      expect(org.tier).toBe('FREE');
      expect(org.maxProjects).toBe(10);
      expect(org.maxMembers).toBe(5);
      expect(org.projectCount).toBe(0);
      expect(org.memberCount).toBe(1);
      expect(org.adminCount).toBe(1);
      expect(org.status).toBe('ACTIVE');

      const meta = await quotaService.getOrgMetadata('org-acme-1');
      expect(meta).toBeDefined();
      expect(meta?.ownerUserId).toBe('usr-alice-1');
    });

    it('rejects duplicate organization creation with conflict', async () => {
      await quotaService.createOrganization({
        name: 'Org Once',
        tier: 'FREE',
        ownerUserId: 'usr-1',
        ownerEmail: 'u1@cloud.com',
        orgId: 'duplicate-org',
      });

      await expect(
        quotaService.createOrganization({
          name: 'Org Twice',
          tier: 'FREE',
          ownerUserId: 'usr-1',
          ownerEmail: 'u1@cloud.com',
          orgId: 'duplicate-org',
        })
      ).rejects.toThrowError(ConflictError);
    });
  });

  describe('Transaction 1: Project Creation & Atomic Quotas', () => {
    it('creates projects within quota and rejects creation when quota is exceeded', async () => {
      await quotaService.createOrganization({
        name: 'Small Team',
        tier: 'FREE', // max 10 projects
        ownerUserId: 'usr-owner',
        ownerEmail: 'owner@team.com',
        orgId: 'org-small-1',
      });

      // Create 10 projects up to the limit
      for (let i = 1; i <= 10; i++) {
        const proj = await quotaService.createProject({
          orgId: 'org-small-1',
          name: `Project ${i}`,
          description: `Description ${i}`,
          userId: 'usr-owner',
          userEmail: 'owner@team.com',
        });
        expect(proj.name).toBe(`Project ${i}`);
      }

      const metaAtLimit = await quotaService.getOrgMetadata('org-small-1');
      expect(metaAtLimit?.projectCount).toBe(10);

      // Attempting 11th project MUST be rejected with QuotaExceededError
      await expect(
        quotaService.createProject({
          orgId: 'org-small-1',
          name: 'Project 11 (Over limit)',
          description: 'Should fail',
          userId: 'usr-owner',
          userEmail: 'owner@team.com',
        })
      ).rejects.toThrowError(QuotaExceededError);

      // Verify count did NOT increment past 10
      const metaAfterFail = await quotaService.getOrgMetadata('org-small-1');
      expect(metaAfterFail?.projectCount).toBe(10);
    });
  });

  describe('Transaction 2: Member Joining & Member Quota Enforcement', () => {
    it('allows joining within quota and enforces member limit', async () => {
      await quotaService.createOrganization({
        name: 'Startup',
        tier: 'FREE', // max 5 members (initial count = 1)
        ownerUserId: 'usr-founder',
        ownerEmail: 'founder@startup.com',
        orgId: 'org-startup-1',
      });

      // Add 4 more members to reach 5 total
      for (let i = 2; i <= 5; i++) {
        await quotaService.joinOrganization({
          orgId: 'org-startup-1',
          userId: `usr-member-${i}`,
          email: `member${i}@startup.com`,
          role: 'MEMBER',
        });
      }

      const metaAtLimit = await quotaService.getOrgMetadata('org-startup-1');
      expect(metaAtLimit?.memberCount).toBe(5);

      // 6th member must fail
      await expect(
        quotaService.joinOrganization({
          orgId: 'org-startup-1',
          userId: 'usr-member-6',
          email: 'member6@startup.com',
        })
      ).rejects.toThrowError(QuotaExceededError);
    });

    it('rejects duplicate member joining', async () => {
      await quotaService.createOrganization({
        name: 'Org Single',
        tier: 'FREE',
        ownerUserId: 'usr-alice',
        ownerEmail: 'alice@org.com',
        orgId: 'org-single-1',
      });

      await expect(
        quotaService.joinOrganization({
          orgId: 'org-single-1',
          userId: 'usr-alice',
          email: 'alice@org.com',
        })
      ).rejects.toThrowError(ConflictError);
    });
  });

  describe('Transaction 3: Project Deletion & Atomic Quota Recovery', () => {
    it('decrements projectCount on deletion and reopens quota slot', async () => {
      await quotaService.createOrganization({
        name: 'Workspace',
        tier: 'FREE',
        ownerUserId: 'usr-1',
        ownerEmail: 'u1@ws.com',
        orgId: 'org-ws-1',
      });

      // Fill 5 slots
      for (let i = 1; i <= 5; i++) {
        await quotaService.createProject({
          orgId: 'org-ws-1',
          name: `P${i}`,
          description: `Desc ${i}`,
          userId: 'usr-1',
          userEmail: 'u1@ws.com',
          projectId: `proj-${i}`,
        });
      }

      // Delete project 1
      await quotaService.deleteProject({
        orgId: 'org-ws-1',
        projectId: 'proj-1',
      });

      const meta = await quotaService.getOrgMetadata('org-ws-1');
      expect(meta?.projectCount).toBe(4);

      // Now creating a new project succeeds
      const newProj = await quotaService.createProject({
        orgId: 'org-ws-1',
        name: 'Project Replacement',
        description: 'New Project in freed slot',
        userId: 'usr-1',
        userEmail: 'u1@ws.com',
      });
      expect(newProj.name).toBe('Project Replacement');

      const metaAfterReclaim = await quotaService.getOrgMetadata('org-ws-1');
      expect(metaAfterReclaim?.projectCount).toBe(5);
    });
  });

  describe('Transaction 4 & 5: Member Management & Last-Admin Protection', () => {
    it('prevents removing the last administrator of an organization', async () => {
      await quotaService.createOrganization({
        name: 'Admin Test',
        tier: 'FREE',
        ownerUserId: 'sole-admin',
        ownerEmail: 'admin@test.com',
        orgId: 'org-admin-1',
      });

      // Attempting to remove sole admin fails
      await expect(
        quotaService.removeMember({
          orgId: 'org-admin-1',
          userId: 'sole-admin',
        })
      ).rejects.toThrowError(/Cannot remove the last administrator/);
    });

    it('prevents demoting the last administrator', async () => {
      await quotaService.createOrganization({
        name: 'Demote Test',
        tier: 'FREE',
        ownerUserId: 'sole-admin-2',
        ownerEmail: 'admin2@test.com',
        orgId: 'org-admin-2',
      });

      await expect(
        quotaService.updateMemberRole({
          orgId: 'org-admin-2',
          userId: 'sole-admin-2',
          newRole: 'MEMBER',
        })
      ).rejects.toThrowError(/Cannot demote the last administrator/);
    });

    it('allows promotion to Admin, and subsequent demotion/removal when > 1 admin exists', async () => {
      await quotaService.createOrganization({
        name: 'Multi Admin Org',
        tier: 'FREE',
        ownerUserId: 'admin-one',
        ownerEmail: 'one@multi.com',
        orgId: 'org-multi-1',
      });

      await quotaService.joinOrganization({
        orgId: 'org-multi-1',
        userId: 'user-two',
        email: 'two@multi.com',
        role: 'MEMBER',
      });

      // Promote user-two to Admin
      await quotaService.updateMemberRole({
        orgId: 'org-multi-1',
        userId: 'user-two',
        newRole: 'ADMIN',
      });

      let meta = await quotaService.getOrgMetadata('org-multi-1');
      expect(meta?.adminCount).toBe(2);

      // Now demoting admin-one succeeds because adminCount was 2
      await quotaService.updateMemberRole({
        orgId: 'org-multi-1',
        userId: 'admin-one',
        newRole: 'MEMBER',
      });

      meta = await quotaService.getOrgMetadata('org-multi-1');
      expect(meta?.adminCount).toBe(1);

      // Now user-two is the sole admin. Demoting user-two fails
      await expect(
        quotaService.updateMemberRole({
          orgId: 'org-multi-1',
          userId: 'user-two',
          newRole: 'MEMBER',
        })
      ).rejects.toThrowError(/Cannot demote the last administrator/);
    });
  });
});

import { v4 as uuidv4 } from 'uuid';
import { DynamoRepository, TransactionCanceledException } from './dynamoRepository';
import {
  WorkspaceTier,
  MemberRole,
  TIER_CONFIG,
  OrgMetadataItem,
  OrgMemberItem,
  OrgProjectItem,
} from '../types/database';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  QuotaExceededError,
} from '../middleware/errorHandler';

export class QuotaService {
  private repo: DynamoRepository;

  constructor(repo?: DynamoRepository) {
    this.repo = repo || new DynamoRepository();
  }

  /**
   * Transaction 0: Organization Creation
   * Atomic creation of OrgMetadata and initial Owner Admin membership
   */
  public async createOrganization(params: {
    name: string;
    tier: WorkspaceTier;
    ownerUserId: string;
    ownerEmail: string;
    orgId?: string;
  }): Promise<OrgMetadataItem> {
    const orgId = params.orgId || uuidv4();
    const tierConfig = TIER_CONFIG[params.tier];
    if (!tierConfig) {
      throw new BadRequestError(`Invalid organization tier: ${params.tier}`, 'INVALID_TIER');
    }

    const now = new Date().toISOString();

    const metadataItem: OrgMetadataItem = {
      PK: `ORG#${orgId}`,
      SK: 'METADATA',
      orgId,
      name: params.name,
      tier: params.tier,
      maxProjects: tierConfig.maxProjects,
      maxMembers: tierConfig.maxMembers,
      projectCount: 0,
      memberCount: 1,
      adminCount: 1,
      ownerUserId: params.ownerUserId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    const ownerMemberItem: OrgMemberItem = {
      PK: `ORG#${orgId}`,
      SK: `MEMBER#${params.ownerUserId}`,
      GSI1PK: `USER#${params.ownerUserId}`,
      GSI1SK: `ORG#${orgId}`,
      orgId,
      userId: params.ownerUserId,
      email: params.ownerEmail,
      role: 'ADMIN',
      joinedAt: now,
    };

    try {
      await this.repo.transactWrite({
        TransactItems: [
          {
            Put: {
              Item: metadataItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              Item: ownerMemberItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      });
      return metadataItem;
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        throw new ConflictError('Organization ID already exists.', 'ORG_ALREADY_EXISTS');
      }
      throw err;
    }
  }

  /**
   * Transaction 1: Project Creation (Atomic Quota Enforcement)
   * Atomically checks projectCount < maxProjects and increments projectCount while creating project item
   */
  public async createProject(params: {
    orgId: string;
    name: string;
    description: string;
    userId: string;
    userEmail: string;
    projectId?: string;
  }): Promise<OrgProjectItem> {
    const projectId = params.projectId || uuidv4();
    const now = new Date().toISOString();

    const projectItem: OrgProjectItem = {
      PK: `ORG#${params.orgId}`,
      SK: `PROJECT#${projectId}`,
      GSI1PK: `ORG#${params.orgId}`,
      GSI1SK: `PROJECT#${now}`,
      orgId: params.orgId,
      projectId,
      name: params.name,
      description: params.description,
      createdBy: params.userId,
      creatorEmail: params.userEmail,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.repo.transactWrite({
        TransactItems: [
          {
            Update: {
              Key: { PK: `ORG#${params.orgId}`, SK: 'METADATA' },
              UpdateExpression: 'SET #updatedAt = :now ADD #pCount :inc',
              ConditionExpression:
                'attribute_exists(PK) AND #status = :active AND #pCount < #maxProjects',
              ExpressionAttributeNames: {
                '#status': 'status',
                '#pCount': 'projectCount',
                '#maxProjects': 'maxProjects',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':active': 'ACTIVE',
                ':inc': 1,
                ':now': now,
              },
            },
          },
          {
            Put: {
              Item: projectItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      });
      return projectItem;
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        // Inspect org metadata to determine precise failure reason
        const meta = await this.getOrgMetadata(params.orgId);
        if (!meta) {
          throw new NotFoundError('Organization not found.', 'ORG_NOT_FOUND');
        }
        if (meta.status === 'DELETING') {
          throw new BadRequestError(
            'Organization is currently being deleted and cannot accept new projects.',
            'ORG_DELETING'
          );
        }
        if (meta.projectCount >= meta.maxProjects) {
          throw new QuotaExceededError(
            `Project quota reached (${meta.projectCount}/${meta.maxProjects}) for tier ${meta.tier}. Please upgrade your tier to create more projects.`,
            'PROJECT_QUOTA_EXCEEDED'
          );
        }
      }
      throw err;
    }
  }

  /**
   * Transaction 2: Member Joining (Atomic Quota Enforcement)
   * Atomically checks memberCount < maxMembers and increments count while adding member record
   */
  public async joinOrganization(params: {
    orgId: string;
    userId: string;
    email: string;
    role?: MemberRole;
  }): Promise<OrgMemberItem> {
    const role: MemberRole = params.role || 'MEMBER';
    const now = new Date().toISOString();

    const memberItem: OrgMemberItem = {
      PK: `ORG#${params.orgId}`,
      SK: `MEMBER#${params.userId}`,
      GSI1PK: `USER#${params.userId}`,
      GSI1SK: `ORG#${params.orgId}`,
      orgId: params.orgId,
      userId: params.userId,
      email: params.email,
      role,
      joinedAt: now,
    };

    const updateExpression =
      role === 'ADMIN'
        ? 'SET #updatedAt = :now ADD #mCount :inc, #aCount :inc'
        : 'SET #updatedAt = :now ADD #mCount :inc';

    const names: Record<string, string> = {
      '#status': 'status',
      '#mCount': 'memberCount',
      '#maxMembers': 'maxMembers',
      '#updatedAt': 'updatedAt',
    };
    if (role === 'ADMIN') {
      names['#aCount'] = 'adminCount';
    }

    try {
      await this.repo.transactWrite({
        TransactItems: [
          {
            Update: {
              Key: { PK: `ORG#${params.orgId}`, SK: 'METADATA' },
              UpdateExpression: updateExpression,
              ConditionExpression:
                'attribute_exists(PK) AND #status = :active AND #mCount < #maxMembers',
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: {
                ':active': 'ACTIVE',
                ':inc': 1,
                ':now': now,
              },
            },
          },
          {
            Put: {
              Item: memberItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      });
      return memberItem;
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        // Inspect whether user already exists or quota is full
        const existingMember = await this.repo.getItem<OrgMemberItem>({
          Key: { PK: `ORG#${params.orgId}`, SK: `MEMBER#${params.userId}` },
        });
        if (existingMember.Item) {
          throw new ConflictError('User is already a member of this organization.', 'MEMBER_EXISTS');
        }

        const meta = await this.getOrgMetadata(params.orgId);
        if (!meta) {
          throw new NotFoundError('Organization not found.', 'ORG_NOT_FOUND');
        }
        if (meta.status === 'DELETING') {
          throw new BadRequestError('Organization is being deleted.', 'ORG_DELETING');
        }
        if (meta.memberCount >= meta.maxMembers) {
          throw new QuotaExceededError(
            `Member quota reached (${meta.memberCount}/${meta.maxMembers}) for tier ${meta.tier}.`,
            'MEMBER_QUOTA_EXCEEDED'
          );
        }
      }
      throw err;
    }
  }

  /**
   * Transaction 3: Project Deletion (Atomic Quota Decrement)
   * Atomically decrements projectCount and removes project item
   */
  public async deleteProject(params: { orgId: string; projectId: string }): Promise<void> {
    const now = new Date().toISOString();

    try {
      await this.repo.transactWrite({
        TransactItems: [
          {
            Update: {
              Key: { PK: `ORG#${params.orgId}`, SK: 'METADATA' },
              UpdateExpression: 'SET #updatedAt = :now ADD #pCount :dec',
              ConditionExpression: 'attribute_exists(PK) AND #pCount > :zero',
              ExpressionAttributeNames: {
                '#pCount': 'projectCount',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':zero': 0,
                ':dec': -1,
                ':now': now,
              },
            },
          },
          {
            Delete: {
              Key: { PK: `ORG#${params.orgId}`, SK: `PROJECT#${params.projectId}` },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      });
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        const proj = await this.repo.getItem({
          Key: { PK: `ORG#${params.orgId}`, SK: `PROJECT#${params.projectId}` },
        });
        if (!proj.Item) {
          throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND');
        }
      }
      throw err;
    }
  }

  /**
   * Transaction 4: Member Removal (Atomic Quota Decrement & Last-Admin Check)
   * Atomically decrements memberCount (and adminCount if admin) with last-admin guard
   */
  public async removeMember(params: {
    orgId: string;
    userId: string;
  }): Promise<void> {
    const memberRes = await this.repo.getItem<OrgMemberItem>({
      Key: { PK: `ORG#${params.orgId}`, SK: `MEMBER#${params.userId}` },
    });
    const member = memberRes.Item;
    if (!member) {
      throw new NotFoundError('Member not found in organization.', 'MEMBER_NOT_FOUND');
    }

    const now = new Date().toISOString();
    const isAdmin = member.role === 'ADMIN';

    const updateExpression = isAdmin
      ? 'SET #updatedAt = :now ADD #mCount :dec, #aCount :dec'
      : 'SET #updatedAt = :now ADD #mCount :dec';

    const conditionExpression = isAdmin
      ? 'attribute_exists(PK) AND #mCount > :one AND #aCount > :one'
      : 'attribute_exists(PK) AND #mCount > :one';

    const names: Record<string, string> = {
      '#mCount': 'memberCount',
      '#updatedAt': 'updatedAt',
    };
    if (isAdmin) {
      names['#aCount'] = 'adminCount';
    }

    try {
      await this.repo.transactWrite({
        TransactItems: [
          {
            Update: {
              Key: { PK: `ORG#${params.orgId}`, SK: 'METADATA' },
              UpdateExpression: updateExpression,
              ConditionExpression: conditionExpression,
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: {
                ':one': 1,
                ':dec': -1,
                ':now': now,
              },
            },
          },
          {
            Delete: {
              Key: { PK: `ORG#${params.orgId}`, SK: `MEMBER#${params.userId}` },
              ConditionExpression: 'attribute_exists(PK)',
            },
          },
        ],
      });
    } catch (err) {
      if (err instanceof TransactionCanceledException) {
        const meta = await this.getOrgMetadata(params.orgId);
        if (isAdmin && meta && meta.adminCount <= 1) {
          throw new ConflictError(
            'Cannot remove the last administrator of the organization. Transfer administration first.',
            'CANNOT_REMOVE_LAST_ADMIN'
          );
        }
        if (meta && meta.memberCount <= 1) {
          throw new ConflictError(
            'Cannot remove the sole remaining member of the organization. Delete organization instead.',
            'CANNOT_REMOVE_SOLE_MEMBER'
          );
        }
      }
      throw err;
    }
  }

  /**
   * Transaction 5: Member Role Update (Admin Promotion / Demotion with Last-Admin Guard)
   */
  public async updateMemberRole(params: {
    orgId: string;
    userId: string;
    newRole: MemberRole;
  }): Promise<void> {
    const memberRes = await this.repo.getItem<OrgMemberItem>({
      Key: { PK: `ORG#${params.orgId}`, SK: `MEMBER#${params.userId}` },
    });
    const member = memberRes.Item;
    if (!member) {
      throw new NotFoundError('Member not found in organization.', 'MEMBER_NOT_FOUND');
    }

    if (member.role === params.newRole) {
      return; // Already in target role
    }

    const now = new Date().toISOString();

    if (params.newRole === 'MEMBER') {
      // Demoting Admin -> Member
      try {
        await this.repo.transactWrite({
          TransactItems: [
            {
              Update: {
                Key: { PK: `ORG#${params.orgId}`, SK: 'METADATA' },
                UpdateExpression: 'SET #updatedAt = :now ADD #aCount :dec',
                ConditionExpression: 'attribute_exists(PK) AND #aCount > :one',
                ExpressionAttributeNames: {
                  '#aCount': 'adminCount',
                  '#updatedAt': 'updatedAt',
                },
                ExpressionAttributeValues: {
                  ':one': 1,
                  ':dec': -1,
                  ':now': now,
                },
              },
            },
            {
              Update: {
                Key: { PK: `ORG#${params.orgId}`, SK: `MEMBER#${params.userId}` },
                UpdateExpression: 'SET #role = :memberRole, #updatedAt = :now',
                ConditionExpression: 'attribute_exists(PK) AND #role = :adminRole',
                ExpressionAttributeNames: {
                  '#role': 'role',
                  '#updatedAt': 'updatedAt',
                },
                ExpressionAttributeValues: {
                  ':memberRole': 'MEMBER',
                  ':adminRole': 'ADMIN',
                  ':now': now,
                },
              },
            },
          ],
        });
      } catch (err) {
        if (err instanceof TransactionCanceledException) {
          const meta = await this.getOrgMetadata(params.orgId);
          if (meta && meta.adminCount <= 1) {
            throw new ConflictError(
              'Cannot demote the last administrator of the organization.',
              'CANNOT_DEMOTE_LAST_ADMIN'
            );
          }
        }
        throw err;
      }
    } else {
      // Promoting Member -> Admin
      await this.repo.transactWrite({
        TransactItems: [
          {
            Update: {
              Key: { PK: `ORG#${params.orgId}`, SK: 'METADATA' },
              UpdateExpression: 'SET #updatedAt = :now ADD #aCount :inc',
              ConditionExpression: 'attribute_exists(PK)',
              ExpressionAttributeNames: {
                '#aCount': 'adminCount',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':inc': 1,
                ':now': now,
              },
            },
          },
          {
            Update: {
              Key: { PK: `ORG#${params.orgId}`, SK: `MEMBER#${params.userId}` },
              UpdateExpression: 'SET #role = :adminRole, #updatedAt = :now',
              ConditionExpression: 'attribute_exists(PK) AND #role = :memberRole',
              ExpressionAttributeNames: {
                '#role': 'role',
                '#updatedAt': 'updatedAt',
              },
              ExpressionAttributeValues: {
                ':adminRole': 'ADMIN',
                ':memberRole': 'MEMBER',
                ':now': now,
              },
            },
          },
        ],
      });
    }
  }

  /**
   * Helper to retrieve OrgMetadata item
   */
  public async getOrgMetadata(orgId: string): Promise<OrgMetadataItem | null> {
    const res = await this.repo.getItem<OrgMetadataItem>({
      Key: { PK: `ORG#${orgId}`, SK: 'METADATA' },
    });
    return res.Item || null;
  }
}

import { DynamoRepository, KeyRecord } from './dynamoRepository';
import { OrgMetadataItem, OrgMemberItem, DynamoDbItem } from '../types/database';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';

export interface DeletionProgress {
  step: number;
  status: 'IN_PROGRESS' | 'COMPLETED';
  deletedProjects: number;
  deletedInvites: number;
  deletedAuditLogs: number;
  deletedMembers: number;
}

export class OrgDeleteService {
  private repo: DynamoRepository;

  constructor(repo?: DynamoRepository) {
    this.repo = repo || new DynamoRepository();
  }

  /**
   * Helper executing batch delete requests with exponential backoff retries for UnprocessedItems
   */
  private async batchDeleteWithBackoff(keys: KeyRecord[]): Promise<number> {
    if (keys.length === 0) return 0;

    const tableName = this.repo.getTableName();
    let totalDeleted = 0;

    // Chunk into batches of up to 25 items (DynamoDB BatchWriteItem limit)
    const chunkSize = 25;
    for (let i = 0; i < keys.length; i += chunkSize) {
      let currentChunk = keys.slice(i, i + chunkSize);
      let attempts = 0;
      const maxRetries = 5;

      while (currentChunk.length > 0 && attempts <= maxRetries) {
        const deleteRequests = currentChunk.map((k) => ({
          DeleteRequest: { Key: { PK: k.PK, SK: k.SK } },
        }));

        const result = await this.repo.batchWrite({
          RequestItems: {
            [tableName]: deleteRequests,
          },
        });

        const unprocessed = result.UnprocessedItems?.[tableName] as
          | Array<{ DeleteRequest?: { Key: KeyRecord } }>
          | undefined;

        if (unprocessed && unprocessed.length > 0) {
          attempts++;
          if (attempts > maxRetries) {
            throw new Error(`Failed to delete items after ${maxRetries} exponential backoff attempts.`);
          }
          const backoffMs = Math.min(1000, 50 * Math.pow(2, attempts));
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          currentChunk = unprocessed.map((u) => u.DeleteRequest!.Key);
        } else {
          totalDeleted += currentChunk.length;
          break;
        }
      }
    }

    return totalDeleted;
  }

  /**
   * 7-Step Resumable Organization Deletion Algorithm
   */
  public async deleteOrganization(
    orgId: string,
    requestingUserId: string
  ): Promise<DeletionProgress> {
    const progress: DeletionProgress = {
      step: 0,
      status: 'IN_PROGRESS',
      deletedProjects: 0,
      deletedInvites: 0,
      deletedAuditLogs: 0,
      deletedMembers: 0,
    };

    // STEP 1: Lockdown and Admin Snapshot
    progress.step = 1;
    const metaRes = await this.repo.getItem<OrgMetadataItem>({
      Key: { PK: `ORG#${orgId}`, SK: 'METADATA' },
      ConsistentRead: true,
    });
    const meta = metaRes.Item;
    if (!meta) {
      throw new NotFoundError('Organization not found.', 'ORG_NOT_FOUND');
    }

    const now = new Date().toISOString();

    if (meta.status === 'DELETING') {
      // Resuming an interrupted deletion: verify user is in the authorized admin snapshot
      const authorized = meta.authorizedAdminIds || [meta.ownerUserId];
      if (!authorized.includes(requestingUserId)) {
        throw new ForbiddenError(
          'Only authorized administrators captured at deletion lockdown can resume cleanup.',
          'UNAUTHORIZED_DELETION_RESUMPTION'
        );
      }
    } else {
      // Initial initiation: verify requesting user is an active ADMIN
      const memberRes = await this.repo.getItem<OrgMemberItem>({
        Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${requestingUserId}` },
      });
      if (!memberRes.Item || memberRes.Item.role !== 'ADMIN') {
        throw new ForbiddenError(
          'Only an administrator of this organization can initiate deletion.',
          'FORBIDDEN'
        );
      }

      // Query all current administrators to record immutable authorization snapshot
      const allMembers = await this.repo.query<OrgMemberItem>({
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
      });
      const adminIds = allMembers.Items
        .filter((item) => (item.SK as string).startsWith('MEMBER#') && item.role === 'ADMIN')
        .map((admin) => admin.userId);

      // Lock status to DELETING
      await this.repo.updateItem({
        Key: { PK: `ORG#${orgId}`, SK: 'METADATA' },
        UpdateExpression:
          'SET #status = :deleting, #startedAt = :now, #admins = :admins, #updatedAt = :now',
        ConditionExpression: 'attribute_exists(PK) AND #status = :active',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#startedAt': 'deletionStartedAt',
          '#admins': 'authorizedAdminIds',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':active': 'ACTIVE',
          ':deleting': 'DELETING',
          ':now': now,
          ':admins': adminIds.length > 0 ? adminIds : [requestingUserId],
        },
      });
    }

    // Query all items under ORG#<orgId> for cleanup steps
    const allOrgItems = await this.repo.query<DynamoDbItem>({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
      ConsistentRead: true,
    });

    // STEP 2: Project Cleanup
    progress.step = 2;
    const projectKeys = allOrgItems.Items
      .filter((i) => (i.SK as string).startsWith('PROJECT#'))
      .map((i) => ({ PK: i.PK as string, SK: i.SK as string }));
    progress.deletedProjects = await this.batchDeleteWithBackoff(projectKeys);

    // STEP 3: Invite Cleanup
    progress.step = 3;
    const inviteKeys = allOrgItems.Items
      .filter((i) => (i.SK as string).startsWith('INVITE#'))
      .map((i) => ({ PK: i.PK as string, SK: i.SK as string }));
    progress.deletedInvites = await this.batchDeleteWithBackoff(inviteKeys);

    // STEP 4: Audit Log Cleanup
    progress.step = 4;
    const auditKeys = allOrgItems.Items
      .filter((i) => (i.SK as string).startsWith('AUDIT#'))
      .map((i) => ({ PK: i.PK as string, SK: i.SK as string }));
    progress.deletedAuditLogs = await this.batchDeleteWithBackoff(auditKeys);

    // STEP 5: Member Cleanup
    progress.step = 5;
    const memberKeys = allOrgItems.Items
      .filter((i) => (i.SK as string).startsWith('MEMBER#'))
      .map((i) => ({ PK: i.PK as string, SK: i.SK as string }));
    progress.deletedMembers = await this.batchDeleteWithBackoff(memberKeys);

    // STEP 6: Strongly Consistent Orphan Verification
    progress.step = 6;
    const remainingItems = await this.repo.query<DynamoDbItem>({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
      ConsistentRead: true,
    });

    const orphans = remainingItems.Items.filter((i) => i.SK !== 'METADATA');
    if (orphans.length > 0) {
      throw new Error(
        `Orphan verification failed: ${orphans.length} items still remain under ORG#${orgId}.`
      );
    }

    // STEP 7: Delete Metadata Record
    progress.step = 7;
    await this.repo.deleteItem({
      Key: { PK: `ORG#${orgId}`, SK: 'METADATA' },
    });

    progress.status = 'COMPLETED';
    return progress;
  }
}

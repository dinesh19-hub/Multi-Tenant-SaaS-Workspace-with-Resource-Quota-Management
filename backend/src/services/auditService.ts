import { v4 as uuidv4 } from 'uuid';
import { DynamoRepository } from './dynamoRepository';
import { AuditLogItem } from '../types/database';

export class AuditService {
  private repo: DynamoRepository;

  constructor(repo?: DynamoRepository) {
    this.repo = repo || new DynamoRepository();
  }

  /**
   * Records an audit log event for an organization
   */
  public async recordEvent(params: {
    orgId: string;
    action: string;
    actorUserId: string;
    actorEmail: string;
    targetId?: string;
    targetType?: string;
    details?: Record<string, unknown>;
  }): Promise<AuditLogItem> {
    const auditId = uuidv4();
    const timestamp = new Date().toISOString();

    const auditItem: AuditLogItem = {
      PK: `ORG#${params.orgId}`,
      SK: `AUDIT#${timestamp}#${auditId}`,
      orgId: params.orgId,
      auditId,
      action: params.action,
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      targetId: params.targetId,
      targetType: params.targetType,
      details: params.details || {},
      timestamp,
    };

    try {
      await this.repo.putItem({
        Item: auditItem,
      });
    } catch (err) {
      // Non-blocking: audit emission failure should not crash main request
      console.warn('Failed to persist audit log item:', err);
    }

    return auditItem;
  }

  /**
   * Retrieves recent audit log events for an organization in reverse chronological order
   */
  public async getAuditLogs(orgId: string, limit: number = 50): Promise<AuditLogItem[]> {
    const res = await this.repo.query<AuditLogItem>({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ORG#${orgId}` },
      ScanIndexForward: false, // Descending order
    });

    const auditLogs = res.Items.filter((item) =>
      (item.SK as string)?.startsWith('AUDIT#')
    );

    return auditLogs.slice(0, limit);
  }
}

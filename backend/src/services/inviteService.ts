import { DynamoRepository } from './dynamoRepository';
import { QuotaService } from './quotaService';
import { OrgInviteItem, MemberRole } from '../types/database';
import { BadRequestError, NotFoundError, ConflictError } from '../middleware/errorHandler';

export class InviteService {
  private repo: DynamoRepository;
  private quotaService: QuotaService;

  constructor(repo?: DynamoRepository, quotaService?: QuotaService) {
    this.repo = repo || new DynamoRepository();
    this.quotaService = quotaService || new QuotaService(this.repo);
  }

  /**
   * Generates an invite for an organization
   */
  public async createInvite(params: {
    orgId: string;
    createdByUserId: string;
    role?: MemberRole;
    maxUses?: number;
    expiresInHours?: number;
  }): Promise<OrgInviteItem> {
    const org = await this.quotaService.getOrgMetadata(params.orgId);
    if (!org) {
      throw new NotFoundError('Organization not found.', 'ORG_NOT_FOUND');
    }
    if (org.status === 'DELETING') {
      throw new BadRequestError('Cannot create invites for an organization being deleted.', 'ORG_DELETING');
    }

    // Generate random 8-character code
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    const now = new Date();
    const expiryHours = params.expiresInHours || 72;
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000).toISOString();

    const inviteItem: OrgInviteItem = {
      PK: `ORG#${params.orgId}`,
      SK: `INVITE#${inviteCode}`,
      GSI1PK: `INVITE#${inviteCode}`,
      GSI1SK: 'METADATA',
      orgId: params.orgId,
      inviteCode,
      role: params.role || 'MEMBER',
      createdBy: params.createdByUserId,
      expiresAt,
      usedCount: 0,
      maxUses: params.maxUses || 1,
      createdAt: now.toISOString(),
    };

    await this.repo.putItem({
      Item: inviteItem,
      ConditionExpression: 'attribute_not_exists(PK)',
    });

    return inviteItem;
  }

  /**
   * Redeems an invite code for a user
   */
  public async redeemInvite(params: {
    inviteCode: string;
    userId: string;
    email: string;
  }): Promise<{ orgId: string; role: MemberRole }> {
    // Look up invite by GSI1
    const res = await this.repo.query<OrgInviteItem>({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :code',
      ExpressionAttributeValues: {
        ':code': `INVITE#${params.inviteCode.toUpperCase()}`,
      },
    });

    const invite = res.Items[0];
    if (!invite) {
      throw new NotFoundError('Invalid invite code.', 'INVITE_NOT_FOUND');
    }

    // Check expiration
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      throw new BadRequestError('Invite code has expired.', 'INVITE_EXPIRED');
    }

    // Check uses
    if (invite.usedCount >= invite.maxUses) {
      throw new ConflictError('Invite code has already reached its maximum uses.', 'INVITE_EXHAUSTED');
    }

    // Atomically join organization using Transaction 2
    await this.quotaService.joinOrganization({
      orgId: invite.orgId,
      userId: params.userId,
      email: params.email,
      role: invite.role,
    });

    // Increment invite usage
    await this.repo.updateItem({
      Key: { PK: invite.PK, SK: invite.SK },
      UpdateExpression: 'ADD #used :inc',
      ExpressionAttributeNames: { '#used': 'usedCount' },
      ExpressionAttributeValues: { ':inc': 1 },
    });

    return { orgId: invite.orgId, role: invite.role };
  }
}

export type WorkspaceTier = 'FREE' | 'STANDARD' | 'PREMIUM';
export type MemberRole = 'ADMIN' | 'MEMBER';
export type OrgStatus = 'ACTIVE' | 'DELETING';

export interface TierQuotas {
  maxProjects: number;
  maxMembers: number;
}

export const TIER_CONFIG: Record<WorkspaceTier, TierQuotas> = {
  FREE: {
    maxProjects: 10,
    maxMembers: 5,
  },
  STANDARD: {
    maxProjects: 50,
    maxMembers: 25,
  },
  PREMIUM: {
    maxProjects: 200,
    maxMembers: 100,
  },
};

export interface BaseDynamoItem {
  PK: string;
  SK: string;
  [key: string]: unknown;
}

export interface OrgMetadataItem extends BaseDynamoItem {
  PK: string; // ORG#<orgId>
  SK: string; // METADATA
  orgId: string;
  name: string;
  tier: WorkspaceTier;
  maxProjects: number;
  maxMembers: number;
  projectCount: number;
  memberCount: number;
  adminCount: number;
  ownerUserId: string;
  status: OrgStatus;
  createdAt: string;
  updatedAt: string;
  deletionStartedAt?: string;
  authorizedAdminIds?: string[];
}

export interface OrgMemberItem extends BaseDynamoItem {
  PK: string; // ORG#<orgId>
  SK: string; // MEMBER#<userId>
  GSI1PK: string; // USER#<userId>
  GSI1SK: string; // ORG#<orgId>
  orgId: string;
  userId: string;
  email: string;
  role: MemberRole;
  joinedAt: string;
}

export interface OrgProjectItem extends BaseDynamoItem {
  PK: string; // ORG#<orgId>
  SK: string; // PROJECT#<projectId>
  GSI1PK: string; // ORG#<orgId>
  GSI1SK: string; // PROJECT#<updatedAt>
  orgId: string;
  projectId: string;
  name: string;
  description: string;
  createdBy: string;
  creatorEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgInviteItem extends BaseDynamoItem {
  PK: string; // ORG#<orgId>
  SK: string; // INVITE#<inviteCode>
  GSI1PK: string; // INVITE#<inviteCode>
  GSI1SK: string; // METADATA
  orgId: string;
  inviteCode: string;
  role: MemberRole;
  createdBy: string;
  expiresAt: string;
  usedCount: number;
  maxUses: number;
  createdAt: string;
}

export interface AuditLogItem extends BaseDynamoItem {
  PK: string; // ORG#<orgId>
  SK: string; // AUDIT#<timestamp>#<auditId>
  orgId: string;
  auditId: string;
  action: string;
  actorUserId: string;
  actorEmail: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export type DynamoDbItem =
  | OrgMetadataItem
  | OrgMemberItem
  | OrgProjectItem
  | OrgInviteItem
  | AuditLogItem
  | BaseDynamoItem;

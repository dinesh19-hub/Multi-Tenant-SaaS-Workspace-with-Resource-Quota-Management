import { AuthService } from './authService';

export interface ApiOrganization {
  orgId: string;
  name: string;
  tier: 'FREE' | 'STANDARD' | 'PREMIUM';
  quotaTier?: 'FREE' | 'STANDARD' | 'PREMIUM';
  role?: 'ADMIN' | 'MEMBER';
  userRole?: 'ADMIN' | 'MEMBER';
  projectCount: number;
  maxProjects: number;
  memberCount: number;
  maxMembers: number;
  adminCount?: number;
  createdAt?: string;
  status?: string;
}

export interface ApiMember {
  userId: string;
  email: string;
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

export interface ApiProject {
  projectId: string;
  name: string;
  description: string;
  createdBy: string;
  creatorEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiInvite {
  inviteCode: string;
  role: 'ADMIN' | 'MEMBER';
  expiresAt: string;
  maxUses: number;
  usedCount: number;
}

export interface ApiAuditLog {
  auditId: string;
  action: string;
  actorEmail: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

const STORAGE_ORGS_KEY = 'saas_mock_api_orgs';
const STORAGE_PROJECTS_KEY = 'saas_mock_api_projects';
const STORAGE_MEMBERS_KEY = 'saas_mock_api_members';
const STORAGE_INVITES_KEY = 'saas_mock_api_invites';
const STORAGE_AUDIT_KEY = 'saas_mock_api_audit_logs';

export class ApiService {
  private static getBaseUrl(): string {
    return import.meta.env.VITE_API_BASE_URL || '';
  }

  private static async getHeaders(): Promise<Record<string, string>> {
    const session = await AuthService.fetchSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session.idToken) {
      headers['Authorization'] = `Bearer ${session.idToken}`;
    }
    return headers;
  }

  /**
   * Universal fetch wrapper with automatic fallback for offline development
   */
  private static async request<T>(
    endpoint: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const baseUrl = this.getBaseUrl();
    if (baseUrl) {
      const headers = await this.getHeaders();
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `API error: ${res.statusText}`);
      }
      return data as T;
    }

    // High-fidelity offline storage simulation when backend dev server is not running
    return this.mockRequestHandler<T>(endpoint, options);
  }

  /**
   * Mock request handler for frontend tests and local browser demonstration
   */
  private static async mockRequestHandler<T>(
    endpoint: string,
    options: { method?: string; body?: unknown }
  ): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const session = await AuthService.fetchSession();
    const currentUser = session.user || {
      userId: 'usr-default',
      email: 'user@example.com',
      emailVerified: true,
    };

    // Initialize mock database in localStorage if empty
    if (!localStorage.getItem(STORAGE_ORGS_KEY)) {
      const initialOrg: ApiOrganization = {
        orgId: 'org-demo-1',
        name: 'Acme Cloud Workspace',
        tier: 'FREE',
        quotaTier: 'FREE',
        role: 'ADMIN',
        userRole: 'ADMIN',
        projectCount: 2,
        maxProjects: 10,
        memberCount: 2,
        maxMembers: 5,
        adminCount: 1,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_ORGS_KEY, JSON.stringify([initialOrg]));

      const initialProjects: ApiProject[] = [
        {
          projectId: 'proj-1',
          name: 'Cloud Migration',
          description: 'Migrating legacy monolith to AWS serverless',
          createdBy: currentUser.userId,
          creatorEmail: currentUser.email,
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        },
        {
          projectId: 'proj-2',
          name: 'Security Audit',
          description: 'Cognito JWT authorizer and RBAC validation',
          createdBy: currentUser.userId,
          creatorEmail: currentUser.email,
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify({ 'org-demo-1': initialProjects }));

      const initialMembers: ApiMember[] = [
        {
          userId: currentUser.userId,
          email: currentUser.email,
          role: 'ADMIN',
          joinedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        },
        {
          userId: 'usr-dev-bob',
          email: 'bob@acme.com',
          role: 'MEMBER',
          joinedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify({ 'org-demo-1': initialMembers }));
    }

    const orgs: ApiOrganization[] = JSON.parse(localStorage.getItem(STORAGE_ORGS_KEY) || '[]');
    const projectsMap: Record<string, ApiProject[]> = JSON.parse(
      localStorage.getItem(STORAGE_PROJECTS_KEY) || '{}'
    );
    const membersMap: Record<string, ApiMember[]> = JSON.parse(
      localStorage.getItem(STORAGE_MEMBERS_KEY) || '{}'
    );
    const auditMap: Record<string, ApiAuditLog[]> = JSON.parse(
      localStorage.getItem(STORAGE_AUDIT_KEY) || '{}'
    );

    const recordMockAudit = (orgId: string, action: string, targetId?: string, details?: Record<string, unknown>) => {
      const logs = auditMap[orgId] || [];
      const newEntry: ApiAuditLog = {
        auditId: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        action,
        actorEmail: currentUser.email,
        targetId: targetId || orgId,
        details,
        timestamp: new Date().toISOString(),
      };
      logs.unshift(newEntry);
      auditMap[orgId] = logs;
      localStorage.setItem(STORAGE_AUDIT_KEY, JSON.stringify(auditMap));
    };

    // POST /api/v1/organizations
    if (endpoint === '/api/v1/organizations' && method === 'POST') {
      const payload = options.body as { name: string; tier?: 'FREE' | 'STANDARD' | 'PREMIUM' };
      const tier = payload.tier || 'FREE';
      const tierLimits = {
        FREE: { maxProjects: 10, maxMembers: 5 },
        STANDARD: { maxProjects: 50, maxMembers: 25 },
        PREMIUM: { maxProjects: 200, maxMembers: 100 },
      }[tier];

      const newOrg: ApiOrganization = {
        orgId: `org-${Date.now()}`,
        name: payload.name,
        tier,
        quotaTier: tier,
        role: 'ADMIN',
        userRole: 'ADMIN',
        projectCount: 0,
        maxProjects: tierLimits.maxProjects,
        memberCount: 1,
        maxMembers: tierLimits.maxMembers,
        adminCount: 1,
        createdAt: new Date().toISOString(),
      };
      orgs.push(newOrg);
      localStorage.setItem(STORAGE_ORGS_KEY, JSON.stringify(orgs));

      membersMap[newOrg.orgId] = [
        {
          userId: currentUser.userId,
          email: currentUser.email,
          role: 'ADMIN',
          joinedAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersMap));
      projectsMap[newOrg.orgId] = [];
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projectsMap));

      recordMockAudit(newOrg.orgId, 'ORGANIZATION_CREATED', newOrg.orgId);

      return newOrg as unknown as T;
    }

    // GET /api/v1/organizations
    if (endpoint === '/api/v1/organizations' && method === 'GET') {
      return { organizations: orgs } as unknown as T;
    }

    // GET /api/v1/organizations/:orgId
    const getOrgMatch = endpoint.match(/^\/api\/v1\/organizations\/([^/]+)$/);
    if (getOrgMatch && method === 'GET') {
      const orgId = getOrgMatch[1];
      const found = orgs.find((o) => o.orgId === orgId);
      if (!found) throw new Error('Organization not found.');
      return found as unknown as T;
    }

    // DELETE /api/v1/organizations/:orgId
    if (getOrgMatch && method === 'DELETE') {
      const orgId = getOrgMatch[1];
      const remainingOrgs = orgs.filter((o) => o.orgId !== orgId);
      localStorage.setItem(STORAGE_ORGS_KEY, JSON.stringify(remainingOrgs));
      delete projectsMap[orgId];
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projectsMap));
      delete membersMap[orgId];
      localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersMap));
      return { message: 'Organization deleted successfully.' } as unknown as T;
    }

    // POST /api/v1/organizations/:orgId/invites
    const inviteMatch = endpoint.match(/^\/api\/v1\/organizations\/([^/]+)\/invites$/);
    if (inviteMatch && method === 'POST') {
      const orgId = inviteMatch[1];
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const inviteData: ApiInvite = {
        inviteCode: code,
        role: 'MEMBER',
        expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
        maxUses: 1,
        usedCount: 0,
      };
      const invites = JSON.parse(localStorage.getItem(STORAGE_INVITES_KEY) || '{}');
      invites[code] = { ...inviteData, orgId };
      localStorage.setItem(STORAGE_INVITES_KEY, JSON.stringify(invites));
      return inviteData as unknown as T;
    }

    // POST /api/v1/organizations/join
    if (endpoint === '/api/v1/organizations/join' && method === 'POST') {
      const payload = options.body as { inviteCode: string };
      const invites = JSON.parse(localStorage.getItem(STORAGE_INVITES_KEY) || '{}');
      const inv = invites[payload.inviteCode?.toUpperCase()];
      if (!inv) throw new Error('Invalid invite code.');
      const org = orgs.find((o) => o.orgId === inv.orgId);
      if (!org) throw new Error('Organization not found.');
      if (org.memberCount >= org.maxMembers) throw new Error('Member quota reached.');

      org.memberCount += 1;
      localStorage.setItem(STORAGE_ORGS_KEY, JSON.stringify(orgs));

      const orgMembers = membersMap[org.orgId] || [];
      orgMembers.push({
        userId: currentUser.userId,
        email: currentUser.email,
        role: inv.role,
        joinedAt: new Date().toISOString(),
      });
      membersMap[org.orgId] = orgMembers;
      localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersMap));

      return { orgId: org.orgId, role: inv.role } as unknown as T;
    }

    // GET /api/v1/organizations/:orgId/members
    const membersMatch = endpoint.match(/^\/api\/v1\/organizations\/([^/]+)\/members$/);
    if (membersMatch && method === 'GET') {
      const orgId = membersMatch[1];
      const list = membersMap[orgId] || [];
      return { members: list, totalCount: list.length } as unknown as T;
    }

    // PATCH /api/v1/organizations/:orgId/members/:userId
    const patchMemberMatch = endpoint.match(/^\/api\/v1\/organizations\/([^/]+)\/members\/([^/]+)$/);
    if (patchMemberMatch && method === 'PATCH') {
      const orgId = patchMemberMatch[1];
      const targetUserId = patchMemberMatch[2];
      const payload = options.body as { role: 'ADMIN' | 'MEMBER' };
      const list = membersMap[orgId] || [];
      const member = list.find((m) => m.userId === targetUserId);
      if (!member) throw new Error('Member not found.');
      const adminCount = list.filter((m) => m.role === 'ADMIN').length;
      if (member.role === 'ADMIN' && payload.role === 'MEMBER' && adminCount <= 1) {
        throw new Error('Cannot demote the last administrator of the organization.');
      }
      member.role = payload.role;
      localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersMap));
      recordMockAudit(orgId, 'MEMBER_ROLE_UPDATED', targetUserId, { newRole: payload.role });
      return { message: 'Member role updated.' } as unknown as T;
    }

    // DELETE /api/v1/organizations/:orgId/members/:userId
    if (patchMemberMatch && method === 'DELETE') {
      const orgId = patchMemberMatch[1];
      const targetUserId = patchMemberMatch[2];
      const list = membersMap[orgId] || [];
      const member = list.find((m) => m.userId === targetUserId);
      if (!member) throw new Error('Member not found.');
      const adminCount = list.filter((m) => m.role === 'ADMIN').length;
      if (member.role === 'ADMIN' && adminCount <= 1) {
        throw new Error('Cannot remove the last administrator of the organization.');
      }
      if (list.length <= 1) {
        throw new Error('Cannot remove the sole remaining member of the organization.');
      }
      membersMap[orgId] = list.filter((m) => m.userId !== targetUserId);
      localStorage.setItem(STORAGE_MEMBERS_KEY, JSON.stringify(membersMap));
      const org = orgs.find((o) => o.orgId === orgId);
      if (org) {
        org.memberCount = Math.max(1, org.memberCount - 1);
        localStorage.setItem(STORAGE_ORGS_KEY, JSON.stringify(orgs));
      }
      recordMockAudit(orgId, 'MEMBER_REMOVED', targetUserId);
      return { message: 'Member removed.' } as unknown as T;
    }

    // GET /api/v1/organizations/:orgId/projects
    const projectsMatch = endpoint.match(/^\/api\/v1\/organizations\/([^/]+)\/projects$/);
    if (projectsMatch && method === 'GET') {
      const orgId = projectsMatch[1];
      const list = projectsMap[orgId] || [];
      return { projects: list, totalCount: list.length } as unknown as T;
    }

    // POST /api/v1/organizations/:orgId/projects
    if (projectsMatch && method === 'POST') {
      const orgId = projectsMatch[1];
      const org = orgs.find((o) => o.orgId === orgId);
      if (!org) throw new Error('Organization not found.');
      if (org.projectCount >= org.maxProjects) {
        throw new Error(
          `Project quota reached (${org.projectCount}/${org.maxProjects}). Please upgrade your tier.`
        );
      }
      const payload = options.body as { name: string; description?: string };
      const newProj: ApiProject = {
        projectId: `proj-${Date.now()}`,
        name: payload.name,
        description: payload.description || '',
        createdBy: currentUser.userId,
        creatorEmail: currentUser.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const list = projectsMap[orgId] || [];
      list.push(newProj);
      projectsMap[orgId] = list;
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projectsMap));

      org.projectCount += 1;
      localStorage.setItem(STORAGE_ORGS_KEY, JSON.stringify(orgs));

      recordMockAudit(orgId, 'PROJECT_CREATED', newProj.projectId);

      return newProj as unknown as T;
    }

    // DELETE /api/v1/organizations/:orgId/projects/:projectId
    const delProjMatch = endpoint.match(/^\/api\/v1\/organizations\/([^/]+)\/projects\/([^/]+)$/);
    if (delProjMatch && method === 'DELETE') {
      const orgId = delProjMatch[1];
      const projectId = delProjMatch[2];
      const list = projectsMap[orgId] || [];
      projectsMap[orgId] = list.filter((p) => p.projectId !== projectId);
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projectsMap));

      const org = orgs.find((o) => o.orgId === orgId);
      if (org) {
        org.projectCount = Math.max(0, org.projectCount - 1);
        localStorage.setItem(STORAGE_ORGS_KEY, JSON.stringify(orgs));
      }
      recordMockAudit(orgId, 'PROJECT_DELETED', projectId);
      return { message: 'Project deleted successfully.' } as unknown as T;
    }

    // GET /api/v1/organizations/:orgId/analytics
    const analyticsMatch = endpoint.match(/^\/api\/v1\/organizations\/([^/]+)\/analytics$/);
    if (analyticsMatch && method === 'GET') {
      const orgId = analyticsMatch[1];
      const org = orgs.find((o) => o.orgId === orgId);
      if (!org) throw new Error('Organization not found.');
      const projectUtil = Math.min(100, Math.round(((org.projectCount || 0) / org.maxProjects) * 100));
      const memberUtil = Math.min(100, Math.round(((org.memberCount || 0) / org.maxMembers) * 100));

      const recordedLogs = auditMap[orgId] || [];
      const defaultLogs: ApiAuditLog[] = [
        {
          auditId: 'audit-mock-1',
          action: 'ORGANIZATION_CREATED',
          actorEmail: currentUser.email,
          targetId: org.orgId,
          timestamp: org.createdAt || new Date().toISOString(),
        },
        {
          auditId: 'audit-mock-2',
          action: 'PROJECT_CREATED',
          actorEmail: currentUser.email,
          targetId: 'proj-1',
          timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
        },
        {
          auditId: 'audit-mock-3',
          action: 'MEMBER_JOINED',
          actorEmail: 'bob@acme.com',
          targetId: 'usr-dev-bob',
          timestamp: new Date(Date.now() - 86400000 * 4).toISOString(),
        },
      ];

      // Merge recorded logs and seed logs, eliminating duplicates
      const allLogs = [...recordedLogs, ...(orgId === 'org-demo-1' ? defaultLogs : [])];
      const seen = new Set<string>();
      const uniqueLogs = allLogs.filter((l) => {
        if (seen.has(l.auditId)) return false;
        seen.add(l.auditId);
        return true;
      });

      return {
        quotas: {
          tier: org.tier || org.quotaTier || 'FREE',
          projectCount: org.projectCount,
          maxProjects: org.maxProjects,
          projectUtilizationPercent: projectUtil,
          memberCount: org.memberCount,
          maxMembers: org.maxMembers,
          memberUtilizationPercent: memberUtil,
          adminCount: org.adminCount || 1,
        },
        auditLogs: uniqueLogs,
      } as unknown as T;
    }

    throw new Error(`Unhandled mock route: ${method} ${endpoint}`);
  }

  // Typed Public Methods
  public static async getOrganizations(): Promise<{ organizations: ApiOrganization[] }> {
    return this.request<{ organizations: ApiOrganization[] }>('/api/v1/organizations');
  }

  public static async createOrganization(data: {
    name: string;
    tier: 'FREE' | 'STANDARD' | 'PREMIUM';
  }): Promise<ApiOrganization> {
    return this.request<ApiOrganization>('/api/v1/organizations', {
      method: 'POST',
      body: data,
    });
  }

  public static async getOrganization(orgId: string): Promise<ApiOrganization> {
    return this.request<ApiOrganization>(`/api/v1/organizations/${orgId}`);
  }

  public static async deleteOrganization(orgId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/v1/organizations/${orgId}`, {
      method: 'DELETE',
    });
  }

  public static async getProjects(orgId: string): Promise<{ projects: ApiProject[]; totalCount: number }> {
    return this.request<{ projects: ApiProject[]; totalCount: number }>(
      `/api/v1/organizations/${orgId}/projects`
    );
  }

  public static async createProject(
    orgId: string,
    data: { name: string; description?: string }
  ): Promise<ApiProject> {
    return this.request<ApiProject>(`/api/v1/organizations/${orgId}/projects`, {
      method: 'POST',
      body: data,
    });
  }

  public static async deleteProject(orgId: string, projectId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/v1/organizations/${orgId}/projects/${projectId}`,
      { method: 'DELETE' }
    );
  }

  public static async getMembers(orgId: string): Promise<{ members: ApiMember[]; totalCount: number }> {
    return this.request<{ members: ApiMember[]; totalCount: number }>(
      `/api/v1/organizations/${orgId}/members`
    );
  }

  public static async updateMemberRole(
    orgId: string,
    userId: string,
    role: 'ADMIN' | 'MEMBER'
  ): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/v1/organizations/${orgId}/members/${userId}`,
      {
        method: 'PATCH',
        body: { role },
      }
    );
  }

  public static async removeMember(orgId: string, userId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/v1/organizations/${orgId}/members/${userId}`,
      { method: 'DELETE' }
    );
  }

  public static async createInvite(
    orgId: string,
    data: { role?: 'ADMIN' | 'MEMBER'; maxUses?: number } = {}
  ): Promise<ApiInvite> {
    return this.request<ApiInvite>(`/api/v1/organizations/${orgId}/invites`, {
      method: 'POST',
      body: data,
    });
  }

  public static async joinOrganization(inviteCode: string): Promise<{ orgId: string; role: string }> {
    return this.request<{ orgId: string; role: string }>('/api/v1/organizations/join', {
      method: 'POST',
      body: { inviteCode },
    });
  }

  public static async getAnalytics(orgId: string): Promise<{
    quotas: {
      tier: 'FREE' | 'STANDARD' | 'PREMIUM';
      projectCount: number;
      maxProjects: number;
      projectUtilizationPercent: number;
      memberCount: number;
      maxMembers: number;
      memberUtilizationPercent: number;
      adminCount: number;
    };
    auditLogs: Array<{
      auditId: string;
      action: string;
      actorEmail: string;
      targetId?: string;
      targetType?: string;
      details?: Record<string, unknown>;
      timestamp: string;
    }>;
  }> {
    return this.request(`/api/v1/organizations/${orgId}/analytics`);
  }
}

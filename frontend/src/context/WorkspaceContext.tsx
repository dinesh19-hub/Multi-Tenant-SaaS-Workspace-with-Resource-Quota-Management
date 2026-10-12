import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { ApiService, ApiOrganization, ApiProject, ApiMember, ApiInvite } from '../services/apiService';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

interface WorkspaceContextType {
  currentOrg: ApiOrganization | null;
  organizations: ApiOrganization[];
  projects: ApiProject[];
  members: ApiMember[];
  isLoading: boolean;
  setCurrentOrg: (org: ApiOrganization | null) => void;
  refreshWorkspace: () => Promise<void>;
  createOrganization: (name: string, tier: 'FREE' | 'STANDARD' | 'PREMIUM') => Promise<ApiOrganization>;
  deleteCurrentOrganization: () => Promise<void>;
  createProject: (name: string, description?: string) => Promise<ApiProject>;
  deleteProject: (projectId: string) => Promise<void>;
  createInvite: (role?: 'ADMIN' | 'MEMBER', maxUses?: number) => Promise<ApiInvite>;
  joinWorkspace: (code: string) => Promise<void>;
  updateMemberRole: (userId: string, role: 'ADMIN' | 'MEMBER') => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { showSuccess, showError } = useToast();

  const [organizations, setOrganizations] = useState<ApiOrganization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<ApiOrganization | null>(null);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load organizations
  const loadOrganizations = useCallback(async () => {
    if (!isAuthenticated) {
      setOrganizations([]);
      setCurrentOrg(null);
      setProjects([]);
      setMembers([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await ApiService.getOrganizations();
      setOrganizations(res.organizations);
      if (res.organizations.length > 0) {
        // Retain current selection if valid, or default to first
        setCurrentOrg((prev) => {
          if (prev && res.organizations.some((o) => o.orgId === prev.orgId)) {
            return res.organizations.find((o) => o.orgId === prev.orgId) || res.organizations[0];
          }
          return res.organizations[0];
        });
      } else {
        setCurrentOrg(null);
      }
    } catch (err) {
      console.warn('Failed to load organizations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Load details for current organization
  const loadCurrentOrgData = useCallback(async () => {
    if (!currentOrg) {
      setProjects([]);
      setMembers([]);
      return;
    }

    try {
      const [projRes, memberRes] = await Promise.all([
        ApiService.getProjects(currentOrg.orgId),
        ApiService.getMembers(currentOrg.orgId),
      ]);
      setProjects(projRes.projects);
      setMembers(memberRes.members);
    } catch (err) {
      console.warn('Failed to load workspace data:', err);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    loadCurrentOrgData();
  }, [loadCurrentOrgData]);

  const refreshWorkspace = async () => {
    await loadOrganizations();
    await loadCurrentOrgData();
  };

  const createOrganization = async (
    name: string,
    tier: 'FREE' | 'STANDARD' | 'PREMIUM'
  ): Promise<ApiOrganization> => {
    try {
      const newOrg = await ApiService.createOrganization({ name, tier });
      showSuccess(`Workspace "${newOrg.name}" created!`);
      await loadOrganizations();
      setCurrentOrg(newOrg);
      return newOrg;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create organization.';
      showError(msg);
      throw err;
    }
  };

  const deleteCurrentOrganization = async () => {
    if (!currentOrg) return;
    try {
      await ApiService.deleteOrganization(currentOrg.orgId);
      showSuccess(`Workspace "${currentOrg.name}" deleted.`);
      await loadOrganizations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete organization.';
      showError(msg);
      throw err;
    }
  };

  const createProject = async (name: string, description?: string): Promise<ApiProject> => {
    if (!currentOrg) throw new Error('No active workspace selected.');
    try {
      const newProj = await ApiService.createProject(currentOrg.orgId, { name, description });
      showSuccess(`Project "${newProj.name}" created!`);
      await refreshWorkspace();
      return newProj;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create project.';
      showError(msg);
      throw err;
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!currentOrg) return;
    try {
      await ApiService.deleteProject(currentOrg.orgId, projectId);
      showSuccess('Project deleted.');
      await refreshWorkspace();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete project.';
      showError(msg);
      throw err;
    }
  };

  const createInvite = async (role?: 'ADMIN' | 'MEMBER', maxUses?: number) => {
    if (!currentOrg) throw new Error('No active workspace selected.');
    try {
      const inv = await ApiService.createInvite(currentOrg.orgId, { role, maxUses });
      showSuccess(`Invite code generated: ${inv.inviteCode}`);
      return inv;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create invite.';
      showError(msg);
      throw err;
    }
  };

  const joinWorkspace = async (code: string) => {
    try {
      const res = await ApiService.joinOrganization(code);
      showSuccess('Joined organization successfully!');
      await loadOrganizations();
      const joined = organizations.find((o) => o.orgId === res.orgId);
      if (joined) setCurrentOrg(joined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to join organization.';
      showError(msg);
      throw err;
    }
  };

  const updateMemberRole = async (userId: string, role: 'ADMIN' | 'MEMBER') => {
    if (!currentOrg) return;
    try {
      await ApiService.updateMemberRole(currentOrg.orgId, userId, role);
      showSuccess(`Role updated to ${role}.`);
      await refreshWorkspace();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update member role.';
      showError(msg);
      throw err;
    }
  };

  const removeMember = async (userId: string) => {
    if (!currentOrg) return;
    try {
      await ApiService.removeMember(currentOrg.orgId, userId);
      showSuccess('Member removed.');
      await refreshWorkspace();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member.';
      showError(msg);
      throw err;
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        currentOrg,
        organizations,
        projects,
        members,
        isLoading,
        setCurrentOrg,
        refreshWorkspace,
        createOrganization,
        deleteCurrentOrganization,
        createProject,
        deleteProject,
        createInvite,
        joinWorkspace,
        updateMemberRole,
        removeMember,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

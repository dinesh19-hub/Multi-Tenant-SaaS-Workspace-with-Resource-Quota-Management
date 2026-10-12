import React, { useState } from 'react';
import {
  IconBuilding,
  IconShieldExclamation,
  IconPlus,
} from '@tabler/icons-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';

export const SettingsPage: React.FC = () => {
  const {
    currentOrg,
    createOrganization,
    deleteCurrentOrganization,
  } = useWorkspace();

  // Create Org Form state
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgTier, setNewOrgTier] = useState<'FREE' | 'STANDARD' | 'PREMIUM'>('FREE');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = currentOrg?.role === 'ADMIN' || currentOrg?.userRole === 'ADMIN';

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setIsCreatingOrg(true);
    try {
      await createOrganization(newOrgName.trim(), newOrgTier);
      setNewOrgName('');
      setNewOrgTier('FREE');
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteCurrentOrganization();
      setShowDeleteModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="settings-page" style={{ maxWidth: '900px' }}>
      <PageHeader
        pretitle="Preferences"
        title="Settings & Workspaces"
        subtitle={
          <span>
            Create new tenant organizations and manage settings for <strong>{currentOrg?.name || 'Workspace'}</strong>.
          </span>
        }
      />

      {/* Create New Organization Card */}
      <div className="card saas-card p-4 mb-4">
        <div className="card-header bg-transparent border-0 p-0 mb-3 d-flex align-items-center gap-2">
          <span className="p-2 bg-primary-subtle text-primary rounded-2 d-inline-flex">
            <IconBuilding size={20} stroke={1.8} />
          </span>
          <div>
            <h5 className="card-title fw-bold mb-0 text-dark">Create New Organization</h5>
            <div className="text-secondary small">Provision an independent multi-tenant workspace with isolated resource quotas</div>
          </div>
        </div>

        <form onSubmit={handleCreateOrg}>
          <div className="mb-3">
            <label className="form-label small fw-semibold text-dark">Organization Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Acme Innovations"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              required
            />
          </div>

          <div className="mb-4">
            <label className="form-label small fw-semibold text-dark">Select Tier</label>
            <div className="row g-3">
              <div className="col-12 col-md-4">
                <div
                  className={`p-3 border rounded-3 text-center cursor-pointer h-100 d-flex flex-column justify-content-between transition-all ${
                    newOrgTier === 'FREE' ? 'border-primary bg-primary-subtle shadow-sm' : 'bg-white'
                  }`}
                  onClick={() => setNewOrgTier('FREE')}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <h6 className="fw-bold mb-1 text-dark">Free Tier</h6>
                    <div className="small text-secondary mb-3">10 Projects • 5 Members</div>
                  </div>
                  <div>
                    <span className={`badge ${newOrgTier === 'FREE' ? 'bg-primary text-white' : 'bg-light text-secondary'} px-3 py-1`}>
                      {newOrgTier === 'FREE' ? 'Selected' : 'Select'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-4">
                <div
                  className={`p-3 border rounded-3 text-center cursor-pointer h-100 d-flex flex-column justify-content-between transition-all ${
                    newOrgTier === 'STANDARD' ? 'border-primary bg-primary-subtle shadow-sm' : 'bg-white'
                  }`}
                  onClick={() => setNewOrgTier('STANDARD')}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <h6 className="fw-bold mb-1 text-dark">Standard Tier</h6>
                    <div className="small text-secondary mb-3">50 Projects • 25 Members</div>
                  </div>
                  <div>
                    <span className={`badge ${newOrgTier === 'STANDARD' ? 'bg-primary text-white' : 'bg-light text-secondary'} px-3 py-1`}>
                      {newOrgTier === 'STANDARD' ? 'Selected' : 'Select'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="col-12 col-md-4">
                <div
                  className={`p-3 border rounded-3 text-center cursor-pointer h-100 d-flex flex-column justify-content-between transition-all ${
                    newOrgTier === 'PREMIUM' ? 'border-primary bg-primary-subtle shadow-sm' : 'bg-white'
                  }`}
                  onClick={() => setNewOrgTier('PREMIUM')}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    <h6 className="fw-bold mb-1 text-dark">Premium Tier</h6>
                    <div className="small text-secondary mb-3">200 Projects • 100 Members</div>
                  </div>
                  <div>
                    <span className={`badge ${newOrgTier === 'PREMIUM' ? 'bg-primary text-white' : 'bg-light text-secondary'} px-3 py-1`}>
                      {newOrgTier === 'PREMIUM' ? 'Selected' : 'Select'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary d-inline-flex align-items-center gap-2 shadow-sm"
            disabled={isCreatingOrg || !newOrgName.trim()}
          >
            {isCreatingOrg ? (
              <span className="spinner-border spinner-border-sm" />
            ) : (
              <IconPlus size={16} stroke={2} />
            )}
            <span>Create Organization</span>
          </button>
        </form>
      </div>

      {/* Active Organization Information */}
      {currentOrg && (
        <div className="card saas-card p-4 mb-4">
          <div className="card-header bg-transparent border-0 p-0 mb-3">
            <h5 className="card-title fw-bold mb-0 text-dark">Active Workspace Details</h5>
            <div className="text-secondary small">Current tenant context and allocation metadata</div>
          </div>

          <div className="row g-3">
            <div className="col-12 col-sm-6">
              <label className="text-secondary small fw-medium text-uppercase tracking-wider" style={{ fontSize: '0.72rem' }}>
                Workspace Name
              </label>
              <div className="fw-bold text-dark fs-6 mt-1">{currentOrg.name}</div>
            </div>
            <div className="col-12 col-sm-6">
              <label className="text-secondary small fw-medium text-uppercase tracking-wider" style={{ fontSize: '0.72rem' }}>
                Tenant Identifier
              </label>
              <div className="mt-1">
                <code className="font-monospace text-dark bg-light px-2 py-1 rounded border">{currentOrg.orgId}</code>
              </div>
            </div>
            <div className="col-12 col-sm-6">
              <label className="text-secondary small fw-medium text-uppercase tracking-wider" style={{ fontSize: '0.72rem' }}>
                Resource Quota Tier
              </label>
              <div className="mt-1 d-flex align-items-center gap-2">
                <StatusBadge status={currentOrg.tier || currentOrg.quotaTier || 'FREE'} variant="primary" />
                <small className="text-muted">
                  Max {currentOrg.maxProjects} projects, {currentOrg.maxMembers} members
                </small>
              </div>
            </div>
            <div className="col-12 col-sm-6">
              <label className="text-secondary small fw-medium text-uppercase tracking-wider" style={{ fontSize: '0.72rem' }}>
                Your Tenant Role
              </label>
              <div className="mt-1">
                <StatusBadge
                  status={currentOrg.role || currentOrg.userRole || 'MEMBER'}
                  variant={isAdmin ? 'primary' : 'secondary'}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      {currentOrg && isAdmin && (
        <div className="card border-danger border-opacity-50 p-4 rounded-3 bg-danger-subtle shadow-sm">
          <div className="d-flex align-items-center gap-2 mb-2">
            <IconShieldExclamation size={22} stroke={2} className="text-danger" />
            <h5 className="fw-bold text-danger mb-0">Danger Zone</h5>
          </div>
          <p className="text-secondary small mb-3">
            Permanently delete this organization. This executes the 7-step resumable cascading deletion workflow:
            locks the tenant, purges all projects, invitations, audit logs, and members, verifies zero orphaned records,
            and permanently deletes tenant metadata.
          </p>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm align-self-start"
            onClick={() => setShowDeleteModal(true)}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting Organization...' : 'Delete Organization'}
          </button>
        </div>
      )}

      {/* Confirm Deletion Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Organization"
        message={`Are you sure you want to permanently delete "${currentOrg?.name}"? All projects, invitations, and team memberships will be completely removed. This action cannot be undone.`}
        confirmText="Yes, Permanently Delete"
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </div>
  );
};

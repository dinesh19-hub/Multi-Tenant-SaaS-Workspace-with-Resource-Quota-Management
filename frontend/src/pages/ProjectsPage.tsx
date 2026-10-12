import React, { useState } from 'react';
import {
  IconPlus,
  IconFolder,
  IconFolderOff,
  IconSearch,
  IconTrash,
  IconCalendar,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBadge } from '../components/common/StatusBadge';

export const ProjectsPage: React.FC = () => {
  const { currentOrg, projects, createProject, deleteProject } = useWorkspace();

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Deletion modal state
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);

  const maxProjects = currentOrg?.maxProjects || (currentOrg?.tier === 'PREMIUM' ? 200 : currentOrg?.tier === 'STANDARD' ? 50 : 10);
  const isAtQuota = projects.length >= maxProjects;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setModalError(null);
    setIsSubmitting(true);
    try {
      await createProject(projectName.trim(), projectDesc.trim());
      setProjectName('');
      setProjectDesc('');
      setShowCreateModal(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    try {
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const headerActions = (
    <button
      className="btn btn-primary d-inline-flex align-items-center gap-2 shadow-sm"
      disabled={isAtQuota}
      onClick={() => setShowCreateModal(true)}
    >
      <IconPlus size={16} stroke={2} />
      <span>+ Create Project</span>
    </button>
  );

  return (
    <div className="projects-page">
      <PageHeader
        pretitle="Resources"
        title="Projects"
        subtitle={
          <span>
            Manage projects within <strong>{currentOrg?.name}</strong>. Quota slots: {projects.length} / {maxProjects} used.
          </span>
        }
        actions={headerActions}
      />

      {isAtQuota && (
        <div className="alert alert-warning d-flex align-items-center gap-2 mb-4" role="alert">
          <IconAlertTriangle size={20} stroke={2} className="flex-shrink-0" />
          <div className="small">
            <strong>Quota Reached:</strong> This organization has reached its maximum project allowance ({maxProjects} projects). Delete unused projects or upgrade the quota tier in Settings to create more.
          </div>
        </div>
      )}

      {/* Search Bar when projects exist */}
      {projects.length > 0 && (
        <div className="card saas-card p-3 mb-4 bg-white">
          <div className="row g-2 align-items-center">
            <div className="col-12 col-md-6 col-lg-4">
              <div className="input-icon position-relative">
                <input
                  type="text"
                  className="form-control form-control-sm ps-5"
                  placeholder="Filter projects by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="position-absolute top-50 start-0 translate-middle-y ps-3 text-muted d-flex align-items-center">
                  <IconSearch size={16} stroke={1.75} />
                </span>
              </div>
            </div>
            <div className="col-12 col-md-6 col-lg-8 text-md-end text-muted small">
              Showing {filteredProjects.length} of {projects.length} projects
            </div>
          </div>
        </div>
      )}

      {/* Projects Grid / Empty State */}
      {projects.length === 0 ? (
        <div className="card saas-card p-4">
          <EmptyState
            icon={<IconFolderOff size={36} stroke={1.5} />}
            title="No projects yet"
            description="Get started by creating the first project in this workspace. Projects are tracked against your quota allocation."
            action={
              <button
                className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
                onClick={() => setShowCreateModal(true)}
                disabled={isAtQuota}
              >
                <IconPlus size={14} stroke={2} />
                <span>Create Project</span>
              </button>
            }
          />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card saas-card p-4">
          <EmptyState
            icon={<IconSearch size={32} stroke={1.5} />}
            title="No matching projects"
            description={`No projects found matching "${searchQuery}". Try a different search term or clear the filter.`}
            action={
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setSearchQuery('')}
              >
                Clear Filter
              </button>
            }
          />
        </div>
      ) : (
        <div className="row g-3">
          {filteredProjects.map((proj) => (
            <div key={proj.projectId} className="col-12 col-md-6 col-lg-4">
              <div className="card saas-card h-100 d-flex flex-column justify-content-between p-3">
                <div>
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div className="d-flex align-items-center gap-2 text-truncate me-2">
                      <span className="p-2 bg-primary-subtle text-primary rounded-2 d-inline-flex flex-shrink-0">
                        <IconFolder size={18} stroke={1.75} />
                      </span>
                      <h5 className="fw-bold text-dark mb-0 fs-6 text-truncate">{proj.name}</h5>
                    </div>
                    <StatusBadge status="ACTIVE" variant="success" />
                  </div>
                  <p className="text-secondary small mb-3" style={{ minHeight: '38px' }}>
                    {proj.description || 'No description provided.'}
                  </p>
                </div>

                <div className="border-top pt-2 mt-auto d-flex justify-content-between align-items-center text-muted" style={{ fontSize: '0.75rem' }}>
                  <span className="d-flex align-items-center gap-1">
                    <IconCalendar size={13} stroke={1.75} />
                    <span>{new Date(proj.createdAt).toLocaleDateString()}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-link p-0 text-decoration-none text-danger d-inline-flex align-items-center gap-1"
                    onClick={() => setProjectToDelete({ id: proj.projectId, name: proj.name })}
                  >
                    <IconTrash size={14} stroke={1.75} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header border-bottom pb-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="p-2 bg-primary-subtle text-primary rounded-2 d-inline-flex">
                    <IconFolder size={18} stroke={2} />
                  </span>
                  <h5 className="modal-title fw-bold text-dark mb-0">Create New Project</h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                />
              </div>
              <form onSubmit={handleCreate}>
                <div className="modal-body py-3">
                  <div className="bg-light-subtle border rounded-2 p-2 px-3 small text-secondary mb-3">
                    Creating this project consumes 1 quota slot ({projects.length + 1} / {maxProjects}).
                  </div>

                  {modalError && (
                    <div className="alert alert-danger small py-2 mb-3">{modalError}</div>
                  )}

                  <div className="mb-3">
                    <label className="form-label small fw-semibold text-dark">Project Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Core Service API"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label small fw-semibold text-dark">Description (Optional)</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="Brief overview of project scope..."
                      value={projectDesc}
                      onChange={(e) => setProjectDesc(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer border-top pt-3">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowCreateModal(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm d-flex align-items-center gap-2"
                    disabled={isSubmitting || !projectName.trim()}
                  >
                    {isSubmitting && <span className="spinner-border spinner-border-sm" />}
                    <span>Create Project</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(projectToDelete)}
        title="Delete Project"
        message={`Are you sure you want to permanently delete "${projectToDelete?.name}"? This action will reclaim 1 project quota slot.`}
        confirmText="Delete Project"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setProjectToDelete(null)}
      />
    </div>
  );
};

import React, { useState } from 'react';
import {
  IconUserPlus,
  IconKey,
  IconCopy,
  IconCheck,
  IconTrash,
  IconCalendar,
  IconAlertTriangle,
  IconUserCheck,
} from '@tabler/icons-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';

export const MembersPage: React.FC = () => {
  const {
    currentOrg,
    members,
    createInvite,
    joinWorkspace,
    updateMemberRole,
    removeMember,
  } = useWorkspace();

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Join modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Remove confirmation modal state
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; email: string } | null>(null);

  const maxMembers = currentOrg?.maxMembers || (currentOrg?.tier === 'PREMIUM' ? 100 : currentOrg?.tier === 'STANDARD' ? 25 : 5);
  const isAtQuota = members.length >= maxMembers;
  const isAdmin = currentOrg?.role === 'ADMIN' || currentOrg?.userRole === 'ADMIN';

  const handleGenerateInvite = async () => {
    setIsGenerating(true);
    try {
      const inv = await createInvite(inviteRole, 1);
      setGeneratedCode(inv.inviteCode);
      setIsCopied(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setJoinError(null);
    setIsJoining(true);
    try {
      await joinWorkspace(joinCode.trim());
      setShowJoinModal(false);
      setJoinCode('');
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to redeem invite code.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleRoleToggle = async (userId: string, currentRole: 'ADMIN' | 'MEMBER') => {
    const targetRole = currentRole === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    await updateMemberRole(userId, targetRole);
  };

  const confirmRemove = async () => {
    if (!memberToRemove) return;
    try {
      await removeMember(memberToRemove.id);
      setMemberToRemove(null);
    } catch (err) {
      console.error(err);
    }
  };

  const headerActions = (
    <>
      <button
        className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
        onClick={() => setShowJoinModal(true)}
      >
        <IconKey size={16} stroke={1.75} />
        <span>Join via Code</span>
      </button>
      <button
        className="btn btn-primary d-inline-flex align-items-center gap-2 shadow-sm"
        disabled={isAtQuota || !isAdmin}
        onClick={() => {
          setGeneratedCode(null);
          setShowInviteModal(true);
        }}
      >
        <IconUserPlus size={16} stroke={2} />
        <span>+ Generate Invite</span>
      </button>
    </>
  );

  return (
    <div className="members-page">
      <PageHeader
        pretitle="Access Control"
        title="Members & Access"
        subtitle={
          <span>
            Manage collaborators in <strong>{currentOrg?.name}</strong>. Quota: {members.length} / {maxMembers} seats occupied.
          </span>
        }
        actions={headerActions}
      />

      {isAtQuota && (
        <div className="alert alert-warning d-flex align-items-center gap-2 mb-4" role="alert">
          <IconAlertTriangle size={20} stroke={2} className="flex-shrink-0" />
          <div className="small">
            <strong>Member Quota Reached:</strong> This organization has occupied all {maxMembers} member seats under the {currentOrg?.tier || currentOrg?.quotaTier} tier. Upgrade in Settings or remove inactive members to add new collaborators.
          </div>
        </div>
      )}

      {/* Tabler Members Table Card */}
      <div className="card saas-card overflow-hidden">
        <div className="card-header bg-transparent border-bottom d-flex justify-content-between align-items-center px-4 py-3">
          <div>
            <h5 className="card-title fw-bold mb-0 text-dark">Active Collaborators</h5>
            <div className="text-secondary small">Authorized users with workspace access</div>
          </div>
          <span className="badge bg-secondary-subtle text-secondary px-2 py-1 small">
            {members.length} / {maxMembers} Seats
          </span>
        </div>

        <div className="table-responsive mb-0">
          <table className="table table-hover align-middle mb-0 text-nowrap">
            <thead className="table-light">
              <tr className="small text-uppercase text-secondary">
                <th className="ps-4">Member</th>
                <th>Role</th>
                <th>Joined</th>
                <th className="text-end pe-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td className="ps-4">
                    <div className="d-flex align-items-center gap-3 py-1">
                      <div
                        className="avatar avatar-sm rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-bold"
                        style={{ width: 36, height: 36, fontSize: '0.85rem' }}
                      >
                        {member.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="fw-semibold text-dark">{member.email}</div>
                        <div className="text-muted font-monospace" style={{ fontSize: '0.72rem' }}>
                          UID: {member.userId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StatusBadge
                      status={member.role}
                      variant={member.role === 'ADMIN' ? 'primary' : 'secondary'}
                    />
                  </td>
                  <td className="text-secondary small">
                    <span className="d-inline-flex align-items-center gap-1">
                      <IconCalendar size={14} stroke={1.75} className="text-muted" />
                      <span>{new Date(member.joinedAt).toLocaleDateString()}</span>
                    </span>
                  </td>
                  <td className="text-end pe-4">
                    {isAdmin && (
                      <div className="d-flex justify-content-end gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary py-1 px-2 d-inline-flex align-items-center gap-1"
                          onClick={() => handleRoleToggle(member.userId, member.role)}
                          title={member.role === 'ADMIN' ? 'Demote to Member' : 'Promote to Admin'}
                        >
                          <IconUserCheck size={14} stroke={1.75} />
                          <span>{member.role === 'ADMIN' ? 'Demote' : 'Promote'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger py-1 px-2 d-inline-flex align-items-center gap-1"
                          onClick={() => setMemberToRemove({ id: member.userId, email: member.email })}
                        >
                          <IconTrash size={14} stroke={1.75} />
                          <span>Remove</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Invite Modal */}
      {showInviteModal && (
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
                    <IconUserPlus size={18} stroke={2} />
                  </span>
                  <h5 className="modal-title fw-bold text-dark mb-0">Invite New Collaborator</h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowInviteModal(false)}
                />
              </div>
              <div className="modal-body py-3">
                {generatedCode ? (
                  <div className="text-center py-2">
                    <p className="text-secondary small mb-3">
                      Share this single-use invitation code with your team member:
                    </p>
                    <div className="p-3 bg-light rounded-3 border d-flex justify-content-between align-items-center mb-3">
                      <code className="fs-3 fw-bold font-monospace letter-spacing-wide text-primary m-0">
                        {generatedCode}
                      </code>
                      <button
                        className={`btn btn-sm ${isCopied ? 'btn-success' : 'btn-outline-primary'} d-inline-flex align-items-center gap-1 px-3`}
                        onClick={handleCopyCode}
                      >
                        {isCopied ? <IconCheck size={14} stroke={2.5} /> : <IconCopy size={14} stroke={2} />}
                        <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                    <small className="text-muted d-block">
                      Expires in 72 hours. Role granted: <strong>{inviteRole}</strong>
                    </small>
                  </div>
                ) : (
                  <div>
                    <p className="text-secondary small mb-3">
                      Generate a unique code allowing a teammate to join this workspace under active quota governance.
                    </p>
                    <div className="mb-2">
                      <label className="form-label small fw-semibold text-dark">Role to Grant</label>
                      <select
                        className="form-select form-select-sm"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'MEMBER')}
                      >
                        <option value="MEMBER">Member (Standard collaborator access)</option>
                        <option value="ADMIN">Admin (Full administrative & quota management)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer border-top pt-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setShowInviteModal(false)}
                >
                  {generatedCode ? 'Done' : 'Cancel'}
                </button>
                {!generatedCode && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm d-flex align-items-center gap-2"
                    onClick={handleGenerateInvite}
                    disabled={isGenerating}
                  >
                    {isGenerating && <span className="spinner-border spinner-border-sm" />}
                    <span>Generate Code</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Workspace Modal */}
      {showJoinModal && (
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
                    <IconKey size={18} stroke={2} />
                  </span>
                  <h5 className="modal-title fw-bold text-dark mb-0">Join Workspace</h5>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowJoinModal(false)}
                />
              </div>
              <form onSubmit={handleJoin}>
                <div className="modal-body py-3">
                  <p className="text-secondary small mb-3">
                    Enter the 8-character invitation code provided by a workspace administrator.
                  </p>

                  {joinError && (
                    <div className="alert alert-danger small py-2 mb-3">{joinError}</div>
                  )}

                  <div className="mb-2">
                    <label className="form-label small fw-semibold text-dark">Invite Code</label>
                    <input
                      type="text"
                      className="form-control text-center fw-bold font-monospace fs-4 letter-spacing-wide"
                      placeholder="ABCD1234"
                      maxLength={8}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div className="modal-footer border-top pt-3">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setShowJoinModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm d-flex align-items-center gap-2"
                    disabled={isJoining || joinCode.length < 6}
                  >
                    {isJoining && <span className="spinner-border spinner-border-sm" />}
                    <span>Join Workspace</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(memberToRemove)}
        title="Remove Member"
        message={`Are you sure you want to remove "${memberToRemove?.email}" from the organization?`}
        confirmText="Remove Member"
        confirmVariant="danger"
        onConfirm={confirmRemove}
        onCancel={() => setMemberToRemove(null)}
      />
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  IconFolder,
  IconUsers,
  IconSearch,
  IconCheck,
  IconClock,
  IconClipboardList,
  IconShieldLock,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ApiService } from '../services/apiService';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBadge } from '../components/common/StatusBadge';

interface AuditItem {
  auditId: string;
  action: string;
  actorEmail: string;
  targetId?: string;
  timestamp: string;
}

export const AnalyticsPage: React.FC = () => {
  const { currentOrg } = useWorkspace();

  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentOrg) return;

    let isMounted = true;
    setIsLoading(true);
    ApiService.getAnalytics(currentOrg.orgId)
      .then((data) => {
        if (isMounted && data.auditLogs) {
          setAuditLogs(data.auditLogs);
        }
      })
      .catch((err) => console.warn('Failed to load analytics:', err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentOrg]);

  const maxProjects = currentOrg?.maxProjects || (currentOrg?.tier === 'PREMIUM' ? 200 : currentOrg?.tier === 'STANDARD' ? 50 : 10);
  const maxMembers = currentOrg?.maxMembers || (currentOrg?.tier === 'PREMIUM' ? 100 : currentOrg?.tier === 'STANDARD' ? 25 : 5);

  const usedProjects = currentOrg?.projectCount || 0;
  const usedMembers = currentOrg?.memberCount || 0;

  const projectUsagePercent = Math.min(100, Math.round((usedProjects / maxProjects) * 100));
  const memberUsagePercent = Math.min(100, Math.round((usedMembers / maxMembers) * 100));

  const remainingProjects = Math.max(0, maxProjects - usedProjects);
  const remainingMembers = Math.max(0, maxMembers - usedMembers);

  const currentTier = currentOrg?.tier || currentOrg?.quotaTier || 'FREE';

  const filteredLogs = auditLogs.filter(
    (log) =>
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.targetId && log.targetId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="analytics-page">
      <PageHeader
        pretitle="Monitoring"
        title="Resource Quota Analytics"
        subtitle={
          <span>
            Detailed quota consumption and audit trail for <strong>{currentOrg?.name || 'Workspace'}</strong>.
          </span>
        }
      />

      {/* Two Prominent Quota Cards */}
      <div className="row g-3 mb-4">
        {/* Project Quota Consumption */}
        <div className="col-12 col-lg-6">
          <div className="card saas-card h-100 p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="d-flex align-items-center gap-2">
                <span className="p-2 bg-primary-subtle text-primary rounded-2 d-inline-flex">
                  <IconFolder size={20} stroke={1.8} />
                </span>
                <h5 className="fw-bold text-dark mb-0 fs-6">Project Quota Consumption</h5>
              </div>
              <span
                className={`badge fs-6 px-2 py-1 ${
                  projectUsagePercent >= 90
                    ? 'bg-danger-subtle text-danger'
                    : projectUsagePercent >= 75
                    ? 'bg-warning-subtle text-warning'
                    : 'bg-primary-subtle text-primary'
                }`}
              >
                {projectUsagePercent}% Utilized
              </span>
            </div>

            <div className="d-flex align-items-baseline gap-2 mb-2">
              <span className="display-6 fw-bold text-dark">{usedProjects}</span>
              <span className="text-secondary small">/ {maxProjects} max allowed</span>
            </div>

            {/* Tabler Progress Bar */}
            <div className="progress quota-progress mb-3" style={{ height: '10px' }}>
              <div
                className={`progress-bar ${
                  projectUsagePercent >= 90
                    ? 'bg-danger'
                    : projectUsagePercent >= 75
                    ? 'bg-warning'
                    : 'bg-primary'
                }`}
                role="progressbar"
                style={{ width: `${projectUsagePercent}%` }}
                aria-valuenow={projectUsagePercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>

            {projectUsagePercent >= 90 && (
              <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                <IconAlertTriangle size={16} stroke={2} className="flex-shrink-0" />
                <span>Critical: Project capacity near quota threshold ({remainingProjects} slots remaining).</span>
              </div>
            )}

            <div className="row g-2 pt-2 border-top text-secondary small">
              <div className="col-4">
                <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>USED</span>
                <strong className="text-dark">{usedProjects} projects</strong>
              </div>
              <div className="col-4">
                <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>REMAINING</span>
                <strong className="text-dark">{remainingProjects} slots</strong>
              </div>
              <div className="col-4">
                <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>TOTAL CAP</span>
                <strong className="text-dark">{maxProjects} slots</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Member Seat Utilization */}
        <div className="col-12 col-lg-6">
          <div className="card saas-card h-100 p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div className="d-flex align-items-center gap-2">
                <span className="p-2 bg-info-subtle text-info rounded-2 d-inline-flex">
                  <IconUsers size={20} stroke={1.8} />
                </span>
                <h5 className="fw-bold text-dark mb-0 fs-6">Member Seat Utilization</h5>
              </div>
              <span
                className={`badge fs-6 px-2 py-1 ${
                  memberUsagePercent >= 90
                    ? 'bg-danger-subtle text-danger'
                    : memberUsagePercent >= 75
                    ? 'bg-warning-subtle text-warning'
                    : 'bg-info-subtle text-info'
                }`}
              >
                {memberUsagePercent}% Utilized
              </span>
            </div>

            <div className="d-flex align-items-baseline gap-2 mb-2">
              <span className="display-6 fw-bold text-dark">{usedMembers}</span>
              <span className="text-secondary small">/ {maxMembers} max capacity</span>
            </div>

            {/* Tabler Progress Bar */}
            <div className="progress quota-progress mb-3" style={{ height: '10px' }}>
              <div
                className={`progress-bar ${
                  memberUsagePercent >= 90
                    ? 'bg-danger'
                    : memberUsagePercent >= 75
                    ? 'bg-warning'
                    : 'bg-info'
                }`}
                role="progressbar"
                style={{ width: `${memberUsagePercent}%` }}
                aria-valuenow={memberUsagePercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>

            {memberUsagePercent >= 90 && (
              <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                <IconAlertTriangle size={16} stroke={2} className="flex-shrink-0" />
                <span>Critical: Member seats near capacity ({remainingMembers} seats available).</span>
              </div>
            )}

            <div className="row g-2 pt-2 border-top text-secondary small">
              <div className="col-4">
                <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>OCCUPIED</span>
                <strong className="text-dark">{usedMembers} seats</strong>
              </div>
              <div className="col-4">
                <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>AVAILABLE</span>
                <strong className="text-dark">{remainingMembers} seats</strong>
              </div>
              <div className="col-4">
                <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>TOTAL CAP</span>
                <strong className="text-dark">{maxMembers} seats</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Predefined Quota Tiers Reference Table */}
      <div className="card saas-card p-4 mb-4">
        <div className="card-header bg-transparent border-0 p-0 mb-3 d-flex justify-content-between align-items-center">
          <div>
            <h5 className="card-title fw-bold mb-0 text-dark">Predefined Quota Tiers Reference</h5>
            <div className="text-secondary small">Enterprise resource limits governed by atomic DynamoDB transactions</div>
          </div>
          <span className="badge bg-primary-subtle text-primary px-2 py-1 small">
            Active: {currentTier}
          </span>
        </div>

        <div className="table-responsive">
          <table className="table table-bordered align-middle mb-0 text-center small">
            <thead className="table-light">
              <tr className="text-secondary text-uppercase" style={{ fontSize: '0.75rem' }}>
                <th className="text-start ps-3">Tier</th>
                <th>Maximum Projects</th>
                <th>Maximum Members</th>
                <th>Atomic Enforcement</th>
                <th>Current Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className={currentTier === 'FREE' ? 'table-primary fw-bold' : ''}>
                <td className="text-start ps-3">
                  <div className="d-flex align-items-center gap-2">
                    {currentTier === 'FREE' && <IconCheck size={16} stroke={2.5} className="text-primary" />}
                    <span>Free</span>
                  </div>
                </td>
                <td>10</td>
                <td>5</td>
                <td>
                  <span className="d-inline-flex align-items-center gap-1 text-muted">
                    <IconShieldLock size={14} stroke={1.75} />
                    <span>DynamoDB TransactWriteItems</span>
                  </span>
                </td>
                <td>
                  <StatusBadge
                    status={currentTier === 'FREE' ? 'Current Tier' : 'Available'}
                    variant={currentTier === 'FREE' ? 'primary' : 'secondary'}
                  />
                </td>
              </tr>
              <tr className={currentTier === 'STANDARD' ? 'table-primary fw-bold' : ''}>
                <td className="text-start ps-3">
                  <div className="d-flex align-items-center gap-2">
                    {currentTier === 'STANDARD' && <IconCheck size={16} stroke={2.5} className="text-primary" />}
                    <span>Standard</span>
                  </div>
                </td>
                <td>50</td>
                <td>25</td>
                <td>
                  <span className="d-inline-flex align-items-center gap-1 text-muted">
                    <IconShieldLock size={14} stroke={1.75} />
                    <span>DynamoDB TransactWriteItems</span>
                  </span>
                </td>
                <td>
                  <StatusBadge
                    status={currentTier === 'STANDARD' ? 'Current Tier' : 'Available'}
                    variant={currentTier === 'STANDARD' ? 'primary' : 'secondary'}
                  />
                </td>
              </tr>
              <tr className={currentTier === 'PREMIUM' ? 'table-primary fw-bold' : ''}>
                <td className="text-start ps-3">
                  <div className="d-flex align-items-center gap-2">
                    {currentTier === 'PREMIUM' && <IconCheck size={16} stroke={2.5} className="text-primary" />}
                    <span>Premium</span>
                  </div>
                </td>
                <td>200</td>
                <td>100</td>
                <td>
                  <span className="d-inline-flex align-items-center gap-1 text-muted">
                    <IconShieldLock size={14} stroke={1.75} />
                    <span>DynamoDB TransactWriteItems</span>
                  </span>
                </td>
                <td>
                  <StatusBadge
                    status={currentTier === 'PREMIUM' ? 'Current Tier' : 'Available'}
                    variant={currentTier === 'PREMIUM' ? 'primary' : 'secondary'}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Workspace Audit Trail Section */}
      <div className="card saas-card p-4">
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-3">
          <div>
            <h5 className="card-title fw-bold mb-0 text-dark">Workspace Audit Trail</h5>
            <div className="text-secondary small">Immutable log of security and resource mutation events</div>
          </div>
          <div className="input-icon position-relative" style={{ maxWidth: '280px', width: '100%' }}>
            <input
              type="text"
              className="form-control form-control-sm ps-5"
              placeholder="Search audit trail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <span className="position-absolute top-50 start-0 translate-middle-y ps-3 text-muted d-flex align-items-center">
              <IconSearch size={16} stroke={1.75} />
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-5">
            <span className="spinner-border spinner-border-sm text-primary me-2" />
            <span className="text-muted small">Loading live audit events from AWS API Gateway...</span>
          </div>
        ) : auditLogs.length === 0 ? (
          <EmptyState
            icon={<IconClipboardList size={36} stroke={1.5} />}
            title="No audit events recorded"
            description="Workspace operations such as project creation, deletion, and member invitations will automatically record cryptographic audit entries here."
          />
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={<IconSearch size={32} stroke={1.5} />}
            title="No matching audit records"
            description={`No events found matching "${searchQuery}". Clear your search query to see all events.`}
            action={
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </button>
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 small text-nowrap">
              <thead className="table-light">
                <tr className="text-secondary text-uppercase" style={{ fontSize: '0.72rem' }}>
                  <th className="ps-3">Action</th>
                  <th>Actor</th>
                  <th>Target ID</th>
                  <th className="text-end pe-3">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.auditId}>
                    <td className="ps-3">
                      <StatusBadge status={log.action} />
                    </td>
                    <td>
                      <span className="fw-medium text-dark">{log.actorEmail}</span>
                    </td>
                    <td>
                      <code className="text-muted font-monospace">{log.targetId || 'N/A'}</code>
                    </td>
                    <td className="text-end pe-3 text-muted">
                      <span className="d-inline-flex align-items-center gap-1">
                        <IconClock size={13} stroke={1.75} />
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

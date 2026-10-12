import React from 'react';
import { Link } from 'react-router-dom';
import {
  IconPlus,
  IconUserPlus,
  IconFolder,
  IconUsers,
  IconShieldCheck,
  IconKey,
  IconArrowRight,
  IconServer,
  IconDatabase,
  IconCloud,
  IconLock,
  IconCpu,
} from '@tabler/icons-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';

export const DashboardPage: React.FC = () => {
  const { currentOrg, projects, members } = useWorkspace();

  const maxProjects = currentOrg?.maxProjects || (currentOrg?.tier === 'PREMIUM' ? 200 : currentOrg?.tier === 'STANDARD' ? 50 : 10);
  const maxMembers = currentOrg?.maxMembers || (currentOrg?.tier === 'PREMIUM' ? 100 : currentOrg?.tier === 'STANDARD' ? 25 : 5);

  const activeProjectsCount = projects.length || currentOrg?.projectCount || 0;
  const activeMembersCount = members.length || currentOrg?.memberCount || 0;

  const headerActions = (
    <>
      <Link to="/projects" className="btn btn-primary d-inline-flex align-items-center gap-2 shadow-sm">
        <IconPlus size={16} stroke={2} />
        <span>New Project</span>
      </Link>
      <Link to="/members" className="btn btn-outline-secondary d-inline-flex align-items-center gap-2">
        <IconUserPlus size={16} stroke={2} />
        <span>Invite</span>
      </Link>
    </>
  );

  return (
    <div className="dashboard-page">
      <PageHeader
        pretitle="Overview"
        title="Workspace Overview"
        subtitle={
          <span>
            Monitoring active resources and quota allocation for <strong>{currentOrg?.name || 'Workspace'}</strong>.
          </span>
        }
        actions={headerActions}
      />

      {/* Tabler KPI Metric Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Active Projects"
            value={activeProjectsCount}
            badgeText={`Cap: ${maxProjects}`}
            badgeVariant="primary"
            icon={<IconFolder size={22} stroke={1.8} />}
            iconBg="primary"
            progress={{
              value: activeProjectsCount,
              max: maxProjects,
              variant: activeProjectsCount >= maxProjects ? 'danger' : 'primary',
            }}
            subtext={
              <span>
                <strong>{Math.max(0, maxProjects - activeProjectsCount)}</strong> remaining slots
              </span>
            }
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Team Members"
            value={activeMembersCount}
            badgeText={`Cap: ${maxMembers}`}
            badgeVariant="info"
            icon={<IconUsers size={22} stroke={1.8} />}
            iconBg="info"
            progress={{
              value: activeMembersCount,
              max: maxMembers,
              variant: activeMembersCount >= maxMembers ? 'danger' : 'info',
            }}
            subtext={
              <span>
                <strong>{Math.max(0, maxMembers - activeMembersCount)}</strong> seats available
              </span>
            }
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Quota Tier"
            value={currentOrg?.tier || currentOrg?.quotaTier || 'FREE'}
            badgeText="Enforced"
            badgeVariant="success"
            icon={<IconShieldCheck size={22} stroke={1.8} />}
            iconBg="success"
            subtext={<span>Atomic DynamoDB quota checks</span>}
          />
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <StatCard
            title="Role Privileges"
            value={currentOrg?.role || currentOrg?.userRole || 'MEMBER'}
            badgeText="Active"
            badgeVariant="secondary"
            icon={<IconKey size={22} stroke={1.8} />}
            iconBg="warning"
            subtext={<span>Tenant-level IAM permissions</span>}
          />
        </div>
      </div>

      {/* Main Content: Quick Navigation & Cloud Architecture */}
      <div className="row g-3">
        <div className="col-12 col-lg-8">
          <div className="card saas-card p-4 h-100">
            <div className="card-header border-0 p-0 mb-3 bg-transparent">
              <h5 className="card-title fw-bold mb-0 text-dark">Quick Navigation</h5>
              <div className="text-secondary small">Access workspace modules and manage tenant resources</div>
            </div>

            <div className="row g-3">
              <div className="col-sm-6">
                <div className="p-3 border rounded-3 bg-light-subtle h-100 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-2 text-primary">
                      <IconFolder size={20} stroke={2} />
                      <h6 className="fw-bold mb-0 text-dark">Project Workspace</h6>
                    </div>
                    <p className="text-secondary small mb-3">
                      Create and oversee tenant projects governed by atomic quota limits.
                    </p>
                  </div>
                  <Link to="/projects" className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 align-self-start">
                    <span>Open Projects</span>
                    <IconArrowRight size={14} stroke={2} />
                  </Link>
                </div>
              </div>

              <div className="col-sm-6">
                <div className="p-3 border rounded-3 bg-light-subtle h-100 d-flex flex-column justify-content-between">
                  <div>
                    <div className="d-flex align-items-center gap-2 mb-2 text-info">
                      <IconUsers size={20} stroke={2} />
                      <h6 className="fw-bold mb-0 text-dark">Team Collaboration</h6>
                    </div>
                    <p className="text-secondary small mb-3">
                      Issue cryptographically secure invite codes to expand team capacity.
                    </p>
                  </div>
                  <Link to="/members" className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 align-self-start">
                    <span>Manage Members</span>
                    <IconArrowRight size={14} stroke={2} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Recent projects preview if available */}
            {projects.length > 0 && (
              <div className="mt-4 pt-3 border-top">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-semibold text-dark mb-0 small text-uppercase tracking-wider">
                    Recent Workspace Projects ({projects.length})
                  </h6>
                  <Link to="/projects" className="small text-primary text-decoration-none">
                    View all →
                  </Link>
                </div>
                <div className="list-group list-group-flush border rounded-2">
                  {projects.slice(0, 3).map((proj) => (
                    <div
                      key={proj.projectId}
                      className="list-group-item d-flex justify-content-between align-items-center py-2 px-3 bg-transparent"
                    >
                      <div className="d-flex align-items-center gap-2 text-truncate">
                        <IconFolder size={16} stroke={1.75} className="text-secondary flex-shrink-0" />
                        <span className="fw-medium text-dark text-truncate small">{proj.name}</span>
                      </div>
                      <span className="text-muted small" style={{ fontSize: '0.75rem' }}>
                        {new Date(proj.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cloud Infrastructure Card */}
        <div className="col-12 col-lg-4">
          <div className="card saas-card p-4 h-100">
            <div className="card-header border-0 p-0 mb-3 bg-transparent">
              <h5 className="card-title fw-bold mb-0 text-dark">Cloud Environment</h5>
              <div className="text-secondary small">Live AWS enterprise architecture</div>
            </div>

            <ul className="list-unstyled small mb-0 d-flex flex-column gap-3 text-secondary">
              <li className="d-flex justify-content-between align-items-center pb-2 border-bottom">
                <span className="d-flex align-items-center gap-2">
                  <IconLock size={16} stroke={1.75} className="text-primary" />
                  <span>Identity Provider:</span>
                </span>
                <span className="fw-semibold text-dark">Amazon Cognito</span>
              </li>
              <li className="d-flex justify-content-between align-items-center pb-2 border-bottom">
                <span className="d-flex align-items-center gap-2">
                  <IconServer size={16} stroke={1.75} className="text-primary" />
                  <span>API Gateway:</span>
                </span>
                <span className="fw-semibold text-dark">HTTP API ($default)</span>
              </li>
              <li className="d-flex justify-content-between align-items-center pb-2 border-bottom">
                <span className="d-flex align-items-center gap-2">
                  <IconCpu size={16} stroke={1.75} className="text-primary" />
                  <span>Compute:</span>
                </span>
                <span className="fw-semibold text-dark">AWS Lambda (Node 22)</span>
              </li>
              <li className="d-flex justify-content-between align-items-center pb-2 border-bottom">
                <span className="d-flex align-items-center gap-2">
                  <IconDatabase size={16} stroke={1.75} className="text-primary" />
                  <span>Database:</span>
                </span>
                <span className="fw-semibold text-dark">Amazon DynamoDB</span>
              </li>
              <li className="d-flex justify-content-between align-items-center">
                <span className="d-flex align-items-center gap-2">
                  <IconCloud size={16} stroke={1.75} className="text-primary" />
                  <span>Frontend Hosting:</span>
                </span>
                <span className="fw-semibold text-dark">AWS Amplify Hosting</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

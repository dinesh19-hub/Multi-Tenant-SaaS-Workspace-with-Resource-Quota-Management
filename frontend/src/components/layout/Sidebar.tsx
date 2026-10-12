import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  IconLayoutDashboard,
  IconFolder,
  IconUsers,
  IconChartBar,
  IconSettings,
  IconX,
} from '@tabler/icons-react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const { currentOrg } = useWorkspace();

  const maxProjects = currentOrg?.maxProjects || (currentOrg?.tier === 'PREMIUM' ? 200 : currentOrg?.tier === 'STANDARD' ? 50 : 10);
  const maxMembers = currentOrg?.maxMembers || (currentOrg?.tier === 'PREMIUM' ? 100 : currentOrg?.tier === 'STANDARD' ? 25 : 5);

  const memberPercent = Math.min(100, Math.round(((currentOrg?.memberCount || 0) / maxMembers) * 100));
  const projectPercent = Math.min(100, Math.round(((currentOrg?.projectCount || 0) / maxProjects) * 100));

  return (
    <aside
      role="complementary"
      className={`saas-sidebar p-3 d-flex flex-column ${isOpen ? 'd-block' : 'd-none d-md-flex'}`}
    >
      {/* Mobile Drawer Header */}
      <div className="d-flex justify-content-between align-items-center mb-3 d-md-none pb-2 border-bottom">
        <span className="fw-bold text-dark small text-uppercase tracking-wider">Navigation Menu</span>
        <button
          className="btn btn-sm btn-outline-secondary p-1 rounded-2"
          onClick={onClose}
          aria-label="Close menu"
        >
          <IconX size={18} stroke={2} />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="nav flex-column mb-auto gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <span className="nav-link-icon">
            <IconLayoutDashboard size={18} stroke={1.8} />
          </span>
          <span className="nav-link-title">Dashboard</span>
        </NavLink>

        <NavLink
          to="/projects"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <span className="nav-link-icon">
            <IconFolder size={18} stroke={1.8} />
          </span>
          <span className="nav-link-title">Projects</span>
        </NavLink>

        <NavLink
          to="/members"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <span className="nav-link-icon">
            <IconUsers size={18} stroke={1.8} />
          </span>
          <span className="nav-link-title">Members</span>
        </NavLink>

        <NavLink
          to="/analytics"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <span className="nav-link-icon">
            <IconChartBar size={18} stroke={1.8} />
          </span>
          <span className="nav-link-title">Analytics & Quotas</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <span className="nav-link-icon">
            <IconSettings size={18} stroke={1.8} />
          </span>
          <span className="nav-link-title">Settings</span>
        </NavLink>
      </nav>

      {/* Quota Utilization Widget */}
      {currentOrg && (
        <div className="sidebar-quota-widget mt-auto p-3 rounded-2 bg-light border">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="small fw-semibold text-uppercase text-secondary tracking-wider" style={{ fontSize: '0.6875rem' }}>
              Resource Quotas
            </span>
            <span className="badge bg-primary-subtle text-primary" style={{ fontSize: '0.65rem' }}>
              {currentOrg.tier || currentOrg.quotaTier}
            </span>
          </div>

          {/* Projects Quota */}
          <div className="mb-2">
            <div className="d-flex justify-content-between small text-secondary mb-1" style={{ fontSize: '0.75rem' }}>
              <span className="text-dark fw-medium">Projects</span>
              <span className="text-muted">{currentOrg.projectCount} / {maxProjects}</span>
            </div>
            <div className="progress quota-progress" style={{ height: '5px' }}>
              <div
                className={`progress-bar ${projectPercent >= 90 ? 'bg-danger' : projectPercent >= 70 ? 'bg-warning' : 'bg-primary'}`}
                role="progressbar"
                style={{ width: `${projectPercent}%` }}
                aria-valuenow={projectPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>

          {/* Members Quota */}
          <div>
            <div className="d-flex justify-content-between small text-secondary mb-1" style={{ fontSize: '0.75rem' }}>
              <span className="text-dark fw-medium">Members</span>
              <span className="text-muted">{currentOrg.memberCount} / {maxMembers}</span>
            </div>
            <div className="progress quota-progress" style={{ height: '5px' }}>
              <div
                className={`progress-bar ${memberPercent >= 90 ? 'bg-danger' : memberPercent >= 70 ? 'bg-warning' : 'bg-info'}`}
                role="progressbar"
                style={{ width: `${memberPercent}%` }}
                aria-valuenow={memberPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

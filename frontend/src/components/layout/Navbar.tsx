import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  IconCloud,
  IconMenu2,
  IconBuilding,
  IconChevronDown,
  IconCheck,
  IconPlus,
  IconSettings,
  IconLogout,
} from '@tabler/icons-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';

interface NavbarProps {
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const navigate = useNavigate();
  const { currentOrg, organizations, setCurrentOrg } = useWorkspace();
  const { user, logout } = useAuth();

  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(event.target as Node)) {
        setIsOrgDropdownOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOrgDropdownOpen(false);
        setIsUserDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSignOut = async () => {
    setIsUserDropdownOpen(false);
    await logout();
    navigate('/login');
  };

  const handleSelectOrg = (org: typeof organizations[0]) => {
    setCurrentOrg(org);
    setIsOrgDropdownOpen(false);
  };

  const userEmail = user?.email || 'user@example.com';
  const initial = userEmail.charAt(0).toUpperCase();

  return (
    <header className="navbar navbar-expand-md navbar-light bg-white border-bottom sticky-top d-print-none px-3 py-2">
      <div className="container-fluid p-0 d-flex align-items-center justify-content-between">
        {/* Left: Hamburger & Brand & Workspace Selector */}
        <div className="d-flex align-items-center gap-2 gap-sm-3">
          {onToggleSidebar && (
            <button
              className="navbar-toggler d-md-none btn btn-sm btn-outline-secondary p-1 border-0"
              type="button"
              aria-label="Toggle navigation"
              onClick={onToggleSidebar}
            >
              <IconMenu2 size={22} stroke={2} />
            </button>
          )}

          <Link to="/" className="navbar-brand d-flex align-items-center gap-2 m-0 text-decoration-none">
            <span className="navbar-brand-logo bg-primary text-white d-flex align-items-center justify-content-center rounded-2 p-1">
              <IconCloud size={20} stroke={2.2} />
            </span>
            <span className="fw-bold text-dark fs-5 tracking-tight d-none d-sm-inline">
              SaaSWorkspace
            </span>
          </Link>

          {/* Tabler Workspace Selector Dropdown */}
          {currentOrg && (
            <div className={`dropdown ms-1 ms-sm-2 position-relative ${isOrgDropdownOpen ? 'show' : ''}`} ref={orgDropdownRef}>
              <button
                className="btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center gap-2 py-1 px-2 border rounded-2 bg-white"
                type="button"
                id="workspaceDropdown"
                aria-haspopup="true"
                aria-expanded={isOrgDropdownOpen}
                onClick={() => {
                  setIsOrgDropdownOpen((prev) => !prev);
                  setIsUserDropdownOpen(false);
                }}
              >
                <IconBuilding size={16} stroke={1.75} className="text-secondary" />
                <span className="fw-semibold text-dark text-truncate" style={{ maxWidth: '140px' }}>
                  {currentOrg.name}
                </span>
                <span className={`badge ${currentOrg.role === 'ADMIN' ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary'} rounded-1`}>
                  {currentOrg.role}
                </span>
                <IconChevronDown size={14} stroke={2} className="text-muted ms-1" />
              </button>

              <div
                className={`dropdown-menu shadow-sm position-absolute mt-1 ${isOrgDropdownOpen ? 'show d-block' : 'd-none'}`}
                aria-labelledby="workspaceDropdown"
                style={{ minWidth: '240px', zIndex: 1050 }}
              >
                <div className="dropdown-header text-uppercase small text-muted fw-bold">
                  Workspaces ({organizations.length})
                </div>
                {organizations.map((org) => {
                  const isSelected = org.orgId === currentOrg.orgId;
                  return (
                    <button
                      key={org.orgId}
                      type="button"
                      className={`dropdown-item d-flex justify-content-between align-items-center py-2 ${
                        isSelected ? 'active fw-semibold' : ''
                      }`}
                      onClick={() => handleSelectOrg(org)}
                    >
                      <span className="d-flex align-items-center gap-2 text-truncate me-2">
                        {isSelected ? (
                          <IconCheck size={16} stroke={2.5} className="text-primary" />
                        ) : (
                          <span style={{ width: 16 }} />
                        )}
                        <span className="text-truncate">{org.name}</span>
                      </span>
                      <span className={`badge ${org.role === 'ADMIN' ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary'} ms-auto`}>
                        {org.role}
                      </span>
                    </button>
                  );
                })}
                <div className="dropdown-divider my-1" />
                <Link
                  to="/settings"
                  className="dropdown-item small text-primary fw-medium py-2 d-flex align-items-center gap-2"
                  onClick={() => setIsOrgDropdownOpen(false)}
                >
                  <IconPlus size={16} stroke={2} />
                  <span>Create New Organization</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Right: User Account Profile */}
        <div className="d-flex align-items-center gap-2">
          <div className={`dropdown position-relative ${isUserDropdownOpen ? 'show' : ''}`} ref={userDropdownRef}>
            <button
              className="btn btn-sm btn-ghost-secondary border d-flex align-items-center gap-2 rounded-pill px-2 px-sm-3 py-1 bg-white"
              type="button"
              id="userMenuButton"
              aria-haspopup="true"
              aria-expanded={isUserDropdownOpen}
              onClick={() => {
                setIsUserDropdownOpen((prev) => !prev);
                setIsOrgDropdownOpen(false);
              }}
            >
              <span
                className="avatar avatar-xs rounded-circle bg-primary text-white d-inline-flex justify-content-center align-items-center fw-bold"
                style={{ width: 26, height: 26, fontSize: '0.75rem' }}
              >
                {initial}
              </span>
              <span className="d-none d-md-inline small fw-medium text-dark">{userEmail}</span>
              <IconChevronDown size={14} stroke={2} className="text-muted d-none d-md-inline" />
            </button>

            <div
              className={`dropdown-menu dropdown-menu-end shadow-sm position-absolute end-0 mt-1 ${
                isUserDropdownOpen ? 'show d-block' : 'd-none'
              }`}
              aria-labelledby="userMenuButton"
              style={{ minWidth: '220px', zIndex: 1050 }}
            >
              <div className="dropdown-header">
                <div className="text-muted small">Signed in as</div>
                <div className="fw-bold text-dark text-truncate">{userEmail}</div>
              </div>
              <div className="dropdown-divider my-1" />
              <Link
                className="dropdown-item d-flex align-items-center gap-2 py-2"
                to="/settings"
                onClick={() => setIsUserDropdownOpen(false)}
              >
                <IconSettings size={16} stroke={1.75} className="text-secondary" />
                <span>Organization Settings</span>
              </Link>
              <div className="dropdown-divider my-1" />
              <button
                type="button"
                className="dropdown-item text-danger d-flex align-items-center gap-2 py-2 border-0 bg-transparent w-100"
                onClick={handleSignOut}
              >
                <IconLogout size={16} stroke={1.75} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

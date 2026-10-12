import React from 'react';
import { Link } from 'react-router-dom';
import { IconArrowLeft, IconAlertCircle } from '@tabler/icons-react';
import { EmptyState } from '../components/common/EmptyState';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="page page-center min-vh-100 d-flex flex-column align-items-center justify-content-center p-3">
      <div className="container-tight py-4" style={{ maxWidth: '480px', width: '100%' }}>
        <div className="card saas-card p-4 text-center border-0 shadow-sm">
          <div className="display-1 fw-bold text-primary mb-0 font-monospace">404</div>
          <EmptyState
            icon={<IconAlertCircle size={36} stroke={1.5} className="text-secondary" />}
            title="Page Not Found"
            description="The requested route or workspace resource could not be found or may have been relocated."
            action={
              <Link to="/" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2">
                <IconArrowLeft size={16} stroke={2} />
                <span>Return to Dashboard</span>
              </Link>
            }
          />
        </div>
      </div>
    </div>
  );
};

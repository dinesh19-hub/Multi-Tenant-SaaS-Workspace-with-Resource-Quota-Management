import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string | React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`empty-state text-center p-5 ${className}`}>
      {icon && (
        <div className="empty-state-icon mx-auto mb-3 d-inline-flex align-items-center justify-content-center text-secondary bg-light rounded-circle p-3">
          {icon}
        </div>
      )}
      <h3 className="empty-title h5 fw-bold mb-1 text-dark">{title}</h3>
      <p className="empty-subtitle text-secondary small mb-3 mx-auto" style={{ maxWidth: '440px' }}>
        {description}
      </p>
      {action && <div className="empty-action mt-3">{action}</div>}
    </div>
  );
};

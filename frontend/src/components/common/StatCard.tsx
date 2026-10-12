import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string | React.ReactNode;
  badgeText?: string;
  badgeVariant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary';
  icon?: React.ReactNode;
  iconBg?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary';
  progress?: {
    value: number;
    max?: number;
    variant?: 'primary' | 'info' | 'warning' | 'danger';
  };
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  badgeText,
  badgeVariant = 'secondary',
  icon,
  iconBg = 'primary',
  progress,
  className = '',
}) => {
  const percent = progress
    ? Math.min(100, Math.round((progress.value / (progress.max || 100)) * 100))
    : null;

  return (
    <div className={`card saas-card stat-card h-100 ${className}`}>
      <div className="card-body p-3 p-lg-4">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="text-secondary small fw-semibold text-uppercase tracking-wider">
            {title}
          </span>
          {badgeText && (
            <span className={`badge bg-${badgeVariant}-subtle text-${badgeVariant} rounded-pill px-2 py-1 small fw-semibold`}>
              {badgeText}
            </span>
          )}
        </div>

        <div className="d-flex align-items-center justify-content-between my-2">
          <div className="stat-value display-6 fw-bold mb-0 text-dark">
            {value}
          </div>
          {icon && (
            <div className={`stat-icon-wrapper bg-${iconBg}-subtle text-${iconBg} d-flex align-items-center justify-content-center rounded-3`}>
              {icon}
            </div>
          )}
        </div>

        {percent !== null && progress && (
          <div className="mt-3">
            <div className="progress progress-sm quota-progress" style={{ height: '6px' }}>
              <div
                className={`progress-bar bg-${progress.variant || (percent >= 90 ? 'danger' : percent >= 75 ? 'warning' : 'primary')}`}
                role="progressbar"
                style={{ width: `${percent}%` }}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        )}

        {subtext && (
          <div className="text-secondary small mt-2 d-flex align-items-center gap-1">
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
};

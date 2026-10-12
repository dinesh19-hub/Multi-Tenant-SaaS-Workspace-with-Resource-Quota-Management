import React from 'react';

interface PageHeaderProps {
  pretitle?: string;
  title: string;
  subtitle?: string | React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  pretitle,
  title,
  subtitle,
  actions,
  className = '',
}) => {
  return (
    <div className={`page-header d-print-none mb-4 ${className}`}>
      <div className="row g-2 align-items-center">
        <div className="col">
          {pretitle && <div className="page-pretitle text-uppercase">{pretitle}</div>}
          <h1 className="page-title">{title}</h1>
          {subtitle && (
            <div className="text-secondary small mt-1">{subtitle}</div>
          )}
        </div>
        {actions && (
          <div className="col-auto ms-auto d-print-none">
            <div className="btn-list d-flex flex-wrap gap-2">{actions}</div>
          </div>
        )}
      </div>
    </div>
  );
};

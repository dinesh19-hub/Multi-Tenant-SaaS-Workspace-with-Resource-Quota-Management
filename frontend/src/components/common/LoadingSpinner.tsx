import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  size = 'md',
  fullPage = false,
}) => {
  const spinnerClass = size === 'sm' ? 'spinner-border-sm' : size === 'lg' ? 'spinner-border fs-3' : 'spinner-border';

  const content = (
    <div className="d-flex flex-column align-items-center justify-content-center p-4">
      <div className={`${spinnerClass} text-primary mb-2`} role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
      {message && <div className="text-secondary small">{message}</div>}
    </div>
  );

  if (fullPage) {
    return (
      <div
        className="d-flex align-items-center justify-content-center position-fixed top-0 start-0 w-100 h-100 bg-white bg-opacity-75"
        style={{ zIndex: 1050 }}
      >
        {content}
      </div>
    );
  }

  return content;
};

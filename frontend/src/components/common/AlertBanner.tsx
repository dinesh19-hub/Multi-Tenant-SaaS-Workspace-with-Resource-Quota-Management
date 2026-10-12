import React from 'react';
import {
  IconAlertCircle,
  IconCheck,
  IconAlertTriangle,
  IconInfoCircle,
} from '@tabler/icons-react';

interface AlertBannerProps {
  message: string | React.ReactNode;
  type?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  onClose?: () => void;
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  message,
  type = 'danger',
  onClose,
  className = '',
}) => {
  if (!message) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <IconCheck size={18} stroke={2} className="flex-shrink-0" />;
      case 'warning':
        return <IconAlertTriangle size={18} stroke={2} className="flex-shrink-0" />;
      case 'danger':
        return <IconAlertCircle size={18} stroke={2} className="flex-shrink-0" />;
      case 'info':
      case 'primary':
      default:
        return <IconInfoCircle size={18} stroke={2} className="flex-shrink-0" />;
    }
  };

  return (
    <div
      className={`alert alert-${type} ${onClose ? 'alert-dismissible' : ''} d-flex align-items-center gap-2 fade show ${className}`}
      role="alert"
    >
      {getIcon()}
      <div className="flex-grow-1 small">{message}</div>
      {onClose && (
        <button
          type="button"
          className="btn-close"
          aria-label="Close"
          onClick={onClose}
        />
      )}
    </div>
  );
};

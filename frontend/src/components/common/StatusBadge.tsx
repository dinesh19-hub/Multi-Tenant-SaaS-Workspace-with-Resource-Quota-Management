import React from 'react';

interface StatusBadgeProps {
  status: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  outline?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant,
  outline = false,
  className = '',
}) => {
  // Derive variant automatically if not supplied
  const normalized = status.toUpperCase();
  let computedVariant = variant;
  if (!computedVariant) {
    if (normalized === 'ADMIN' || normalized === 'PREMIUM' || normalized === 'ACTIVE') {
      computedVariant = 'primary';
    } else if (normalized === 'STANDARD' || normalized === 'VERIFIED') {
      computedVariant = 'info';
    } else if (normalized === 'FREE' || normalized === 'MEMBER') {
      computedVariant = 'secondary';
    } else if (normalized.includes('SUCCESS') || normalized.includes('CONFIRMED')) {
      computedVariant = 'success';
    } else if (normalized.includes('WARN') || normalized.includes('LIMIT')) {
      computedVariant = 'warning';
    } else if (normalized.includes('ERR') || normalized.includes('FAIL') || normalized.includes('DELET')) {
      computedVariant = 'danger';
    } else {
      computedVariant = 'secondary';
    }
  }

  const badgeClass = outline
    ? `badge border border-${computedVariant} text-${computedVariant} bg-transparent`
    : `badge bg-${computedVariant}-subtle text-${computedVariant}`;

  return (
    <span
      className={`${badgeClass} text-uppercase tracking-wider px-2 py-1 small fw-semibold rounded-2 ${className}`}
      style={{ fontSize: '0.72rem' }}
    >
      {status}
    </span>
  );
};

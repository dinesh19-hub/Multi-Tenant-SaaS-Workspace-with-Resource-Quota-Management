import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { AlertBanner } from '../common/AlertBanner';

interface VerifiedRouteProps {
  children: React.ReactNode;
  onOpenVerifyModal?: () => void;
}

export const VerifiedRoute: React.FC<VerifiedRouteProps> = ({ children, onOpenVerifyModal }) => {
  const { isEmailVerified, user } = useAuth();

  if (user && !isEmailVerified) {
    return (
      <div className="container py-4">
        <AlertBanner
          type="warning"
          message={
            <div className="d-flex justify-content-between align-items-center">
              <span>
                <strong>Email verification required:</strong> Your email address{' '}
                <code>{user.email}</code> has not been verified yet. Some features are restricted until confirmed.
              </span>
              {onOpenVerifyModal && (
                <button className="btn btn-sm btn-warning ms-3 text-nowrap" onClick={onOpenVerifyModal}>
                  Verify Now
                </button>
              )}
            </div>
          }
        />
        {children}
      </div>
    );
  }

  return <>{children}</>;
};

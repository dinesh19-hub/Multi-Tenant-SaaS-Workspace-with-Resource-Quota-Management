import React, { useState } from 'react';
import { IconKey, IconLock, IconMail } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AlertBanner } from '../common/AlertBanner';

interface PasswordResetModalProps {
  isOpen: boolean;
  initialEmail?: string;
  onClose: () => void;
}

export const PasswordResetModal: React.FC<PasswordResetModalProps> = ({
  isOpen,
  initialEmail = '',
  onClose,
}) => {
  const { requestPasswordReset, confirmPasswordReset } = useAuth();
  const { showSuccess, showError } = useToast();

  const [step, setStep] = useState<'REQUEST' | 'CONFIRM'>('REQUEST');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your account email.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await requestPasswordReset(email.trim());
      showSuccess('Password reset code sent! Please check your email inbox.');
      setStep('CONFIRM');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to request reset.';
      setError(msg);
      showError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await confirmPasswordReset(email.trim(), code.trim(), newPassword);
      showSuccess('Password has been successfully reset! You can now sign in.');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password.';
      setError(msg);
      showError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-bottom pb-3">
            <div className="d-flex align-items-center gap-2">
              <span className="p-2 bg-primary-subtle text-primary rounded-2 d-inline-flex">
                <IconKey size={18} stroke={2} />
              </span>
              <h5 className="modal-title fw-bold text-dark mb-0">
                {step === 'REQUEST' ? 'Reset Password' : 'Enter New Password'}
              </h5>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
              disabled={isLoading}
            />
          </div>

          {step === 'REQUEST' ? (
            <form onSubmit={handleRequestCode}>
              <div className="modal-body py-3">
                <p className="text-secondary small mb-3">
                  Enter your email address and we will send you a 6-digit verification code to reset your password.
                </p>

                {error && <AlertBanner type="danger" message={error} className="mb-3" />}

                <div className="mb-2">
                  <label className="form-label small fw-semibold text-dark">Email Address</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light text-muted border-end-0">
                      <IconMail size={16} stroke={1.75} />
                    </span>
                    <input
                      type="email"
                      className="form-control border-start-0"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer border-top pt-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm d-flex align-items-center gap-2"
                  disabled={isLoading || !email.trim()}
                >
                  {isLoading && <span className="spinner-border spinner-border-sm" role="status" />}
                  <span>Send Reset Code</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset}>
              <div className="modal-body py-3">
                <p className="text-secondary small mb-3">
                  Enter the verification code sent to <strong>{email}</strong> and your new password.
                </p>

                {error && <AlertBanner type="danger" message={error} className="mb-3" />}

                <div className="mb-3">
                  <label className="form-label small fw-semibold text-dark">Verification Code</label>
                  <input
                    type="text"
                    className="form-control form-control-lg text-center fw-bold font-monospace fs-3 letter-spacing-wide"
                    placeholder="123456"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-semibold text-dark">New Password</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light text-muted border-end-0">
                      <IconLock size={16} stroke={1.75} />
                    </span>
                    <input
                      type="password"
                      className="form-control border-start-0"
                      placeholder="Min. 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="mb-2">
                  <label className="form-label small fw-semibold text-dark">Confirm New Password</label>
                  <div className="input-group">
                    <span className="input-group-text bg-light text-muted border-end-0">
                      <IconLock size={16} stroke={1.75} />
                    </span>
                    <input
                      type="password"
                      className="form-control border-start-0"
                      placeholder="Re-enter password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer border-top pt-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setStep('REQUEST')}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm d-flex align-items-center gap-2"
                  disabled={isLoading || code.length < 6 || !newPassword}
                >
                  {isLoading && <span className="spinner-border spinner-border-sm" role="status" />}
                  <span>Set New Password</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

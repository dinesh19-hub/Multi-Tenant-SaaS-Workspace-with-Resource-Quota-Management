import React, { useState } from 'react';
import { IconMailCheck } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AlertBanner } from '../common/AlertBanner';

interface VerifyEmailModalProps {
  isOpen: boolean;
  email: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const VerifyEmailModal: React.FC<VerifyEmailModalProps> = ({
  isOpen,
  email,
  onClose,
  onSuccess,
}) => {
  const { confirmEmail, resendCode } = useAuth();
  const { showSuccess, showError } = useToast();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await confirmEmail(email, code.trim());
      showSuccess('Email verified successfully! You can now sign in.');
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed.';
      setError(msg);
      showError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setIsResending(true);
    try {
      await resendCode(email);
      showSuccess('Verification code resent! Please check your email.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code.';
      setError(msg);
      showError(msg);
    } finally {
      setIsResending(false);
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
                <IconMailCheck size={18} stroke={2} />
              </span>
              <h5 className="modal-title fw-bold text-dark mb-0">Verify Your Email Address</h5>
            </div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
              disabled={isSubmitting}
            />
          </div>
          <form onSubmit={handleConfirm}>
            <div className="modal-body py-3">
              <p className="text-secondary small mb-3">
                A 6-digit confirmation code was sent to <strong>{email}</strong>. Enter it below to activate your account.
              </p>

              {error && <AlertBanner type="danger" message={error} className="mb-3" />}

              <div className="mb-3">
                <label className="form-label small fw-semibold text-dark">Confirmation Code</label>
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

              <div className="d-flex justify-content-between align-items-center">
                <span className="small text-muted">Didn't receive the email?</span>
                <button
                  type="button"
                  className="btn btn-sm btn-link text-decoration-none p-0 text-primary"
                  onClick={handleResend}
                  disabled={isResending || isSubmitting}
                >
                  {isResending ? 'Resending...' : 'Resend Code'}
                </button>
              </div>
            </div>

            <div className="modal-footer border-top pt-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm d-flex align-items-center gap-2"
                disabled={isSubmitting || code.length < 6}
              >
                {isSubmitting && <span className="spinner-border spinner-border-sm" role="status" />}
                <span>Verify Email</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

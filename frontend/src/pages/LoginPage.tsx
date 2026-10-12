import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { IconCloud, IconEye, IconEyeOff, IconLock, IconMail } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AlertBanner } from '../components/common/AlertBanner';
import { VerifyEmailModal } from '../components/auth/VerifyEmailModal';
import { PasswordResetModal } from '../components/auth/PasswordResetModal';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { showSuccess } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modals state
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const fromLocation = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email.trim(), password);
      showSuccess('Signed in successfully!');
      navigate(fromLocation, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed.';
      setError(msg);
      // If unconfirmed, offer direct verification modal
      if (msg.toLowerCase().includes('not been confirmed') || msg.toLowerCase().includes('usernotconfirmed')) {
        setShowVerifyModal(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page page-center min-vh-100 d-flex flex-column align-items-center justify-content-center p-3">
      <div className="container-tight py-4" style={{ width: '100%', maxWidth: '420px' }}>
        <div className="text-center mb-4">
          <div className="d-inline-flex align-items-center justify-content-center bg-primary text-white rounded-3 p-3 shadow-sm mb-3">
            <IconCloud size={32} stroke={2.2} />
          </div>
          <h1 className="h3 fw-bold text-dark mb-1">Sign In to SaaS Workspace</h1>
          <p className="text-secondary small mb-0">Enter your credentials to access your tenant workspace</p>
        </div>

        <div className="card saas-card p-4 shadow-sm border-0">
          {error && <AlertBanner type="danger" message={error} className="mb-3" />}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label small fw-semibold text-dark">Email Address</label>
              <div className="input-group">
                <span className="input-group-text bg-light text-muted border-end-0">
                  <IconMail size={16} stroke={1.75} />
                </span>
                <input
                  type="email"
                  className="form-control border-start-0"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small fw-semibold text-dark mb-0">Password</label>
                <button
                  type="button"
                  className="btn btn-link p-0 small text-decoration-none text-primary"
                  onClick={() => setShowResetModal(true)}
                >
                  Forgot password?
                </button>
              </div>
              <div className="input-group">
                <span className="input-group-text bg-light text-muted border-end-0">
                  <IconLock size={16} stroke={1.75} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control border-start-0 border-end-0"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="input-group-text bg-white border-start-0 text-muted"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <IconEyeOff size={16} stroke={1.75} /> : <IconEye size={16} stroke={1.75} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 py-2 d-flex justify-content-center align-items-center gap-2 mb-3 shadow-sm"
              disabled={isLoading}
            >
              {isLoading && <span className="spinner-border spinner-border-sm" role="status" />}
              <span className="fw-semibold">Sign In</span>
            </button>

            <div className="d-flex justify-content-between align-items-center small text-secondary pt-2 border-top">
              <div>
                Don't have an account?{' '}
                <Link to="/register" className="text-primary text-decoration-none fw-semibold">
                  Sign up
                </Link>
              </div>
              {email && (
                <button
                  type="button"
                  className="btn btn-link p-0 small text-muted text-decoration-none"
                  onClick={() => setShowVerifyModal(true)}
                >
                  Verify code
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Email Verification Modal */}
      <VerifyEmailModal
        isOpen={showVerifyModal}
        email={email}
        onClose={() => setShowVerifyModal(false)}
        onSuccess={() => {
          setShowVerifyModal(false);
          setError(null);
        }}
      />

      {/* Password Reset Modal */}
      <PasswordResetModal
        isOpen={showResetModal}
        initialEmail={email}
        onClose={() => setShowResetModal(false)}
      />
    </div>
  );
};

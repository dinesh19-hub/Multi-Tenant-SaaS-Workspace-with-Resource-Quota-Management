import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconCloud, IconMail, IconLock, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AlertBanner } from '../components/common/AlertBanner';
import { VerifyEmailModal } from '../components/auth/VerifyEmailModal';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { showSuccess } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter identical passwords.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(email.trim(), password);
      if (result.isComplete) {
        showSuccess('Account created successfully! You can now sign in.');
        navigate('/login');
      } else {
        // Requires email verification code
        showSuccess('Verification code sent to your email.');
        setShowVerifyModal(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setError(msg);
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
          <h1 className="h3 fw-bold text-dark mb-1">Create an Account</h1>
          <p className="text-secondary small mb-0">Register with email to manage and join multi-tenant workspaces</p>
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
              <label className="form-label small fw-semibold text-dark">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-light text-muted border-end-0">
                  <IconLock size={16} stroke={1.75} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control border-start-0 border-end-0"
                  placeholder="Min. 8 characters"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
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

            <div className="mb-3">
              <label className="form-label small fw-semibold text-dark">Confirm Password</label>
              <div className="input-group">
                <span className="input-group-text bg-light text-muted border-end-0">
                  <IconLock size={16} stroke={1.75} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control border-start-0"
                  placeholder="Re-enter password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 py-2 d-flex justify-content-center align-items-center gap-2 mb-3 shadow-sm"
              disabled={isLoading}
            >
              {isLoading && <span className="spinner-border spinner-border-sm" role="status" />}
              <span className="fw-semibold">Register</span>
            </button>

            <div className="text-center small text-secondary pt-2 border-top">
              Already have an account?{' '}
              <Link to="/login" className="text-primary text-decoration-none fw-semibold">
                Sign In
              </Link>
            </div>
          </form>
        </div>
      </div>

      {/* Email Verification Modal */}
      <VerifyEmailModal
        isOpen={showVerifyModal}
        email={email}
        onClose={() => {
          setShowVerifyModal(false);
          navigate('/login');
        }}
        onSuccess={() => {
          setShowVerifyModal(false);
          showSuccess('Email verified! You can now log in.');
          navigate('/login');
        }}
      />
    </div>
  );
};

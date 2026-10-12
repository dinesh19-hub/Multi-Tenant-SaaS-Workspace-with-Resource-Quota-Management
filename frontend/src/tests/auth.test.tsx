import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthService } from '../services/authService';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

describe('Amazon Cognito Authentication & UI (Phase 4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('AuthService & Error Mapping', () => {
    it('maps Cognito error codes into friendly user messages', () => {
      expect(AuthService.mapError({ name: 'UserNotConfirmedException' })).toContain(
        'not been confirmed yet'
      );
      expect(AuthService.mapError({ name: 'NotAuthorizedException' })).toContain(
        'Incorrect email address or password'
      );
      expect(AuthService.mapError({ name: 'UsernameExistsException' })).toContain(
        'already exists'
      );
      expect(AuthService.mapError({ name: 'CodeMismatchException' })).toContain(
        'Invalid confirmation code'
      );
      expect(AuthService.mapError({ name: 'ExpiredCodeException' })).toContain(
        'code has expired'
      );
    });

    it('performs full mock registration, verification, sign-in, and sign-out cycle', async () => {
      // 1. Register new user
      const reg = await AuthService.register('developer@cloud.com', 'Pass1234!');
      expect(reg.isComplete).toBe(false);
      expect(reg.nextStep).toBe('CONFIRM_SIGN_UP');

      // 2. Sign-in before confirmation fails with UserNotConfirmedException
      await expect(
        AuthService.signIn('developer@cloud.com', 'Pass1234!')
      ).rejects.toThrow(/not been confirmed/);

      // 3. Confirm with wrong code fails
      await expect(
        AuthService.confirmEmail('developer@cloud.com', '999999')
      ).rejects.toThrow(/Invalid confirmation code/);

      // 4. Confirm with valid code succeeds
      const confirmed = await AuthService.confirmEmail('developer@cloud.com', '123456');
      expect(confirmed).toBe(true);

      // 5. Sign-in succeeds
      const user = await AuthService.signIn('developer@cloud.com', 'Pass1234!');
      expect(user.email).toBe('developer@cloud.com');
      expect(user.emailVerified).toBe(true);

      // 6. Session reflects authenticated user
      const session = await AuthService.fetchSession();
      expect(session.isAuthenticated).toBe(true);
      expect(session.user?.email).toBe('developer@cloud.com');
      expect(session.idToken).toBeDefined();

      // 7. Sign out clears session
      await AuthService.signOut();
      const emptySession = await AuthService.fetchSession();
      expect(emptySession.isAuthenticated).toBe(false);
      expect(emptySession.user).toBeNull();
    });

    it('handles password reset workflow', async () => {
      // Register & confirm
      await AuthService.register('reset-user@cloud.com', 'OldPass123!');
      await AuthService.confirmEmail('reset-user@cloud.com', '123456');

      // Request reset
      await expect(
        AuthService.requestPasswordReset('nonexistent@cloud.com')
      ).rejects.toThrow(/No user account found/);

      await AuthService.requestPasswordReset('reset-user@cloud.com');

      // Confirm reset with valid code
      await AuthService.confirmPasswordReset('reset-user@cloud.com', '123456', 'NewPass123!');

      // Login with old password fails
      await expect(
        AuthService.signIn('reset-user@cloud.com', 'OldPass123!')
      ).rejects.toThrow(/Incorrect email address or password/);

      // Login with new password succeeds
      const loggedIn = await AuthService.signIn('reset-user@cloud.com', 'NewPass123!');
      expect(loggedIn.email).toBe('reset-user@cloud.com');
    });
  });

  describe('LoginPage Component', () => {
    it('renders login form inputs and controls', () => {
      render(
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <LoginPage />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      );

      expect(screen.getByPlaceholderText('name@example.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
      expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    });

    it('displays error banner when authentication fails', async () => {
      render(
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <LoginPage />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      );

      fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
        target: { value: 'wrong@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('••••••••'), {
        target: { value: 'WrongPassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

      await waitFor(() => {
        expect(screen.getByText(/Incorrect email address or password/i)).toBeInTheDocument();
      });
    });
  });

  describe('RegisterPage Component', () => {
    it('validates password mismatch on registration submit', async () => {
      render(
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <RegisterPage />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      );

      fireEvent.change(screen.getByPlaceholderText('name@example.com'), {
        target: { value: 'newuser@example.com' },
      });
      fireEvent.change(screen.getByPlaceholderText('Min. 8 characters'), {
        target: { value: 'Password123!' },
      });
      fireEvent.change(screen.getByPlaceholderText('Re-enter password'), {
        target: { value: 'DifferentPass' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Register/i }));

      await waitFor(() => {
        expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
      });
    });
  });

  describe('ProtectedRoute Behavior', () => {
    it('redirects unauthenticated user to login route', async () => {
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/protected']}>
            <Routes>
              <Route path="/login" element={<div>Public Login Page</div>} />
              <Route
                path="/protected"
                element={
                  <ProtectedRoute>
                    <div>Secret Workspace Data</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );

      expect(await screen.findByText('Public Login Page')).toBeInTheDocument();
      expect(screen.queryByText('Secret Workspace Data')).not.toBeInTheDocument();
    });
  });
});

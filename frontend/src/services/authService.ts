import {
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  resendSignUpCode as amplifyResendCode,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmReset,
  fetchAuthSession as amplifyFetchSession,
  getCurrentUser as amplifyGetCurrentUser,
} from 'aws-amplify/auth';
import { getCognitoConfig, configureAmplify } from '../config/cognito';

export interface AuthUser {
  userId: string;
  email: string;
  emailVerified: boolean;
}

export interface AuthSessionData {
  user: AuthUser | null;
  idToken: string | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

// Local mock storage keys for offline/demo development
const MOCK_AUTH_STORAGE_KEY = 'saas_mock_auth_session';
const MOCK_USERS_STORAGE_KEY = 'saas_mock_registered_users';

interface MockUserEntry {
  email: string;
  passwordHash: string;
  confirmed: boolean;
  code: string;
}

export class AuthService {
  private static isConfigured(): boolean {
    const config = getCognitoConfig();
    if (config.isConfigured) {
      configureAmplify();
    }
    return config.isConfigured;
  }

  /**
   * Translates Cognito exceptions into clear, actionable user messages
   */
  public static mapError(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'name' in error) {
      const err = error as { name: string; message?: string };
      switch (err.name) {
        case 'UserNotConfirmedException':
          return 'Your email address has not been confirmed yet. Please verify your email with the 6-digit confirmation code.';
        case 'NotAuthorizedException':
          return 'Incorrect email address or password. Please verify your credentials and try again.';
        case 'UsernameExistsException':
          return 'An account with this email address already exists. Please sign in or reset your password.';
        case 'CodeMismatchException':
          return 'Invalid confirmation code entered. Please check your email and enter the correct 6-digit code.';
        case 'ExpiredCodeException':
          return 'The confirmation code has expired. Please click "Resend Code" to generate a new verification code.';
        case 'InvalidPasswordException':
          return 'Password does not satisfy the security policy (must be at least 8 characters with lowercase, uppercase, and numbers).';
        case 'UserNotFoundException':
          return 'No user account found matching this email address.';
        case 'LimitExceededException':
          return 'Too many attempts. Please wait a few minutes before trying again.';
        default:
          return err.message || 'An unexpected authentication error occurred.';
      }
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'An unexpected authentication error occurred.';
  }

  /**
   * User Registration
   */
  public static async register(email: string, password: string): Promise<{ isComplete: boolean; nextStep: string }> {
    if (this.isConfigured()) {
      try {
        const result = await amplifySignUp({
          username: email,
          password,
          options: {
            userAttributes: {
              email,
            },
          },
        });
        return {
          isComplete: result.isSignUpComplete,
          nextStep: result.nextStep.signUpStep,
        };
      } catch (err) {
        throw new Error(this.mapError(err));
      }
    }

    // Mock Mode Fallback for local testing without AWS resources
    const users: Record<string, MockUserEntry> = JSON.parse(
      localStorage.getItem(MOCK_USERS_STORAGE_KEY) || '{}'
    );
    if (users[email.toLowerCase()]) {
      throw new Error(this.mapError({ name: 'UsernameExistsException' }));
    }
    users[email.toLowerCase()] = {
      email,
      passwordHash: btoa(password),
      confirmed: false,
      code: '123456',
    };
    localStorage.setItem(MOCK_USERS_STORAGE_KEY, JSON.stringify(users));
    return { isComplete: false, nextStep: 'CONFIRM_SIGN_UP' };
  }

  /**
   * Email Confirmation with 6-digit code
   */
  public static async confirmEmail(email: string, code: string): Promise<boolean> {
    if (this.isConfigured()) {
      try {
        const result = await amplifyConfirmSignUp({
          username: email,
          confirmationCode: code,
        });
        return result.isSignUpComplete;
      } catch (err) {
        throw new Error(this.mapError(err));
      }
    }

    // Mock Mode Fallback
    const users: Record<string, MockUserEntry> = JSON.parse(
      localStorage.getItem(MOCK_USERS_STORAGE_KEY) || '{}'
    );
    const user = users[email.toLowerCase()];
    if (!user) {
      throw new Error('User not found.');
    }
    if (code !== '123456' && code !== user.code) {
      throw new Error(this.mapError({ name: 'CodeMismatchException' }));
    }
    user.confirmed = true;
    localStorage.setItem(MOCK_USERS_STORAGE_KEY, JSON.stringify(users));
    return true;
  }

  /**
   * Resend Confirmation Code
   */
  public static async resendCode(email: string): Promise<void> {
    if (this.isConfigured()) {
      try {
        await amplifyResendCode({ username: email });
        return;
      } catch (err) {
        throw new Error(this.mapError(err));
      }
    }

    // Mock Mode Fallback
    const users: Record<string, MockUserEntry> = JSON.parse(
      localStorage.getItem(MOCK_USERS_STORAGE_KEY) || '{}'
    );
    if (!users[email.toLowerCase()]) {
      throw new Error('User not found.');
    }
  }

  /**
   * Sign In with Email and Password
   */
  public static async signIn(email: string, password: string): Promise<AuthUser> {
    if (this.isConfigured()) {
      try {
        const result = await amplifySignIn({
          username: email,
          password,
        });
        if (!result.isSignedIn && result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
          const err = new Error('User email not confirmed.');
          err.name = 'UserNotConfirmedException';
          throw err;
        }
        return await this.getCurrentUser();
      } catch (err) {
        throw new Error(this.mapError(err));
      }
    }

    // Mock Mode Fallback
    const users: Record<string, MockUserEntry> = JSON.parse(
      localStorage.getItem(MOCK_USERS_STORAGE_KEY) || '{}'
    );
    const user = users[email.toLowerCase()];
    if (!user || user.passwordHash !== btoa(password)) {
      throw new Error(this.mapError({ name: 'NotAuthorizedException' }));
    }
    if (!user.confirmed) {
      throw new Error(this.mapError({ name: 'UserNotConfirmedException' }));
    }

    const authUser: AuthUser = {
      userId: `mock-usr-${email.replace(/[^a-zA-Z0-9]/g, '')}`,
      email,
      emailVerified: true,
    };
    localStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(authUser));
    return authUser;
  }

  /**
   * Sign Out
   */
  public static async signOut(): Promise<void> {
    if (this.isConfigured()) {
      try {
        await amplifySignOut();
      } catch (err) {
        console.warn('Amplify sign out error:', err);
      }
    }
    localStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
  }

  /**
   * Request Password Reset Code
   */
  public static async requestPasswordReset(email: string): Promise<void> {
    if (this.isConfigured()) {
      try {
        await amplifyResetPassword({ username: email });
        return;
      } catch (err) {
        throw new Error(this.mapError(err));
      }
    }

    // Mock Mode Fallback
    const users: Record<string, MockUserEntry> = JSON.parse(
      localStorage.getItem(MOCK_USERS_STORAGE_KEY) || '{}'
    );
    if (!users[email.toLowerCase()]) {
      throw new Error(this.mapError({ name: 'UserNotFoundException' }));
    }
  }

  /**
   * Confirm Password Reset with Code & New Password
   */
  public static async confirmPasswordReset(email: string, code: string, newPass: string): Promise<void> {
    if (this.isConfigured()) {
      try {
        await amplifyConfirmReset({
          username: email,
          confirmationCode: code,
          newPassword: newPass,
        });
        return;
      } catch (err) {
        throw new Error(this.mapError(err));
      }
    }

    // Mock Mode Fallback
    const users: Record<string, MockUserEntry> = JSON.parse(
      localStorage.getItem(MOCK_USERS_STORAGE_KEY) || '{}'
    );
    const user = users[email.toLowerCase()];
    if (!user) {
      throw new Error(this.mapError({ name: 'UserNotFoundException' }));
    }
    if (code !== '123456') {
      throw new Error(this.mapError({ name: 'CodeMismatchException' }));
    }
    user.passwordHash = btoa(newPass);
    localStorage.setItem(MOCK_USERS_STORAGE_KEY, JSON.stringify(users));
  }

  /**
   * Fetch Active Session & ID Token
   */
  public static async fetchSession(forceRefresh: boolean = false): Promise<AuthSessionData> {
    if (this.isConfigured()) {
      try {
        const session = await amplifyFetchSession({ forceRefresh });
        const tokens = session.tokens;
        if (!tokens?.idToken) {
          return {
            user: null,
            idToken: null,
            accessToken: null,
            isAuthenticated: false,
          };
        }
        const user = await this.getCurrentUser();
        return {
          user,
          idToken: tokens.idToken.toString(),
          accessToken: tokens.accessToken?.toString() || null,
          isAuthenticated: true,
        };
      } catch {
        return {
          user: null,
          idToken: null,
          accessToken: null,
          isAuthenticated: false,
        };
      }
    }

    // Mock Mode Fallback
    const raw = localStorage.getItem(MOCK_AUTH_STORAGE_KEY);
    if (raw) {
      const user: AuthUser = JSON.parse(raw);
      return {
        user,
        idToken: `mock-jwt-token-${user.userId}`,
        accessToken: `mock-access-token-${user.userId}`,
        isAuthenticated: true,
      };
    }
    return {
      user: null,
      idToken: null,
      accessToken: null,
      isAuthenticated: false,
    };
  }

  /**
   * Get Current Authenticated User
   */
  public static async getCurrentUser(): Promise<AuthUser> {
    if (this.isConfigured()) {
      const current = await amplifyGetCurrentUser();
      const session = await amplifyFetchSession();
      const claims = session.tokens?.idToken?.payload;
      return {
        userId: current.userId,
        email: (claims?.email as string) || current.username,
        emailVerified: (claims?.email_verified as boolean) ?? false,
      };
    }

    const raw = localStorage.getItem(MOCK_AUTH_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
    throw new Error('No user currently authenticated');
  }
}

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthService, AuthUser } from '../services/authService';

interface AuthContextType {
  user: AuthUser | null;
  idToken: string | null;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<AuthUser>;
  register: (email: string, pass: string) => Promise<{ isComplete: boolean; nextStep: string }>;
  confirmEmail: (email: string, code: string) => Promise<boolean>;
  resendCode: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (email: string, code: string, newPass: string) => Promise<void>;
  refreshSession: (force?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async (force: boolean = false) => {
    try {
      const session = await AuthService.fetchSession(force);
      setUser(session.user);
      setIdToken(session.idToken);
    } catch {
      setUser(null);
      setIdToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (email: string, pass: string): Promise<AuthUser> => {
    setIsLoading(true);
    try {
      const authUser = await AuthService.signIn(email, pass);
      await refreshSession(true);
      return authUser;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, pass: string) => {
    return await AuthService.register(email, pass);
  };

  const confirmEmail = async (email: string, code: string) => {
    const success = await AuthService.confirmEmail(email, code);
    return success;
  };

  const resendCode = async (email: string) => {
    await AuthService.resendCode(email);
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await AuthService.signOut();
      setUser(null);
      setIdToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const requestPasswordReset = async (email: string) => {
    await AuthService.requestPasswordReset(email);
  };

  const confirmPasswordReset = async (email: string, code: string, newPass: string) => {
    await AuthService.confirmPasswordReset(email, code, newPass);
  };

  const isAuthenticated = Boolean(user && idToken);
  const isEmailVerified = Boolean(user?.emailVerified);

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        isAuthenticated,
        isEmailVerified,
        isLoading,
        login,
        register,
        confirmEmail,
        resendCode,
        logout,
        requestPasswordReset,
        confirmPasswordReset,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

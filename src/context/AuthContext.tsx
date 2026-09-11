import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  subscribeToAuth,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle as authLoginWithGoogle,
  processRedirectResult,
  logout as authLogout,
  getUserProfile,
  logAuthDebug
} from '../services/authService';
import { AppUser, UserProfile } from '../types/auth';

interface AuthContextType {
  user: AppUser | null;
  profile: UserProfile | null;
  loading: boolean;
  redirectError: { code?: string; message: string } | null;
  clearRedirectError: () => void;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string) => Promise<void>;
  loginGoogle: (forceRedirect?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  setProfile: React.Dispatch<React.SetStateAction<UserProfile | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [redirectError, setRedirectError] = useState<{ code?: string; message: string } | null>(null);

  useEffect(() => {
    let isMounted = true;

    // 1. Check for any pending redirect result from Google OAuth flow
    processRedirectResult()
      .then(async (redirectUser) => {
        if (redirectUser && isMounted) {
          setUser(redirectUser);
          const prof = await getUserProfile(redirectUser.uid);
          if (isMounted) {
            setProfile(
              prof || {
                userId: redirectUser.uid,
                displayName: redirectUser.displayName || redirectUser.email?.split('@')[0] || 'Admin',
                email: redirectUser.email || '',
                photoUrl: redirectUser.photoURL || null
              }
            );
          }
        }
      })
      .catch((err: any) => {
        console.warn('[RestaurantOS Google Auth Debug] Redirect result error captured:', err);
        if (isMounted) {
          setRedirectError({
            code: err?.code,
            message: err?.message || 'Redirect authentication could not be completed.'
          });
        }
      });

    // 2. Real-time Firebase Authentication listener
    const unsubscribe = subscribeToAuth(async (appUser) => {
      if (!isMounted) return;
      setUser(appUser);
      if (appUser) {
        logAuthDebug({
          authMethod: 'onAuthStateChanged',
          authenticatedUid: appUser.uid
        });
        const prof = await getUserProfile(appUser.uid);
        if (isMounted) {
          setProfile(
            prof || {
              userId: appUser.uid,
              displayName: appUser.displayName || appUser.email?.split('@')[0] || 'Admin',
              email: appUser.email || '',
              photoUrl: appUser.photoURL || null
            }
          );
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const clearRedirectError = () => {
    setRedirectError(null);
  };

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      const u = await loginWithEmail(email, pass);
      setUser(u);
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, pass: string, name: string) => {
    setLoading(true);
    try {
      const u = await registerWithEmail(email, pass, name);
      setUser(u);
    } finally {
      setLoading(false);
    }
  };

  const loginGoogle = async (forceRedirect = false) => {
    setLoading(true);
    try {
      const u = await authLoginWithGoogle(forceRedirect);
      if (u) {
        setUser(u);
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await authLogout();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        redirectError,
        clearRedirectError,
        login,
        register,
        loginGoogle,
        logout,
        setProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

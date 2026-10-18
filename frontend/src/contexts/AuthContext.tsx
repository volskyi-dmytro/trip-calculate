import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authService } from '../services/authService';
import { buildLoginUrl } from '../utils/loginUrl';
import { markSignInStarted, consumeSignInStarted } from '../utils/signInTracking';
import { track } from '../lib/analytics';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Starts Google sign-in; after it the user comes back to `returnTo` (default: this page). */
  login: (returnTo?: string, source?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const userData = await authService.getCurrentUser();
      if (userData.authenticated && userData.name && userData.email) {
        setUser({
          id: userData.id || '',
          name: userData.name,
          email: userData.email,
          picture: userData.picture || '',
          authenticated: true,
          role: (userData.role as 'USER' | 'ADMIN') || 'USER',
          isAdmin: userData.isAdmin || false,
        });
        const started = consumeSignInStarted();
        if (started) track('signin_success', { source: started.source, return_to: started.returnTo });
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = (returnTo?: string, source = 'direct') => {
    const url = buildLoginUrl(returnTo);
    markSignInStarted(source, returnTo ?? window.location.pathname);
    track('signin_continue', { source });
    window.location.href = url;
  };

  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook belongs next to its provider; only affects dev hot reload
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authService } from '../services/authService';
import { API_BASE_URL } from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => void;
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

  const login = () => {
    const loginPath = '/oauth2/authorization/google';
    const target =
      API_BASE_URL && API_BASE_URL.length > 0
        ? `${API_BASE_URL}${loginPath}`
        : loginPath;
    window.location.href = target.trim();
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Attempt to hydrate user from token on mount or token change
    const hydrate = async () => {
      const currentToken = localStorage.getItem('token');
      if (!currentToken) {
        if (active) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.getMe();
        if (active) {
          setUser(res.data);
          setToken(currentToken);
        }
      } catch (error) {
        if (active) {
          setToken(null);
          setUser(null);
          localStorage.removeItem('token');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    hydrate();

    return () => {
      active = false;
    };
  }, [token]);

  const localLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  // Set the token state in api.ts listener
  useEffect(() => {
    // Listen for 401 events dispatched from api.ts to clear auth locally without calling /logout
    const handleUnauthorized = () => {
      localLogout();
    };
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, []);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    try {
      if (token) {
        await api.logout();
      }
    } catch (e) {
      console.error('Server logout failed (clearing local state anyway):', e);
    } finally {
      localLogout();
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
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

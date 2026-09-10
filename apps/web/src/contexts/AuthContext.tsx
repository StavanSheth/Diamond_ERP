import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { sessionStore } from '../services/api/client';

interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
  profiles?: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  profileId: string | null;
  loading: boolean;
  login: (token: string, user: User, profileId?: string) => void;
  logout: () => void;
  switchProfile: (newProfileId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(sessionStore.getToken());
  const [profileId, setProfileIdState] = useState<string | null>(sessionStore.getProfileId());
  const [loading, setLoading] = useState(true);

  // Sync profile state on external or internal profileChanged event
  useEffect(() => {
    const handleProfileChanged = (e: Event) => {
      const custom = e as CustomEvent;
      setProfileIdState(custom.detail?.profileId || null);
    };
    window.addEventListener('profileChanged', handleProfileChanged);
    return () => window.removeEventListener('profileChanged', handleProfileChanged);
  }, []);

  useEffect(() => {
    let active = true;

    // Attempt to hydrate user from token on mount or token change
    const hydrate = async () => {
      const currentToken = sessionStore.getToken();
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
          sessionStore.setToken(null);
          setToken(null);
          setUser(null);
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
    sessionStore.setToken(null);
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

  const login = (newToken: string, newUser: User, initialProfileId?: string) => {
    sessionStore.setToken(newToken);
    if (initialProfileId) {
      sessionStore.setProfileId(initialProfileId);
      setProfileIdState(initialProfileId);
    }
    setToken(newToken);
    setUser(newUser);
  };

  const switchProfile = (newProfileId: string) => {
    sessionStore.setProfileId(newProfileId);
    setProfileIdState(newProfileId);
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
    <AuthContext.Provider value={{ user, token, profileId, loading, login, logout, switchProfile }}>
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

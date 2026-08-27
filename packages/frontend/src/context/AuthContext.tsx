import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { UserProfile, AuthTokens } from '@vcc/shared';
import { api } from '../lib/api';

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = 'vcc_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const saveAuth = useCallback((profile: UserProfile, tokens: AuthTokens) => {
    localStorage.setItem(TOKEN_KEY, tokens.accessToken);
    setToken(tokens.accessToken);
    setUser(profile);
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api<UserProfile>('/api/auth/me', { token })
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = async (email: string, password: string) => {
    const data = await api<{ user: UserProfile; tokens: AuthTokens }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    saveAuth(data.user, data.tokens);
  };

  const register = async (username: string, email: string, password: string) => {
    const data = await api<{ user: UserProfile; tokens: AuthTokens }>('/api/auth/register', {
      method: 'POST',
      body: { username, email, password },
    });
    saveAuth(data.user, data.tokens);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

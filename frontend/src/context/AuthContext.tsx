import { createContext, useState, useEffect, useRef, ReactNode } from 'react';
export { useAuth } from './useAuth';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<string>;
  register: (name: string, email: string, password: string) => Promise<string>;
  logout: () => void;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

interface SessionPayload {
  user: User;
  accessToken?: string;
  token?: string;
}

function readToken(payload: SessionPayload): string | null {
  return payload.accessToken || payload.token || null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // The access token lives only in memory. Sessions survive reloads through
  // the httpOnly refresh cookie, which JavaScript can never read.
  const [user, setUser] = useState<User | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setToken = (value: string | null) => {
    tokenRef.current = value;
    setTokenState(value);
  };

  // Silent session restore on app start via the refresh cookie.
  useEffect(() => {
    let cancelled = false;
    void fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('no session'))))
      .then((data: SessionPayload) => {
        if (cancelled) return;
        const tokenValue = readToken(data);
        if (tokenValue && data.user) {
          setToken(tokenValue);
          setUser(data.user);
        }
      })
      .catch(() => {
        // No active session; stay logged out.
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      const tokenValue = readToken(data);
      if (!tokenValue) throw new Error('Login failed');
      setToken(tokenValue);
      setUser(data.user);
      return tokenValue;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      const tokenValue = readToken(data);
      if (!tokenValue) throw new Error('Registration failed');
      setToken(tokenValue);
      setUser(data.user);
      return tokenValue;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    fetch(`${API_URL}/api/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    setToken(null);
    setUser(null);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading, isRestoring, error, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

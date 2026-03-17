'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  getCurrentUser,
  isAuthenticated as checkIsAuthenticated,
  signOut,
  signIn,
  signUp,
  signInWithGoogle,
} from '@/lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      if (!checkIsAuthenticated()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const userData = await getCurrentUser();
        if (!cancelled) setUser(userData);
      } catch (err) {
        if (!cancelled) {
          console.error('[AuthProvider] Session restore failed:', err);
          setError(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initAuth();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await signIn(email, password);
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (name, email, password) => {
    setLoading(true);
    setError(null);
    try {
      return await signUp(name, email, password);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async (idToken) => {
    setLoading(true);
    setError(null);
    try {
      const data = await signInWithGoogle(idToken);
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('[AuthProvider] Sign-out error:', err);
    } finally {
      setUser(null);
      setError(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Boolean — NOT a function
  const isAuthenticated = useMemo(() => !!user, [user]);

  const value = useMemo(() => ({
    user,
    loading,
    error,
    isAuthenticated,
    login,
    loginWithGoogle,
    register,
    logout,
    clearError,
  }), [user, loading, error, isAuthenticated, login, loginWithGoogle, register, logout, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

export const useUser            = () => useAuth().user;
export const useIsAuthenticated = () => useAuth().isAuthenticated;
export const useAuthLoading     = () => useAuth().loading;
export const useAuthError       = () => ({ error: useAuth().error, clearError: useAuth().clearError });
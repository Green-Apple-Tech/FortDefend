import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  clearSession,
  getStoredOrg,
  getStoredUser,
  setAccessToken,
  setStoredOrg,
  setStoredUser,
} from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [org, setOrg] = useState(getStoredOrg);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await api('/api/orgs/me/profile');
      if (profile?.user) {
        setUser(profile.user);
        setStoredUser(profile.user);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const refreshOrg = useCallback(async () => {
    try {
      const me = await api('/api/orgs/me');
      const o = {
        id: me.id,
        name: me.name,
        plan: me.plan,
        deviceLimit: me.deviceLimit,
        subscriptionStatus: me.subscriptionStatus,
        deviceCount: me.deviceCount,
      };
      setOrg(o);
      setStoredOrg(o);
      return o;
    } catch {
      setOrg(null);
      setStoredOrg(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await api('/api/orgs/me/profile');
        if (!cancelled && me?.user) {
          setUser(me.user);
          setStoredUser(me.user);
          await refreshOrg();
        }
      } catch {
        clearSession();
        if (!cancelled) {
          setUser(null);
          setOrg(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshOrg]);

  const login = useCallback(async (email, password) => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    if (res.requiresTOTP && res.tempToken) {
      return { requiresTOTP: true, tempToken: res.tempToken };
    }
    if (res.accessToken) {
      setAccessToken(res.accessToken);
      await refreshOrg();
      const profile = await api('/api/orgs/me/profile');
      if (profile?.user) {
        setUser(profile.user);
        setStoredUser(profile.user);
      }
      return { ok: true, setupTOTP: !!res.setupTOTP };
    }
    return { ok: false };
  }, [refreshOrg]);

  const completeTotpLogin = useCallback(async (tempToken, code) => {
    const res = await api('/api/auth/login/totp', {
      method: 'POST',
      body: { tempToken, code },
    });
    if (res.accessToken) {
      setAccessToken(res.accessToken);
      await refreshOrg();
      const profile = await api('/api/orgs/me/profile');
      if (profile?.user) {
        setUser(profile.user);
        setStoredUser(profile.user);
      }
      return { ok: true };
    }
    return { ok: false };
  }, [refreshOrg]);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    clearSession();
    setUser(null);
    setOrg(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      org,
      loading,
      login,
      completeTotpLogin,
      logout,
      refreshOrg,
      refreshUser,
      needs2FASetup: !!(user && !user.totp_enabled),
    }),
    [user, org, loading, login, completeTotpLogin, logout, refreshOrg, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

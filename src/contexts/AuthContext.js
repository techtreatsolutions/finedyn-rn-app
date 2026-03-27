import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import api, { setOnAuthFailure } from '../api/client';
import { getToken, setToken, removeToken, setUser as storeUser, clearAll } from '../services/storage';
import { ROLE_REDIRECT } from '../utils/constants';
import { registerDeviceWithBackend, unregisterDevice } from '../services/notifications';

export const AuthContext = createContext(null);

function normalizeUser(data) {
  if (!data) return null;
  const u = data.user || data;
  let sectionAccess = null;
  if (u.section_access) {
    try {
      sectionAccess = typeof u.section_access === 'string' ? JSON.parse(u.section_access) : u.section_access;
    } catch { sectionAccess = null; }
  }
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    restaurantId: u.restaurantId || u.restaurant_id,
    restaurantName: u.restaurantName || u.restaurant_name,
    restaurantType: u.restaurantType || u.restaurant_type,
    profileImage: u.profileImage || u.profile_image,
    sectionAccess,
  };
}

export function AuthProvider({ children, navigationRef }) {
  const [user, setUser] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Register auth failure handler
  useEffect(() => {
    setOnAuthFailure(() => {
      if (mounted.current) {
        setUser(null);
        setFeatures(null);
      }
    });
  }, []);

  // Fetch restaurant features (plan + overrides)
  const fetchFeatures = useCallback(async () => {
    try {
      const res = await api.get('/restaurant/subscription');
      if (res.success && res.data?.features) {
        if (mounted.current) setFeatures(res.data.features);
      }
    } catch {
      // Non-critical — features will be null (show all)
    }
  }, []);

  // Check existing token on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) { setLoading(false); return; }
        const res = await api.get('/auth/profile');
        if (res.success && res.data) {
          const normalized = normalizeUser(res.data);
          setUser(normalized);
          await storeUser(normalized);
          registerDeviceWithBackend().catch(() => {});
          // Fetch features for non-super-admin users
          if (normalized.restaurantId) fetchFeatures();
        } else {
          await clearAll();
        }
      } catch {
        await clearAll();
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
  }, [fetchFeatures]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password, rememberMe: true });
    if (res.success && res.data?.token) {
      await setToken(res.data.token);
      const normalized = normalizeUser(res.data);
      setUser(normalized);
      await storeUser(normalized);
      registerDeviceWithBackend().catch(() => {});
      if (normalized.restaurantId) fetchFeatures();
      return normalized;
    }
    throw new Error(res.message || 'Login failed');
  }, [fetchFeatures]);

  const pinLogin = useCallback(async (email, pin) => {
    const res = await api.post('/auth/pin-login', { email, pin });
    if (res.success && res.data?.token) {
      await setToken(res.data.token);
      const normalized = normalizeUser(res.data);
      setUser(normalized);
      await storeUser(normalized);
      registerDeviceWithBackend().catch(() => {});
      if (normalized.restaurantId) fetchFeatures();
      return normalized;
    }
    throw new Error(res.message || 'PIN login failed');
  }, [fetchFeatures]);

  const logout = useCallback(async () => {
    await unregisterDevice().catch(() => {});
    try { await api.post('/auth/logout'); } catch {}
    await clearAll();
    setUser(null);
    setFeatures(null);
  }, []);

  const getInitialRoute = useCallback(() => {
    if (!user) return 'Login';
    return ROLE_REDIRECT[user.role] || 'AdminDrawer';
  }, [user]);

  // Check if a specific feature is enabled
  const hasFeature = useCallback((featureName) => {
    if (!features) return true; // if features not loaded yet, show all
    return features[featureName] === true || features[featureName] === 1;
  }, [features]);

  // Check if user has access to a specific section
  const hasAccess = useCallback((sectionKey) => {
    // Owners always have full access
    if (user?.role === 'owner') return true;
    // If no section_access restrictions, allow all
    if (!user?.sectionAccess || !Array.isArray(user.sectionAccess) || user.sectionAccess.length === 0) return true;
    // Dashboard is always accessible
    if (sectionKey === 'dashboard') return true;
    return user.sectionAccess.includes(sectionKey);
  }, [user]);

  const value = {
    user, loading, features, login, pinLogin, logout, getInitialRoute,
    hasFeature, hasAccess,
    isOwner: user?.role === 'owner',
    isManager: user?.role === 'manager',
    isAdmin: user?.role === 'owner' || user?.role === 'manager',
    isCashier: user?.role === 'cashier',
    isWaiter: user?.role === 'waiter',
    isKitchen: user?.role === 'kitchen_staff',
    isQR: user?.restaurantType === 'qr',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

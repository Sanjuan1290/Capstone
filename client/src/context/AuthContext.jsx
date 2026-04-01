// client/src/context/AuthContext.jsx
// FIX: Store role hint in localStorage so on reload we hit only ONE check-auth
//      endpoint instead of all 4 sequentially — this is why sessions were lost
//      on hard refresh (sequential fetches are slow / one could error out).

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

const ENDPOINT_MAP = {
  admin:   '/api/admin/check-auth',
  staff:   '/api/staff/check-auth',
  doctor:  '/api/doctor/check-auth',
  patient: '/api/patient/check-auth',
};

const LOGOUT_MAP = {
  admin:   '/api/admin/logout',
  staff:   '/api/staff/logout',
  doctor:  '/api/doctor/logout',
  patient: '/api/patient/logout',
};

export const AuthProvider = ({ children }) => {
  const [user,  setUser]  = useState(null);
  const [role,  setRole]  = useState(null);
  const [ready, setReady] = useState(false);

  const checkAuth = useCallback(async () => {
    // Use stored role hint to check the right endpoint FIRST (1 request on reload)
    // Fall back to all roles if the hint misses or isn't stored.
    const hint = localStorage.getItem('auth_role');

    const orderedRoles = hint && ENDPOINT_MAP[hint]
      ? [hint, ...Object.keys(ENDPOINT_MAP).filter(r => r !== hint)]
      : Object.keys(ENDPOINT_MAP);

    for (const r of orderedRoles) {
      try {
        const res  = await fetch(ENDPOINT_MAP[r], { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
          setUser(data.user);
          setRole(r);
          setReady(true);
          localStorage.setItem('auth_role', r);
          return;
        }
      } catch {
        // network error for this endpoint — try next
      }
    }

    // Nothing authenticated — clear everything
    setUser(null);
    setRole(null);
    setReady(true);
    localStorage.removeItem('auth_role');
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = (userData, userRole) => {
    setUser(userData);
    setRole(userRole);
    localStorage.setItem('auth_role', userRole); // persist hint for reload
  };

  const logout = async () => {
    if (role && LOGOUT_MAP[role]) {
      try {
        await fetch(LOGOUT_MAP[role], { method: 'POST', credentials: 'include' });
      } catch { /* ignore */ }
    }
    setUser(null);
    setRole(null);
    localStorage.removeItem('auth_role');
  };

  return (
    <AuthContext.Provider value={{ user, role, ready, login, logout, setUser, setRole, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
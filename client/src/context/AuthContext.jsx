// client/src/context/AuthContext.jsx
// FIX: Auth check URLs were wrong (/api/admin/auth/check → /api/admin/check-auth)
// FIX: Added login() and logout() to context value so all pages can use them
// FIX: Sequential checks stop at first authenticated role (no race conditions)

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false);

  const checkAuth = useCallback(async () => {
    // FIXED: correct check-auth URLs to match server routes
    const endpoints = [
      { role: 'admin',   url: '/api/admin/check-auth'   },
      { role: 'staff',   url: '/api/staff/check-auth'   },
      { role: 'doctor',  url: '/api/doctor/check-auth'  },
      { role: 'patient', url: '/api/patient/check-auth' },
    ];

    for (const item of endpoints) {
      try {
        const res  = await fetch(item.url, { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
          setUser(data.user);
          setRole(item.role);
          setReady(true);
          return; // stop after first match
        }
      } catch {
        // network error — skip this role
      }
    }
    // Nothing authenticated
    setUser(null);
    setRole(null);
    setReady(true);
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // FIX: expose login() and logout() so components don't have to call setUser/setRole directly
  const login = (userData, userRole) => {
    setUser(userData);
    setRole(userRole);
  };

  const logout = async () => {
    // Call the appropriate logout endpoint
    const logoutUrls = {
      admin:   '/api/admin/logout',
      staff:   '/api/staff/logout',
      doctor:  '/api/doctor/logout',
      patient: '/api/patient/logout',
    };
    if (role && logoutUrls[role]) {
      try {
        await fetch(logoutUrls[role], { method: 'POST', credentials: 'include' });
      } catch { /* ignore */ }
    }
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, ready, login, logout, setUser, setRole, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
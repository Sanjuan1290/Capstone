// client/src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [ready, setReady] = useState(false); // CRITICAL: Track if auth check is done

  const checkAuth = async () => {
    // Check for each role's specific token/session
    const endpoints = [
      { role: 'admin', url: '/api/admin/auth/check' },
      { role: 'staff', url: '/api/staff/auth/check' },
      { role: 'doctor', url: '/api/doctor/auth/check' },
      { role: 'patient', url: '/api/patient/auth/check' }
    ];

    for (const item of endpoints) {
      try {
        const res = await fetch(item.url, { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
          setUser(data.user);
          setRole(item.role);
          break; // Stop if we find an active session
        }
      } catch (err) {
        console.error(`Auth check failed for ${item.role}`);
      }
    }
    setReady(true); // Verification is finished
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, ready, setUser, setRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
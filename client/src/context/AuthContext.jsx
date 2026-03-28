// client/src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null)
  const [role, setRole]       = useState(null)
  const [ready, setReady]     = useState(false)   // <-- NEW: true once initial check is done

  // On mount, verify the cookie with the server for each possible role
  useEffect(() => {
    const checkAll = async () => {
      const roles = [
        { role: 'admin',   url: '/api/admin/check-auth'   },
        { role: 'staff',   url: '/api/staff/check-auth'   },
        { role: 'doctor',  url: '/api/doctor/check-auth'  },
        { role: 'patient', url: '/api/patient/check-auth' },
      ]
      for (const { role, url } of roles) {
        try {
          const res  = await fetch(url, { credentials: 'include' })
          const data = await res.json()
          if (data.authenticated && data.user) {
            setUser(data.user)
            setRole(role)
            setReady(true)
            return
          }
        } catch {
          // ignore network errors for individual role checks
        }
      }
      setReady(true)
    }
    checkAll()
  }, [])

  const login = (userData, userRole) => {
    setUser(userData)
    setRole(userRole)
  }

  const logout = () => {
    setUser(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ user, role, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
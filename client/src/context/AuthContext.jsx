import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null)
  const [role, setRole]       = useState(null)   // 'patient' | 'admin' | 'staff' | 'doctor'
  const [loading, setLoading] = useState(true)   // true while first auth check runs

  // On mount, check if there's already a valid cookie for any role
  useEffect(() => {
    const checkSession = async () => {
      const roles = ['patient', 'admin', 'staff', 'doctor']
      for (const r of roles) {
        try {
          const res = await fetch(`/api/${r}/auth/check`, { credentials: 'include' })
          const data = await res.json()
          if (data.authenticated) {
            setUser(data.user)
            setRole(r)
            break
          }
        } catch { /* skip */ }
      }
      setLoading(false)
    }
    checkSession()
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
    <AuthContext.Provider value={{ user, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
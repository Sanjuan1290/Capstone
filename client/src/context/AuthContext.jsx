import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext()

const ENDPOINT_MAP = {
  admin: '/api/admin/check-auth',
  staff: '/api/staff/check-auth',
  doctor: '/api/doctor/check-auth',
  patient: '/api/patient/check-auth',
}

const LOGOUT_MAP = {
  admin: '/api/admin/logout',
  staff: '/api/staff/logout',
  doctor: '/api/doctor/logout',
  patient: '/api/patient/logout',
}

const roleFromPath = (pathname = '') => {
  const first = String(pathname || '').split('/').filter(Boolean)[0]
  return ENDPOINT_MAP[first] ? first : null
}

const getTabRoleHint = () => {
  const pathRole = typeof window !== 'undefined' ? roleFromPath(window.location.pathname) : null
  const tabRole = typeof window !== 'undefined' ? sessionStorage.getItem('auth_role') : null
  return pathRole || (ENDPOINT_MAP[tabRole] ? tabRole : null)
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [ready, setReady] = useState(false)

  const checkAuth = useCallback(async () => {
    setReady(false)
    const hint = getTabRoleHint()
    const orderedRoles = hint
      ? [hint, ...Object.keys(ENDPOINT_MAP).filter((candidate) => candidate !== hint)]
      : Object.keys(ENDPOINT_MAP)

    for (const candidateRole of orderedRoles) {
      try {
        const res = await fetch(ENDPOINT_MAP[candidateRole], { credentials: 'include' })
        const data = await res.json()
        if (data.authenticated) {
          setUser(data.user)
          setRole(candidateRole)
          sessionStorage.setItem('auth_role', candidateRole)
          setReady(true)
          return
        }
      } catch {
        // Try the next role only after the preferred path/tab role fails.
      }
    }

    setUser(null)
    setRole(null)
    sessionStorage.removeItem('auth_role')
    setReady(true)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

  const login = (userData, userRole) => {
    setUser(userData)
    setRole(userRole)
    sessionStorage.setItem('auth_role', userRole)
  }

  const logout = async () => {
    if (role && LOGOUT_MAP[role]) {
      try {
        await fetch(LOGOUT_MAP[role], { method: 'POST', credentials: 'include' })
      } catch {
        // Local auth state is still cleared if the network request fails.
      }
    }
    setUser(null)
    setRole(null)
    sessionStorage.removeItem('auth_role')
  }

  return (
    <AuthContext.Provider value={{ user, role, ready, login, logout, setUser, setRole, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)


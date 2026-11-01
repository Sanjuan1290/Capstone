import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { logoutRoleSession } from '../utils/sessionLogout.mjs'
import { authCheckOutcome } from '../utils/authCheckResponse.mjs'

const AuthContext = createContext()

const ENDPOINT_MAP = {
  superadmin: '/api/admin/check-auth?portal=superadmin',
  admin: '/api/admin/check-auth',
  staff: '/api/staff/check-auth',
  doctor: '/api/doctor/check-auth',
  patient: '/api/patient/check-auth',
}

const roleFromPath = (pathname = '') => {
  const first = String(pathname || '').split('/').filter(Boolean)[0]
  // The public policy page is part of the patient booking flow. A new tab has
  // its own sessionStorage, so identify it by route and check the patient cookie first.
  if (first === 'booking-policy' || first === 'login') return 'patient'
  return ENDPOINT_MAP[first] ? first : null
}

const getPathRoleHint = () => (
  typeof window !== 'undefined' ? roleFromPath(window.location.pathname) : null
)

const getStoredRoleHint = () => {
  const tabRole = typeof window !== 'undefined' ? sessionStorage.getItem('auth_role') : null
  return ENDPOINT_MAP[tabRole] ? tabRole : null
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [ready, setReady] = useState(false)
  const [authCheckError, setAuthCheckError] = useState('')
  const authCheckRequestId = useRef(0)
  const lastFocusCheckAt = useRef(0)

  const checkAuth = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++authCheckRequestId.current
    if (!silent) {
      setReady(false)
      setAuthCheckError('')
    }

    const pathHint = getPathRoleHint()
    const storedHint = getStoredRoleHint()
    // A role-specific route must only trust that portal's cookie. This prevents
    // another portal's active cookie from masking a patient-session check failure.
    const orderedRoles = pathHint
      ? [pathHint]
      : storedHint
        ? [storedHint, ...Object.keys(ENDPOINT_MAP).filter((candidate) => candidate !== storedHint)]
        : Object.keys(ENDPOINT_MAP)
    let hadUnavailableCheck = false

    for (const candidateRole of orderedRoles) {
      try {
        const res = await fetch(ENDPOINT_MAP[candidateRole], {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })
        if (requestId !== authCheckRequestId.current) return
        if (!res.ok) {
          hadUnavailableCheck = true
          continue
        }

        const data = await res.json()
        if (requestId !== authCheckRequestId.current) return
        const outcome = authCheckOutcome(res, data)

        if (outcome === 'authenticated') {
          setUser(data.user)
          const actualRole = ['admin', 'superadmin'].includes(candidateRole)
            ? (data.user.account_role === 'superadmin' ? 'superadmin' : 'admin')
            : candidateRole
          setRole(actualRole)
          sessionStorage.setItem('auth_role', actualRole)
          setAuthCheckError('')
          setReady(true)
          return
        }

        if (outcome === 'unavailable') hadUnavailableCheck = true
      } catch {
        if (requestId !== authCheckRequestId.current) return
        hadUnavailableCheck = true
      }
    }

    if (requestId !== authCheckRequestId.current) return

    // A network/proxy/server failure is not proof that the patient signed out.
    // Keep any known identity and show a retry state instead of redirecting to login.
    if (hadUnavailableCheck) {
      setAuthCheckError('We could not verify your sign-in because the clinic server is temporarily unavailable. Your session has not been cleared. Please try again.')
      setReady(true)
      return
    }

    // Clear the local identity only after the relevant portal endpoints explicitly
    // confirm that no authenticated session exists.
    setUser(null)
    setRole(null)
    sessionStorage.removeItem('auth_role')
    setAuthCheckError('')
    setReady(true)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

  // Cookies are shared across tabs; sessionStorage is not. Revalidate when this
  // tab becomes active so a session created in another tab is recognised here.
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastFocusCheckAt.current < 1500) return
      lastFocusCheckAt.current = now
      checkAuth({ silent: true })
    }

    window.addEventListener('focus', revalidate)
    window.addEventListener('pageshow', revalidate)
    document.addEventListener('visibilitychange', revalidate)
    return () => {
      window.removeEventListener('focus', revalidate)
      window.removeEventListener('pageshow', revalidate)
      document.removeEventListener('visibilitychange', revalidate)
    }
  }, [checkAuth])

  const login = (userData, userRole) => {
    // Every new Patient login starts with an explicit clinic-branch selection.
    // Refresh/checkAuth does not clear the choice made during this login session.
    if (userRole === 'patient' && userData?.id) sessionStorage.removeItem(`carait:selected-branch:${userData.id}`)
    setUser(userData)
    setRole(userRole)
    setAuthCheckError('')
    sessionStorage.setItem('auth_role', userRole)
  }

  const logout = async () => {
    await logoutRoleSession(role)
    if (role === 'patient' && user?.id) sessionStorage.removeItem(`carait:selected-branch:${user.id}`)
    setUser(null)
    setRole(null)
    setAuthCheckError('')
    sessionStorage.removeItem('auth_role')
  }

  return (
    <AuthContext.Provider value={{ user, role, ready, authCheckError, login, logout, setUser, setRole, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

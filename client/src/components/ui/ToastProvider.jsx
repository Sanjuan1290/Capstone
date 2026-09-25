import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { MdCheckCircle, MdClose, MdError, MdInfo, MdWarning } from 'react-icons/md'

const ToastContext = createContext(null)

const TOAST_STYLES = {
  success: { icon: MdCheckCircle, className: 'toast-success' },
  error: { icon: MdError, className: 'toast-error' },
  warning: { icon: MdWarning, className: 'toast-warning' },
  info: { icon: MdInfo, className: 'toast-info' },
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message, options = {}) => {
    const id = makeId()
    const duration = Math.max(1500, Number(options.duration) || 4000)
    const toast = {
      id,
      message: String(message || 'Something happened.'),
      title: options.title ? String(options.title) : '',
      type: TOAST_STYLES[options.type] ? options.type : 'info',
      duration,
    }

    setToasts((current) => [...current.slice(-4), toast])
    timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
    return id
  }, [dismiss])

  useEffect(() => {
    // Route remaining legacy alert calls through the non-blocking toast system.
    const originalAlert = window.alert
    window.alert = (message) => {
      const text = String(message || '')
      const type = /fail|error|invalid|unable|not found/i.test(text)
        ? 'error'
        : /saved|success|added|updated|completed|confirmed/i.test(text)
          ? 'success'
          : 'info'
      showToast(text, { type })
    }
    return () => {
      window.alert = originalAlert
      timers.current.forEach((timer) => window.clearTimeout(timer))
      timers.current.clear()
    }
  }, [showToast])

  const value = useMemo(() => ({
    showToast,
    dismissToast: dismiss,
    success: (message, options = {}) => showToast(message, { ...options, type: 'success' }),
    error: (message, options = {}) => showToast(message, { ...options, type: 'error' }),
    warning: (message, options = {}) => showToast(message, { ...options, type: 'warning' }),
    info: (message, options = {}) => showToast(message, { ...options, type: 'info' }),
  }), [dismiss, showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => {
          const config = TOAST_STYLES[toast.type]
          const Icon = config.icon
          return (
            <div key={toast.id} className={`toast-card ${config.className}`} role={toast.type === 'error' ? 'alert' : 'status'}>
              <Icon className="toast-icon" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {toast.title && <p className="toast-title">{toast.title}</p>}
                <p className="toast-message">{toast.message}</p>
              </div>
              <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Close notification">
                <MdClose />
              </button>
              <span className="toast-progress" style={{ animationDuration: `${toast.duration}ms` }} />
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider.')
  return context
}


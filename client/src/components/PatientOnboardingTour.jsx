import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MdDashboard, MdMedicalServices, MdCalendarToday, MdEventAvailable, MdSettings } from 'react-icons/md'
import { useAuth } from '../context/AuthContext'

const STEPS = [
  { title:'Welcome to your Patient Portal', body:'Your dashboard shows upcoming appointments and recent activity.', path:'/patient', Icon:MdDashboard, target:'dashboard-home', interactive:false },
  { title:'Check Doctor Availability', body:'Open Doctor Availability to see clinic days and available schedules.', path:'/patient/doctors', Icon:MdMedicalServices, target:'doctor-availability', interactive:true },
  { title:'Book an Appointment', body:'Click Book Appointment to start a booking.', path:'/patient/book', Icon:MdCalendarToday, target:'book-appointment', interactive:true },
  { title:'Manage Your Appointments', body:'Open My Appointments to view pending and confirmed visits.', path:'/patient/appointments', Icon:MdEventAvailable, target:'my-appointments', interactive:true },
  { title:'Settings', body:'Keep your contact and personal information up to date here.', path:'/patient/settings', Icon:MdSettings, target:'patient-settings', interactive:true },
]

const isVisibleTourTarget = (element) => {
  if (!element || typeof window === 'undefined') return false
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false

  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false

  return (
    rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth
  )
}

const findVisibleTourTarget = (targetName) => {
  if (!targetName || typeof document === 'undefined') return null
  const matches = Array.from(document.querySelectorAll(`[data-tour="${targetName}"]`))
  return matches.find(isVisibleTourTarget) || null
}

const PatientOnboardingTour = () => {
  const { user, setUser } = useAuth()
  const location = useLocation()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState(null)

  const active = Boolean(user?.is_profile_complete && !user?.onboarding_completed_at)
  const safeIndex = Math.min(Math.max(index, 0), STEPS.length - 1)
  const step = STEPS[safeIndex]
  const Icon = step.Icon

  const finish = useCallback(async () => {
    await fetch('/api/patient/onboarding/complete', {
      method: 'PATCH',
      credentials: 'include',
    }).catch(() => {})
    setUser((prev) => prev ? { ...prev, onboarding_completed_at: new Date().toISOString() } : prev)
  }, [setUser])

  const go = useCallback((next) => {
    const nextIndex = Math.min(Math.max(next, 0), STEPS.length - 1)
    setIndex(nextIndex)
  }, [])

  useEffect(() => {
    // Hooks must always run in the same order. The active check belongs inside
    // the effect instead of returning from the component before this hook.
    if (!active) {
      setRect(null)
      return undefined
    }

    let retryTimer = null
    let boundTarget = null
    let targetClickHandler = null
    let attempts = 0
    let disposed = false

    const unbindTarget = () => {
      if (boundTarget && targetClickHandler) {
        boundTarget.removeEventListener('click', targetClickHandler)
      }
      boundTarget = null
      targetClickHandler = null
    }

    const bindTarget = (target) => {
      if (boundTarget === target) return
      unbindTarget()
      boundTarget = target

      if (step.interactive && target) {
        targetClickHandler = () => {
          if (safeIndex === STEPS.length - 1) finish()
          else go(safeIndex + 1)
        }
        target.addEventListener('click', targetClickHandler, { once: true })
      }
    }

    const measure = () => {
      if (disposed) return
      const target = findVisibleTourTarget(step.target)

      if (target) {
        const nextRect = target.getBoundingClientRect()
        setRect({
          left: nextRect.left,
          top: nextRect.top,
          right: nextRect.right,
          bottom: nextRect.bottom,
          width: nextRect.width,
          height: nextRect.height,
        })
        bindTarget(target)
        attempts = 0
        return
      }

      setRect(null)
      unbindTarget()
      attempts += 1
      if (attempts < 12) retryTimer = window.setTimeout(measure, 100)
    }

    // Clear the previous step's spotlight while the next route is rendering.
    setRect(null)
    retryTimer = window.setTimeout(measure, 80)

    const handleViewportChange = () => measure()
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      disposed = true
      if (retryTimer) window.clearTimeout(retryTimer)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
      unbindTarget()
    }
  }, [active, finish, go, location.pathname, safeIndex, step.interactive, step.target])

  // Keep every hook above this return so completing/skipping the tour can never
  // change the component's hook count between renders.
  if (!active) return null

  const pad = 8
  const hole = rect ? {
    left: Math.max(0, rect.left - pad),
    top: Math.max(0, rect.top - pad),
    right: Math.min(window.innerWidth, rect.right + pad),
    bottom: Math.min(window.innerHeight, rect.bottom + pad),
  } : null

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none" aria-live="polite">
      {!hole ? (
        <div className="absolute inset-0 bg-slate-950/55" />
      ) : (
        <>
          <div className="absolute left-0 right-0 top-0 bg-slate-950/55" style={{ height: hole.top }} />
          <div className="absolute left-0 bg-slate-950/55" style={{ top: hole.top, width: hole.left, height: Math.max(0, hole.bottom - hole.top) }} />
          <div className="absolute right-0 bg-slate-950/55" style={{ top: hole.top, left: hole.right, height: Math.max(0, hole.bottom - hole.top) }} />
          <div className="absolute bottom-0 left-0 right-0 bg-slate-950/55" style={{ top: hole.bottom }} />
          <div
            className="absolute rounded-2xl ring-4 ring-emerald-400 pointer-events-none"
            style={{ left: hole.left, top: hole.top, width: hole.right - hole.left, height: hole.bottom - hole.top }}
          />
        </>
      )}

      <div className="absolute bottom-20 left-1/2 w-[calc(100%-1.5rem)] max-w-md max-h-[calc(100vh-7rem)] -translate-x-1/2 overflow-y-auto rounded-3xl border border-white/20 bg-white p-5 shadow-2xl pointer-events-auto sm:p-6 lg:bottom-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 sm:h-11 sm:w-11">
            <Icon className="text-xl" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 sm:text-xs">Quick Tour · {safeIndex + 1} of {STEPS.length}</p>
            <h2 className="mt-1 text-base font-black text-slate-900 sm:text-lg">{step.title}</h2>
            <p className="mt-2 text-sm leading-5 text-slate-600 sm:leading-6">{step.body}</p>
            {step.interactive && hole && (
              <p className="mt-2 text-xs font-bold text-emerald-700">Click the highlighted control to continue.</p>
            )}
            {step.interactive && !hole && (
              <p className="mt-2 text-xs font-bold text-amber-700">The highlighted control is loading. You can also continue manually.</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 sm:mt-6">
          <button onClick={finish} className="text-sm font-semibold text-slate-400 hover:text-slate-600">Skip Tour</button>
          <div className="flex gap-2">
            {safeIndex > 0 && (
              <button onClick={() => go(safeIndex - 1)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 sm:px-4">Previous</button>
            )}
            {(!step.interactive || !hole) && (
              <button
                onClick={() => safeIndex === STEPS.length - 1 ? finish() : go(safeIndex + 1)}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white sm:px-5"
              >
                {safeIndex === STEPS.length - 1 ? 'Finish' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PatientOnboardingTour

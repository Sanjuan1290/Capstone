import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { MdBusiness, MdKeyboardArrowDown } from 'react-icons/md'
import { fetchJson } from '../../pages/superAdminPage/redesign/shared'
import useClinicRefresh from '../../hooks/useClinicRefresh'

export default function SuperAdminBranchNavigation() {
  const { pathname } = useLocation()
  const active = pathname.startsWith('/superadmin/branches')
  const [expanded, setExpanded] = useState(active)
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)
  const panelId = useId()
  const cancelPending = useCallback(() => { request.current++ }, [])
  const load = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    setError('')
    try {
      const rows = await fetchJson('/')
      if (!Array.isArray(rows)) throw new Error('Clinic branches could not be loaded.')
      if (id === request.current) setBranches(rows.filter(branch => Number(branch.is_active) === 1))
    } catch (err) {
      if (id === request.current) setError(err.message || 'Clinic branches could not be loaded.')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    if (expanded) void load()
    return cancelPending
  }, [expanded, load, cancelPending])
  useClinicRefresh(load, ['*'], { skip: () => !expanded })
  const linkClass = ({ isActive }) => `block rounded-lg px-3 py-2.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none ${isActive ? 'bg-amber-500/15 text-amber-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`
  return <>
    <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors motion-reduce:transition-none ${active || expanded ? 'bg-amber-500/15 text-amber-400' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
      <MdBusiness size={18} aria-hidden="true" />
      <span className="flex-1">Clinic Branches</span>
      <MdKeyboardArrowDown size={20} aria-hidden="true" className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
    </button>
    <div id={panelId} role="region" aria-label="Clinic branch shortcuts" aria-hidden={!expanded} inert={!expanded} className="grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: expanded ? '1fr' : '0fr', opacity: expanded ? 1 : 0 }}>
      <div className="min-h-0 overflow-hidden">
        <div className="mb-2 ml-5 space-y-1 border-l border-white/15 pl-3">
          <NavLink to="/superadmin/branches" end className={linkClass}>All Branches</NavLink>
          {loading ? <p role="status" className="px-3 py-2 text-xs text-slate-400">Loading branches…</p> : error ? <div role="alert" className="px-3 py-2 text-xs text-rose-200"><p>{error}</p><button type="button" className="mt-2 min-h-9 font-semibold underline" onClick={load}>Try Again</button></div> : branches.length ? branches.map(branch => <NavLink key={branch.id} to={`/superadmin/branches/${branch.id}`} className={linkClass}><span className="block break-words">{branch.name}</span></NavLink>) : <p className="px-3 py-2 text-xs text-slate-400">No active clinic branches.</p>}
        </div>
      </div>
    </div>
  </>
}

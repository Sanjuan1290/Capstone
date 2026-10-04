import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdHistory, MdSearch, MdVisibility, MdCalendarToday, MdPerson } from 'react-icons/md'
import { getAppointments } from '../../services/doctor.service'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import { LoadingState, ErrorState } from '../../components/ui/PageState'

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const Doctor_ConsultationHistory = () => {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAppointments({ scope: 'history' })
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Could not load past consultations.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [load])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => [
      row.patient_name,
      row.requested_service_name_snapshot,
      row.reason,
      row.clinic_type,
      row.consultation_status,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)))
  }, [rows, query])

  const pagination = useClientPagination(filtered, { initialPageSize: 12, resetDeps: [query] })

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdHistory className="text-violet-500" /> Past Consultations</h1>
        <p className="mt-1 text-sm text-slate-500">Review patients you already consulted and open their finalized clinical records.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Search Past Consultations</span>
          <div className="relative">
            <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-control pl-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patient, service, reason or clinic..." />
          </div>
        </label>
        <p className="mt-3 text-xs font-semibold text-slate-500">{filtered.length} completed consultation{filtered.length === 1 ? '' : 's'}</p>
      </div>

      {loading ? <LoadingState label="Loading past consultations..." /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          <div className="space-y-3">
            {pagination.pageItems.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No completed consultations found.</div>
            ) : pagination.pageItems.map((row) => (
              <div key={row.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-black text-slate-900">{row.patient_name || row.patient || 'Patient'}</h2>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">Completed</span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${String(row.consultation_status || '').toLowerCase() === 'finalized' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        Record {row.consultation_status || 'Available'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                      <p className="flex items-center gap-2"><MdCalendarToday className="text-slate-400" /> {formatDate(row.appointment_date)} · {row.appointment_time || row.time || '—'}</p>
                      <p className="flex items-center gap-2"><MdPerson className="text-slate-400" /> {row.patient_age !== null && row.patient_age !== undefined ? `${row.patient_age} yrs` : 'Age not recorded'}{row.patient_sex ? ` · ${row.patient_sex}` : ''}</p>
                      <p><span className="font-bold text-slate-700">Service:</span> {row.requested_service_name_snapshot || 'Consultation'}</p>
                      <p><span className="font-bold text-slate-700">Clinic:</span> {row.clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
                    </div>
                    {row.reason && <p className="mt-2 text-xs text-slate-500"><strong>Reason:</strong> {row.reason}</p>}
                  </div>
                  <button
                    type="button"
                    className="button-primary shrink-0 justify-center"
                    onClick={() => navigate(`/doctor/consultation?id=${row.id}`)}
                    disabled={!row.consultation_id}
                  >
                    <MdVisibility /> View Consultation Record
                  </button>
                </div>
              </div>
            ))}
          </div>
          {filtered.length > 0 && <Pagination {...pagination} total={filtered.length} pageSizeOptions={[12, 24, 48]} />}
        </>
      )}
    </div>
  )
}

export default Doctor_ConsultationHistory

import { useEffect, useState } from 'react'
import { MdMedicalServices, MdPeople, MdRefresh } from 'react-icons/md'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'

const Staff_AccountsView = () => {
  const [data, setData] = useState({ staff: [], doctors: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/staff/admin-access/accounts', { credentials: 'include' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'Could not load account directory.')
      setData(body)
    } catch (err) { setError(err.message || 'Could not load account directory.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  if (loading) return <LoadingState label="Loading account directory..." />
  if (error) return <ErrorState message={error} onRetry={load} />
  const Section = ({ title, Icon, rows, doctor = false }) => (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 p-5"><Icon className="text-amber-500" /><h2 className="font-black text-slate-900">{title}</h2><span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{rows.length}</span></div>
      {!rows.length ? <div className="p-5"><EmptyState title={`No ${title.toLowerCase()} found`} /></div> : <div className="divide-y divide-slate-100">{rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="font-bold text-slate-900">{row.full_name}</p><p className="mt-1 text-sm text-slate-500">{row.email} · {row.phone || 'No phone'}</p>{doctor && <p className="mt-1 text-xs font-semibold text-slate-400">{row.specialty || 'Specialty not specified'} · {row.clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>}</div><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${(doctor ? Number(row.is_active) === 1 : row.status === 'active') ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>{(doctor ? Number(row.is_active) === 1 : row.status === 'active') ? 'Active' : 'Inactive'}</span></div>)}</div>}
    </section>
  )
  return <div className="mx-auto max-w-7xl space-y-5"><div className="flex items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdPeople className="text-amber-500" /> Accounts</h1><p className="mt-1 text-sm text-slate-500">Read-only Staff and Doctor account directory. Creating accounts and changing permissions remain Administrator-only.</p></div><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div><div className="grid gap-5 xl:grid-cols-2"><Section title="Staff Accounts" Icon={MdPeople} rows={data.staff || []} /><Section title="Doctor Accounts" Icon={MdMedicalServices} rows={data.doctors || []} doctor /></div></div>
}
export default Staff_AccountsView

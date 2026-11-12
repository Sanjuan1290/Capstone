import { useCallback, useEffect, useState } from 'react'
import {
  MdPeople, MdPersonSearch, MdRefresh, MdVisibility, MdPhone, MdEmail,
  MdLocationOn, MdWc, MdHistory, MdBlock, MdCheckCircle, MdChevronLeft,
  MdChevronRight, MdCalendarMonth, MdWarningAmber,
} from 'react-icons/md'
import {
  PageHead, Card, StatCard, Pill, Banner, Empty, Loading, Modal,
  SearchInput, SecondaryButton, whole,
} from './shared'

const API_ROOT = '/api/superadmin/patients'

async function requestJson(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      credentials: 'include',
      cache: 'no-store',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Cannot connect to the clinic server. Check your connection and try again.')
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    if (response.status === 401) throw new Error('Your Super Admin session has expired. Sign in again to continue.')
    if (response.status === 403) throw new Error('Super Admin access is required to view patients.')
    throw new Error('The server returned an unexpected response. Check the backend API and try again.')
  }

  let data
  try { data = await response.json() } catch { throw new Error('The server sent an incomplete response. Please retry.') }
  if (!response.ok) {
    const reference = response.status >= 500 && data?.request_id ? ` (Reference: ${data.request_id})` : ''
    const error = new Error(`${data?.message || `Request failed (${response.status}).`}${reference}`)
    error.status = response.status
    error.code = data?.code
    throw error
  }
  return data
}

const displayValue = (value) => value === null || value === undefined || String(value).trim() === '' ? 'Not provided' : String(value)
const displayDate = (value) => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const displayTime = (value) => value ? String(value).slice(0, 5) : '—'
const statusLabel = (value) => ({
  no_show: 'Did Not Arrive',
  in_progress: 'In Progress',
  'in-progress': 'In Progress',
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  rescheduled: 'Rescheduled',
}[String(value || '').toLowerCase()] || String(value || 'Unknown').replaceAll('_', ' '))
const statusTone = (value) => ({
  completed: 'success', confirmed: 'info', pending: 'warning',
  no_show: 'danger', cancelled: 'neutral', rejected: 'neutral',
  rescheduled: 'info', 'in-progress': 'info', in_progress: 'info',
}[String(value || '').toLowerCase()] || 'neutral')

export default function SuperAdminPatients() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [refreshKey, setRefreshKey] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [selectedPatientId, setSelectedPatientId] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const [banConfirmation, setBanConfirmation] = useState(false)
  const [banSaving, setBanSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        search: search.trim(), status, page: String(page), page_size: String(pageSize),
      })
      const result = await requestJson(`?${params.toString()}`)
      setData(result)
      if (page > Number(result.pagination?.total_pages || 1)) setPage(Number(result.pagination?.total_pages || 1))
    } catch (loadError) {
      setError(loadError.message || 'Unable to load patients.')
    } finally {
      setLoading(false)
    }
  }, [search, status, page, pageSize])

  useEffect(() => {
    const timer = window.setTimeout(loadList, search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [loadList, refreshKey, search])

  useEffect(() => {
    if (!detailOpen || !selectedPatientId) return undefined
    let active = true
    const run = async () => {
      setDetailLoading(true)
      setDetailError('')
      try {
        const params = new URLSearchParams({ history_page: String(historyPage), history_page_size: '10' })
        const result = await requestJson(`/${selectedPatientId}?${params.toString()}`)
        if (active) setDetail(result)
      } catch (loadError) {
        if (active) setDetailError(loadError.message || 'Unable to load patient details.')
      } finally {
        if (active) setDetailLoading(false)
      }
    }
    run()
    return () => { active = false }
  }, [detailOpen, selectedPatientId, historyPage, detailRefreshKey])

  const openDetails = (patientId) => {
    setSelectedPatientId(patientId)
    setHistoryPage(1)
    setDetail(null)
    setDetailError('')
    setBanConfirmation(false)
    setDetailOpen(true)
  }

  const closeDetails = () => {
    if (banSaving) return
    setDetailOpen(false)
    setSelectedPatientId(null)
    setDetail(null)
    setBanConfirmation(false)
  }

  const updateBanStatus = async () => {
    if (!detail?.patient || banSaving) return
    const nextBanned = !Number(detail.patient.is_banned)
    setBanSaving(true)
    setDetailError('')
    setNotice('')
    try {
      const result = await requestJson(`/${detail.patient.id}/ban`, {
        method: 'PATCH',
        body: JSON.stringify({ banned: nextBanned }),
      })
      setNotice(result.message || (nextBanned ? 'Patient account banned.' : 'Patient account unbanned.'))
      setBanConfirmation(false)
      setDetailRefreshKey((value) => value + 1)
      setRefreshKey((value) => value + 1)
    } catch (banError) {
      setDetailError(banError.message || 'Unable to update patient account status.')
    } finally {
      setBanSaving(false)
    }
  }

  const summary = data?.summary || {}
  const pagination = data?.pagination || { page: 1, page_size: pageSize, total: 0, total_pages: 1 }
  const patient = detail?.patient
  const history = detail?.history || { items: [], page: 1, page_size: 10, total: 0, total_pages: 1 }
  const isBanned = Boolean(Number(patient?.is_banned))
  const isGuest = patient?.account_type === 'guest'

  return (
    <div className="space-y-6">
      <PageHead
        title="Patient Directory"
        description="View registered and guest patients across all clinic branches, review appointment attendance and manage registered account access."
        action={<SecondaryButton onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><MdRefresh /> Refresh</SecondaryButton>}
      />

      {notice && <Banner type="success" title="Account status updated" onDismiss={() => setNotice('')}>{notice}</Banner>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Registered Patients" value={whole(summary.total_registered)} icon={MdPeople} helper="Patient portal accounts" />
        <StatCard label="Guest Patients" value={whole(summary.total_guests)} icon={MdPersonSearch} helper="Booked without an account" />
        <StatCard label="Active Accounts" value={whole(summary.active_accounts)} icon={MdCheckCircle} helper="Can sign in" />
        <StatCard label="Banned Accounts" value={whole(summary.banned_accounts)} icon={MdBlock} helper="Sign-in blocked" />
        <StatCard label="Total No-Shows" value={whole(summary.total_no_shows)} icon={MdCalendarMonth} helper="Across registered and guest patients" />
      </div>

      <Card title="Registered & Guest Patients" description="Search by full name, email address or mobile number. Select View More to see patient details and appointment history.">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_140px]">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search name, email or contact number..." />
          <select aria-label="Filter patient accounts by status" className="form-control" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
            <option value="all">All Patients</option>
            <option value="registered">Registered Patients</option>
            <option value="guest">Guest Patients</option>
            <option value="active">Active Accounts</option>
            <option value="banned">Banned Accounts</option>
          </select>
          <select aria-label="Rows per page" className="form-control" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{loading ? 'Loading patients…' : `${whole(pagination.total)} patient${Number(pagination.total) === 1 ? '' : 's'} found`}</span>
          <span>Patient details and appointment history are visible to Super Admin only.</span>
        </div>

        {error && <div className="mt-4"><Banner onRetry={() => setRefreshKey((value) => value + 1)}>{error}</Banner></div>}
        {loading && !data ? <div className="mt-4"><Loading cards={4} /></div> : !error && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                {['Patient','Mobile Number','Email Address','No-Show','Account Status','Action'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}
              </tr></thead>
              <tbody>
                {(data?.items || []).map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    <td className="px-4 py-4"><p className="font-semibold text-slate-900">{row.full_name}</p><p className="mt-1 text-xs text-slate-500">{row.account_type === 'guest' ? 'Guest patient' : 'Registered patient'} · Added {displayDate(row.created_at)}</p></td>
                    <td className="px-4 py-4 text-slate-700">{displayValue(row.phone)}</td>
                    <td className="px-4 py-4 text-slate-700">{displayValue(row.email)}</td>
                    <td className="px-4 py-4"><Pill tone={Number(row.no_show_count) > 0 ? 'warning' : 'neutral'}>{whole(row.no_show_count || 0)}</Pill></td>
                    <td className="px-4 py-4"><Pill tone={row.account_type === 'guest' ? 'info' : Number(row.is_banned) ? 'danger' : 'success'}>{row.account_type === 'guest' ? 'Guest' : Number(row.is_banned) ? 'Banned' : 'Active'}</Pill></td>
                    <td className="px-4 py-4"><SecondaryButton onClick={() => openDetails(row.id)}><MdVisibility /> View More</SecondaryButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && (data?.items || []).length === 0 && (
              <Empty icon={MdPersonSearch} title={search || status !== 'all' ? 'No matching patients' : 'No patients yet'} description={search || status !== 'all' ? 'Try another name, email address, mobile number or patient filter.' : 'Registered accounts and guest booking patients will appear here.'} />
            )}
          </div>
        )}

        {data && !error && pagination.total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Page {pagination.page} of {pagination.total_pages} · Showing {(pagination.page - 1) * pagination.page_size + 1}–{Math.min(pagination.page * pagination.page_size, pagination.total)} of {whole(pagination.total)}</p>
            <div className="flex items-center gap-2">
              <SecondaryButton disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><MdChevronLeft /> Previous</SecondaryButton>
              <SecondaryButton disabled={page >= pagination.total_pages || loading} onClick={() => setPage((value) => Math.min(pagination.total_pages, value + 1))}>Next <MdChevronRight /></SecondaryButton>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={detailOpen}
        wide
        title={patient?.full_name || 'Patient Details'}
        description={isGuest ? 'Guest patient information and appointment attendance history.' : 'Registered patient account information and appointment attendance history.'}
        onClose={closeDetails}
      >
        {detailLoading && !detail ? <Loading cards={3} /> : detailError && !detail ? <Banner onRetry={() => setDetailRefreshKey((value) => value + 1)}>{detailError}</Banner> : patient && (
          <div className="space-y-5">
            {detailError && <Banner onRetry={() => setDetailRefreshKey((value) => value + 1)}>{detailError}</Banner>}
            {!isGuest && isBanned && <Banner type="warning" title="This patient account is banned">The patient cannot sign in while this restriction is active. Their appointment and billing history remain unchanged.</Banner>}
            {isGuest && <Banner type="info" title="Guest patient">This patient booked without creating a portal account. Their guest appointment history is shown below.</Banner>}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Mobile Number</p><p className="mt-1 flex items-center gap-2 break-all text-sm font-semibold"><MdPhone className="shrink-0 text-slate-400"/>{displayValue(patient.phone)}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Email Address</p><p className="mt-1 flex items-center gap-2 break-all text-sm font-semibold"><MdEmail className="shrink-0 text-slate-400"/>{displayValue(patient.email)}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Gender</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold"><MdWc className="text-slate-400"/>{displayValue(patient.gender)}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">{isGuest ? 'Guest record added' : 'Registered'}</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold"><MdCalendarMonth className="text-slate-400"/>{displayDate(patient.created_at)}</p></div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Address</p>
              <p className="mt-2 flex items-start gap-2 text-sm text-slate-800"><MdLocationOn className="mt-0.5 shrink-0 text-slate-400"/>{displayValue(patient.address)}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Appointments" value={whole(patient.total_appointments)} icon={MdCalendarMonth}/>
              <StatCard label="Completed Visits" value={whole(patient.completed_appointments)} icon={MdCheckCircle}/>
              <StatCard label="Did Not Arrive" value={whole(patient.no_show_count)} icon={MdWarningAmber} helper="Recorded no-show appointments"/>
            </div>

            {!isGuest && <section className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-bold text-slate-900">Account Access</h3><p className="mt-1 text-xs text-slate-500">Banning blocks patient sign-in and revokes existing sessions. It does not delete records.</p></div>
                <div className="flex items-center gap-3">
                  <Pill tone={isBanned ? 'danger' : 'success'}>{isBanned ? 'Banned' : 'Active'}</Pill>
                  <button type="button" role="switch" aria-checked={isBanned} aria-label={isBanned ? 'Unban patient account' : 'Ban patient account'} onClick={() => setBanConfirmation((value) => !value)} disabled={banSaving} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-50 ${isBanned ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isBanned ? 'translate-x-6' : 'translate-x-1'}`}/>
                  </button>
                </div>
              </div>
              {banConfirmation && (
                <div className={`mt-4 rounded-lg border p-3 ${isBanned ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                  <p className={`text-sm font-semibold ${isBanned ? 'text-emerald-900' : 'text-rose-900'}`}>{isBanned ? 'Unban this patient account?' : 'Ban this patient account?'}</p>
                  <p className={`mt-1 text-xs ${isBanned ? 'text-emerald-800' : 'text-rose-800'}`}>{isBanned ? 'The patient will be able to sign in again. They may need to log in again on their devices.' : 'The patient will be unable to sign in. All existing patient sessions will be revoked. Appointment, billing and medical records will be retained.'}</p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <SecondaryButton disabled={banSaving} onClick={() => setBanConfirmation(false)}>Cancel</SecondaryButton>
                    <button type="button" disabled={banSaving} onClick={updateBanStatus} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${isBanned ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-600 hover:bg-rose-700'}`}>
                      {banSaving ? 'Saving…' : isBanned ? 'Confirm Unban' : 'Confirm Ban'}
                    </button>
                  </div>
                </div>
              )}
            </section>}

            <section>
              <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-bold text-slate-900"><MdHistory/> Appointment History</h3><p className="mt-1 text-xs text-slate-500">{whole(history.total)} recorded appointment{history.total === 1 ? '' : 's'} · Latest first</p></div></div>
              {detailLoading && detail && <p role="status" className="mb-2 text-xs text-slate-500">Updating patient details…</p>}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead><tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">{['Date & Time','Service','Doctor','Branch','Clinic','Status'].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
                  <tbody>{history.items.map((visit) => (
                    <tr key={visit.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3"><p className="font-semibold">{displayDate(visit.appointment_date)}</p><p className="text-xs text-slate-500">{displayTime(visit.appointment_time)}</p></td>
                      <td className="px-3 py-3">{displayValue(visit.service_name)}</td>
                      <td className="px-3 py-3">{displayValue(visit.doctor_name)}</td>
                      <td className="px-3 py-3">{displayValue(visit.branch_name)}</td>
                      <td className="px-3 py-3">{String(visit.clinic_type || '').toLowerCase() === 'derma' ? 'Dermatology' : 'General Medicine'}</td>
                      <td className="px-3 py-3"><Pill tone={statusTone(visit.status)}>{statusLabel(visit.status)}</Pill></td>
                    </tr>
                  ))}</tbody>
                </table>
                {history.items.length === 0 && <Empty icon={MdHistory} title="No appointment history" description="This patient has no recorded appointments yet."/>}
              </div>
              {history.total > 10 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">History page {history.page} of {history.total_pages}</p><div className="flex gap-2"><SecondaryButton disabled={history.page <= 1 || detailLoading} onClick={() => setHistoryPage((value) => Math.max(1, value - 1))}><MdChevronLeft/> Previous</SecondaryButton><SecondaryButton disabled={history.page >= history.total_pages || detailLoading} onClick={() => setHistoryPage((value) => Math.min(history.total_pages, value + 1))}>Next <MdChevronRight/></SecondaryButton></div></div>}
            </section>
          </div>
        )}
      </Modal>
    </div>
  )
}

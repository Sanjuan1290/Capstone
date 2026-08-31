import { useEffect, useMemo, useState } from 'react'
import {
  MdAssessment,
  MdBarChart,
  MdCalendarToday,
  MdChecklist,
  MdGroups,
  MdInventory2,
  MdMedicalServices,
  MdPayments,
  MdPictureAsPdf,
  MdRefresh,
  MdTrendingUp,
  MdWarningAmber,
} from 'react-icons/md'
import { getReports, recordReportExport } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { ErrorState, LoadingState } from '../../components/ui/PageState'

const formatMoney = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2,
}).format(Number(value) || 0)

const formatPercent = (value) => `${Math.round(Number(value) || 0)}%`
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const toDateInput = (date) => {
  const value = date instanceof Date ? date : new Date(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getPresetRange = (preset) => {
  const end = new Date()
  const start = new Date(end)
  if (preset === 'today') return { startDate: toDateInput(end), endDate: toDateInput(end) }
  if (preset === '7days') start.setDate(start.getDate() - 6)
  else if (preset === '30days') start.setDate(start.getDate() - 29)
  else if (preset === '3months') start.setMonth(start.getMonth() - 3)
  else if (preset === 'year') start.setMonth(0, 1)
  else start.setMonth(start.getMonth() - 6)
  return { startDate: toDateInput(start), endDate: toDateInput(end) }
}

const formatRangeLabel = (range) => {
  if (!range?.start_date || !range?.end_date) return 'Selected period'
  const format = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  return `${format(range.start_date)} – ${format(range.end_date)}`
}

const titleCase = (value) => String(value || '')
  .replace(/[_-]/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase())

const StatCard = ({ label, value, helper, icon: Icon, tone = 'border-slate-200 bg-white text-slate-900' }) => (
  <div className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">{label}</p>
        <p className="mt-2 text-2xl font-black">{value}</p>
      </div>
      {Icon && <Icon className="text-xl opacity-70" />}
    </div>
    {helper && <p className="mt-2 text-xs opacity-75">{helper}</p>}
  </div>
)

const Section = ({ title, subtitle, children, action }) => (
  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
)

const Admin_Reports = () => {
  const toast = useToast()
  const initialRange = getPresetRange('6months')
  const [preset, setPreset] = useState('6months')
  const [dateRange, setDateRange] = useState(initialRange)
  const [appliedRange, setAppliedRange] = useState(initialRange)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setData(await getReports(appliedRange))
    } catch (err) {
      const message = 'Unable to load reports right now. Please try again.'
      console.error('Reports load error:', err)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [appliedRange.startDate, appliedRange.endDate])

  const applyPreset = (nextPreset) => {
    const next = getPresetRange(nextPreset)
    setPreset(nextPreset)
    setDateRange(next)
    setAppliedRange(next)
  }

  const applyCustomRange = () => {
    if (!dateRange.startDate || !dateRange.endDate) return toast.warning('Select a start and end date.')
    if (dateRange.startDate > dateRange.endDate) return toast.warning('Start date cannot be after end date.')
    setPreset('custom')
    setAppliedRange({ ...dateRange })
  }

  const report = useMemo(() => {
    const appointmentSummary = data?.appointmentSummary || {}
    const billing = data?.billingSummary || {}
    const inventory = data?.inventoryStats || {}
    const current = data?.currentOperations || {}
    const monthly = Array.isArray(data?.monthly) ? data.monthly : []
    const revenueTrend = Array.isArray(data?.revenueTrend) ? data.revenueTrend : []
    const status = Array.isArray(data?.statusBreakdown) ? data.statusBreakdown : []
    const sources = Array.isArray(data?.appointmentSources) ? data.appointmentSources : []
    const doctors = Array.isArray(data?.topDoctors) ? data.topDoctors : []
    const payments = Array.isArray(data?.paymentsByMethod) ? data.paymentsByMethod : []
    const services = Array.isArray(data?.serviceRevenue) ? data.serviceRevenue : []
    const stockActivity = Array.isArray(data?.stockActivity) ? data.stockActivity : []
    const stockReasons = Array.isArray(data?.stockMovementByReason) ? data.stockMovementByReason : []
    const categories = Array.isArray(data?.inventoryByCategory) ? data.inventoryByCategory : []

    const totalAppointments = Number(appointmentSummary.appointments || 0)
    const completed = Number(appointmentSummary.completed || 0)
    const cancelled = Number(appointmentSummary.cancelled || 0)
    const noShow = Number(appointmentSummary.no_show || 0)
    const completionRate = totalAppointments ? (completed / totalAppointments) * 100 : 0
    const maxAppointments = Math.max(...monthly.map((row) => Number(row.appointments || 0)), 1)
    const maxRevenue = Math.max(...revenueTrend.map((row) => Number(row.revenue || 0)), 1)

    return {
      appointmentSummary, billing, inventory, current, monthly, revenueTrend, status, sources,
      doctors, payments, services, stockActivity, stockReasons, categories,
      totalAppointments, completed, cancelled, noShow, completionRate, maxAppointments, maxRevenue,
    }
  }, [data])

  const rangeLabel = formatRangeLabel(data?.range)

  const handleExportPdf = () => {
    if (!data) return
    recordReportExport({ start_date: data?.range?.start_date, end_date: data?.range?.end_date }).catch(() => {})
    const clinic = data.clinicSettings || {}
    const generatedAt = new Date().toLocaleString('en-PH')
    const doctorRows = report.doctors.map((doctor) => {
      const completion = Number(doctor.appointments || 0)
        ? Math.round((Number(doctor.completed || 0) / Number(doctor.appointments || 1)) * 100)
        : 0
      return `<tr><td>${escapeHtml(doctor.name)}</td><td>${escapeHtml(doctor.specialty || '')}</td><td>${escapeHtml(doctor.appointments || 0)}</td><td>${escapeHtml(doctor.patients || 0)}</td><td>${escapeHtml(doctor.completed || 0)}</td><td>${completion}%</td></tr>`
    }).join('')
    const serviceRows = report.services.map((row) => `<tr><td>${escapeHtml(row.service_name)}</td><td>${escapeHtml(row.bills)}</td><td>${escapeHtml(row.quantity)}</td><td>${escapeHtml(formatMoney(row.gross_billed_amount))}</td></tr>`).join('')
    const paymentRows = report.payments.map((row) => `<tr><td>${escapeHtml(titleCase(row.payment_method))}</td><td>${escapeHtml(row.transactions)}</td><td>${escapeHtml(formatMoney(row.amount))}</td></tr>`).join('')
    const sourceRows = report.sources.map((row) => `<tr><td>${escapeHtml(titleCase(row.source))}</td><td>${escapeHtml(row.value)}</td></tr>`).join('')
    const inventoryRows = report.stockReasons.map((row) => `<tr><td>${escapeHtml(titleCase(row.movement_type))}</td><td>${escapeHtml(row.actions)}</td><td>${escapeHtml(row.quantity)}</td></tr>`).join('')
    const monthlyRows = report.monthly.map((row) => `<tr><td>${escapeHtml(row.month)}</td><td>${escapeHtml(row.appointments)}</td><td>${escapeHtml(row.medical || 0)}</td><td>${escapeHtml(row.derma || 0)}</td><td>${escapeHtml(row.patients)}</td></tr>`).join('')
    const revenueRows = report.revenueTrend.map((row) => `<tr><td>${escapeHtml(row.month)}</td><td>${escapeHtml(row.transactions)}</td><td>${escapeHtml(formatMoney(row.revenue))}</td></tr>`).join('')

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Clinic Report</title><style>
      @page { size: A4; margin: 13mm 12mm 17mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; color: #0f172a; font-size: 10.5px; padding-bottom: 12mm; }
      header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
      h1 { margin: 0; font-size: 18px; text-transform: uppercase; } h2 { margin: 16px 0 7px; font-size: 12px; page-break-after: avoid; }
      p { margin: 3px 0; color: #475569; } .meta { display:flex; justify-content:space-between; gap:12px; }
      .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin:10px 0; }
      .card { border:1px solid #cbd5e1; border-radius:7px; padding:7px; } .label { font-size:7.5px; text-transform:uppercase; color:#64748b; }
      .value { margin-top:4px; font-size:13px; font-weight:700; } table { width:100%; border-collapse:collapse; margin-top:5px; page-break-inside:auto; }
      thead { display:table-header-group; } tr { page-break-inside:avoid; } th,td { border:1px solid #cbd5e1; padding:5px; vertical-align:top; }
      th { background:#f1f5f9; font-size:8px; text-transform:uppercase; text-align:left; } .note { background:#f8fafc; border:1px solid #e2e8f0; padding:7px; border-radius:7px; }
      footer { position:fixed; bottom:-11mm; left:0; right:0; text-align:center; color:#64748b; font-size:7.5px; }
    </style></head><body>
      <header><h1>${escapeHtml(clinic.clinic_name || 'CARAIT MEDICAL AND DERMATOLOGY CLINIC')}</h1><p>${escapeHtml(clinic.address || '')}</p><div class="meta"><p><strong>Reports & Analytics</strong><br>Period: ${escapeHtml(rangeLabel)}</p><p>Generated: ${escapeHtml(generatedAt)}<br>Generated by: Administrator</p></div></header>
      <h2>1. Executive Summary</h2><div class="cards">
        <div class="card"><div class="label">Appointments</div><div class="value">${report.totalAppointments}</div></div>
        <div class="card"><div class="label">Unique Patients</div><div class="value">${Number(report.appointmentSummary.unique_patients || 0)}</div></div>
        <div class="card"><div class="label">Net Collections</div><div class="value">${escapeHtml(formatMoney(report.billing.net_collected))}</div></div>
        <div class="card"><div class="label">Outstanding Now</div><div class="value">${escapeHtml(formatMoney(report.billing.outstanding))}</div></div>
      </div>
      <h2>2. Financial Summary</h2><table><tbody>
        <tr><th>Gross Billed</th><td>${escapeHtml(formatMoney(report.billing.gross_billed))}</td><th>Discounts</th><td>${escapeHtml(formatMoney(report.billing.discounts))}</td></tr>
        <tr><th>Net Billed</th><td>${escapeHtml(formatMoney(report.billing.net_billed))}</td><th>Collections</th><td>${escapeHtml(formatMoney(report.billing.collected))}</td></tr>
        <tr><th>Refunded</th><td>${escapeHtml(formatMoney(report.billing.refunded))}</td><th>Net Collections</th><td>${escapeHtml(formatMoney(report.billing.net_collected))}</td></tr>
        <tr><th>Outstanding Now</th><td>${escapeHtml(formatMoney(report.billing.outstanding))}</td><th>Voided Bills</th><td>${escapeHtml(report.billing.voided_bills || 0)}</td></tr>
      </tbody></table>
      <h2>3. Collection Trend</h2><table><thead><tr><th>Month</th><th>Transactions</th><th>Net Collection</th></tr></thead><tbody>${revenueRows || '<tr><td colspan="3">No collections.</td></tr>'}</tbody></table>
      <h2>4. Appointment Summary</h2><table><thead><tr><th>Month</th><th>Appointments</th><th>Medical</th><th>Dermatology</th><th>Patients</th></tr></thead><tbody>${monthlyRows || '<tr><td colspan="5">No appointments.</td></tr>'}</tbody></table>
      <h2>Appointment Source</h2><table><thead><tr><th>Source</th><th>Visits</th></tr></thead><tbody>${sourceRows || '<tr><td colspan="2">No data.</td></tr>'}</tbody></table>
      <h2>5. Doctor Activity</h2><table><thead><tr><th>Doctor</th><th>Specialty</th><th>Appointments</th><th>Unique Patients</th><th>Completed</th><th>Completion</th></tr></thead><tbody>${doctorRows || '<tr><td colspan="6">No doctor activity.</td></tr>'}</tbody></table>
      <h2>6. Billing Detail</h2><table><thead><tr><th>Payment Method</th><th>Transactions</th><th>Collected</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="3">No payments.</td></tr>'}</tbody></table>
      <h2>Top Services by Gross Billed Amount</h2><table><thead><tr><th>Service</th><th>Bills</th><th>Qty</th><th>Gross Billed</th></tr></thead><tbody>${serviceRows || '<tr><td colspan="4">No billed services.</td></tr>'}</tbody></table>
      <h2>7. Inventory Movement</h2><table><thead><tr><th>Movement</th><th>Actions</th><th>Quantity</th></tr></thead><tbody>${inventoryRows || '<tr><td colspan="3">No stock movement.</td></tr>'}</tbody></table>
      <p class="note"><strong>Current inventory snapshot:</strong> ${report.inventory.total_items || 0} items · ${report.inventory.out_of_stock || 0} out of stock · ${report.inventory.low_stock || 0} low stock · ${report.inventory.expired || 0} expired · ${report.inventory.expiring_soon || 0} expiring within 30 days. Current values are not historical balances for the selected period.</p>
      <footer>${escapeHtml(clinic.report_footer || clinic.clinic_name || 'CARAIT MEDICAL AND DERMATOLOGY CLINIC')} · ${escapeHtml(rangeLabel)}</footer>
    </body></html>`

    const frame = document.createElement('iframe')
    frame.title = 'Printable clinic report'
    frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;'
    document.body.appendChild(frame)
    const cleanup = () => { if (frame.parentNode) frame.remove() }
    frame.onload = () => {
      const win = frame.contentWindow
      if (!win) return cleanup()
      win.addEventListener('afterprint', cleanup, { once: true })
      win.focus()
      win.print()
      window.setTimeout(cleanup, 10000)
    }
    frame.srcdoc = html
    toast.info('Print dialog opened. Choose “Save as PDF” to save the report.')
  }

  if (loading) return <LoadingState label="Loading reports and analytics..." />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdAssessment className="text-sky-500" /> Reports & Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Financial and clinic activity for the selected period, with a separate current operational snapshot.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="button-secondary"><MdRefresh /> Refresh</button>
          <button onClick={handleExportPdf} className="button-secondary"><MdPictureAsPdf className="text-rose-500" /> Print / Save PDF</button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            ['today', 'Today'], ['7days', '7 Days'], ['30days', '30 Days'], ['3months', '3 Months'], ['6months', '6 Months'], ['year', 'This Year'],
          ].map(([value, label]) => (
            <button key={value} onClick={() => applyPreset(value)} className={`rounded-xl px-3 py-2 text-xs font-bold ${preset === value ? 'bg-[#0b1a2c] text-sky-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label><span className="form-label">Start Date</span><input type="date" className="form-control mt-1.5" value={dateRange.startDate} onChange={(e) => setDateRange((current) => ({ ...current, startDate: e.target.value }))} /></label>
          <label><span className="form-label">End Date</span><input type="date" className="form-control mt-1.5" value={dateRange.endDate} onChange={(e) => setDateRange((current) => ({ ...current, endDate: e.target.value }))} /></label>
          <button onClick={applyCustomRange} className="button-primary">Apply Range</button>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">Selected period: {rangeLabel}</p>
      </section>

      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">Selected Period · Financial</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Gross Billed" value={formatMoney(report.billing.gross_billed)} helper={`${report.billing.paid_bills || 0} paid · ${report.billing.partially_paid_bills || 0} partial`} icon={MdPayments} tone="border-sky-200 bg-sky-50 text-sky-800" />
          <StatCard label="Net Billed" value={formatMoney(report.billing.net_billed)} helper={`${formatMoney(report.billing.discounts)} discounts`} icon={MdChecklist} tone="border-violet-200 bg-violet-50 text-violet-800" />
          <StatCard label="Net Collections" value={formatMoney(report.billing.net_collected)} helper={`${formatMoney(report.billing.refunded)} refunded`} icon={MdTrendingUp} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
          <StatCard label="Outstanding Now" value={formatMoney(report.billing.outstanding)} helper="Current unpaid balance across open bills" icon={MdWarningAmber} tone="border-amber-200 bg-amber-50 text-amber-800" />
        </div>
      </div>

      <Section title="Collection Trend" subtitle="Payments are grouped by payment date; refunds are subtracted from collections.">
        {report.revenueTrend.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No collection data for this period.</p> : (
          <div className="flex h-64 items-end gap-3 overflow-x-auto pb-2">
            {report.revenueTrend.map((row) => (
              <div key={row.ym} className="flex min-w-[74px] flex-1 flex-col items-center gap-2">
                <p className="text-[10px] font-bold text-slate-600">{formatMoney(row.revenue)}</p>
                <div className="flex h-44 w-full items-end rounded-t-xl bg-slate-50 px-2">
                  <div className="w-full rounded-t-lg bg-emerald-500" style={{ height: `${Math.max(3, (Number(row.revenue || 0) / report.maxRevenue) * 100)}%` }} />
                </div>
                <p className="text-[10px] font-semibold text-slate-500">{row.month}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">Selected Period · Clinic Operations</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Appointments" value={report.totalAppointments} helper={`${report.appointmentSummary.unique_patients || 0} unique patients`} icon={MdCalendarToday} />
          <StatCard label="Completion Rate" value={formatPercent(report.completionRate)} helper={`${report.completed} completed`} icon={MdChecklist} />
          <StatCard label="Cancelled / No-show" value={report.cancelled + report.noShow} helper={`${report.cancelled} cancelled · ${report.noShow} no-show`} icon={MdWarningAmber} />
          <StatCard label="Patient Mix" value={`${report.appointmentSummary.new_patients || 0} new`} helper={`${report.appointmentSummary.returning_patients || 0} returning`} icon={MdGroups} />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Monthly Appointments" subtitle="Medical and dermatology visits during the selected period.">
          {report.monthly.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No appointment data.</p> : (
            <div className="flex h-56 items-end gap-2 overflow-x-auto pb-2">
              {report.monthly.map((row) => (
                <div key={row.ym} className="flex min-w-[62px] flex-1 flex-col items-center gap-1">
                  <p className="text-[10px] font-bold text-slate-600">{row.appointments}</p>
                  <div className="flex h-40 w-full flex-col justify-end overflow-hidden rounded-t-lg bg-slate-50">
                    <div className="w-full bg-emerald-400" style={{ height: `${(Number(row.derma || 0) / report.maxAppointments) * 100}%` }} />
                    <div className="w-full bg-sky-500" style={{ height: `${(Number(row.medical || 0) / report.maxAppointments) * 100}%` }} />
                  </div>
                  <p className="text-[10px] font-semibold text-slate-500">{row.month}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Appointment Source" subtitle="Where each visit originated.">
          <div className="space-y-3">
            {report.sources.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No source data.</p> : report.sources.map((row) => (
              <div key={row.source} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-semibold text-slate-700">{titleCase(row.source)}</span>
                <span className="text-lg font-black text-slate-900">{row.value}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Doctor Activity" subtitle="Completion rate is completed appointments ÷ all appointments for that doctor.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400"><tr><th className="px-3 py-3">Doctor</th><th className="px-3 py-3">Specialty</th><th className="px-3 py-3 text-right">Appointments</th><th className="px-3 py-3 text-right">Patients</th><th className="px-3 py-3 text-right">Completed</th><th className="px-3 py-3 text-right">Completion</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{report.doctors.map((doctor) => {
              const rate = Number(doctor.appointments || 0) ? (Number(doctor.completed || 0) / Number(doctor.appointments || 1)) * 100 : 0
              return <tr key={doctor.name}><td className="px-3 py-3 font-bold text-slate-800">{doctor.name}</td><td className="px-3 py-3 text-slate-500">{doctor.specialty}</td><td className="px-3 py-3 text-right">{doctor.appointments}</td><td className="px-3 py-3 text-right">{doctor.patients}</td><td className="px-3 py-3 text-right">{doctor.completed}</td><td className="px-3 py-3 text-right font-bold">{formatPercent(rate)}</td></tr>
            })}</tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Payments by Method" subtitle="Completed payments minus refunds in the selected period.">
          <div className="space-y-3">{report.payments.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No payments.</p> : report.payments.map((row) => <div key={row.payment_method} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><div><p className="text-sm font-bold text-slate-800">{titleCase(row.payment_method)}</p><p className="text-xs text-slate-400">{row.transactions} transactions</p></div><p className="font-black text-emerald-700">{formatMoney(row.amount)}</p></div>)}</div>
        </Section>
        <Section title="Top Services by Gross Billed Amount" subtitle="Before bill-level discounts; historical bill price snapshots are preserved.">
          <div className="space-y-3">{report.services.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No billed services.</p> : report.services.map((row) => <div key={row.service_name} className="rounded-2xl bg-slate-50 px-4 py-3"><div className="flex justify-between gap-3"><p className="text-sm font-bold text-slate-800">{row.service_name}</p><p className="font-black text-slate-900">{formatMoney(row.gross_billed_amount)}</p></div><p className="mt-1 text-xs text-slate-400">{row.bills} bills · {row.quantity} units</p></div>)}</div>
        </Section>
      </div>

      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">Current Snapshot · Not Historical</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Today Remaining" value={report.current.today_remaining || 0} icon={MdCalendarToday} />
          <StatCard label="Future Scheduled" value={report.current.future_confirmed || 0} icon={MdCalendarToday} />
          <StatCard label="Awaiting Approval" value={report.current.awaiting_approval || 0} icon={MdChecklist} />
          <StatCard label="Walk-in Queue" value={report.current.walkin_queue || 0} icon={MdGroups} />
          <StatCard label="Pending Transfers" value={report.current.pending_supply_requests || 0} icon={MdInventory2} />
        </div>
      </div>

      <Section title="Current Inventory Health" subtitle="Current stock snapshot. Batch expiry is tracked separately; this section does not pretend to be the inventory balance for the selected historical period.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Inventory Value" value={formatMoney(report.inventory.total_value)} helper={`${report.inventory.total_items || 0} items`} icon={MdInventory2} />
          <StatCard label="Out of Stock" value={report.inventory.out_of_stock || 0} tone="border-rose-200 bg-rose-50 text-rose-800" />
          <StatCard label="Low Stock" value={report.inventory.low_stock || 0} tone="border-amber-200 bg-amber-50 text-amber-800" />
          <StatCard label="Expired" value={report.inventory.expired || 0} tone="border-red-200 bg-red-50 text-red-800" />
          <StatCard label="Expiring in 30 Days" value={report.inventory.expiring_soon || 0} tone="border-violet-200 bg-violet-50 text-violet-800" />
        </div>
      </Section>

      <Section title="Inventory Movement by Reason" subtitle="Transfers are movement between locations; clinical use/dispensing/wastage are true consumption. Batch details remain available in Inventory Activity.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{report.stockReasons.length === 0 ? <p className="text-sm text-slate-400">No inventory movements for this period.</p> : report.stockReasons.map((row) => <div key={row.movement_type} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{titleCase(row.movement_type)}</p><div className="mt-2 flex items-end justify-between"><p className="text-2xl font-black text-slate-900">{row.quantity}</p><p className="text-xs text-slate-500">{row.actions} actions</p></div></div>)}</div>
      </Section>
    </div>
  )
}

export default Admin_Reports

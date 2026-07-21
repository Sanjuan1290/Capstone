import { useEffect, useMemo, useState } from 'react'
import { getReports } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { ErrorState, LoadingState } from '../../components/ui/PageState'
import {
  MdArrowDownward,
  MdArrowUpward,
  MdBarChart,
  MdCalendarToday,
  MdChecklist,
  MdEventAvailable,
  MdFace,
  MdInsights,
  MdInventory2,
  MdMedicalServices,
  MdPeople,
  MdPictureAsPdf,
  MdTrendingDown,
  MdTrendingFlat,
  MdWarning,
} from 'react-icons/md'

const formatPeso = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
const formatPercent = (value) => `${Math.round(Number(value || 0))}%`
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
  if (!range?.start_date || !range?.end_date) return 'Selected date range'
  const format = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${format(range.start_date)} – ${format(range.end_date)}`
}

const getTrendMeta = (value) => {
  if (value > 0) return { icon: MdArrowUpward, text: `Up ${Math.abs(value)}% vs previous month`, tone: 'text-emerald-600' }
  if (value < 0) return { icon: MdArrowDownward, text: `Down ${Math.abs(value)}% vs previous month`, tone: 'text-rose-600' }
  return { icon: MdTrendingFlat, text: 'No month-over-month change', tone: 'text-slate-500' }
}

const Admin_Reports = () => {
  const toast = useToast()
  const initialRange = getPresetRange('6months')
  const [preset, setPreset] = useState('6months')
  const [dateRange, setDateRange] = useState(initialRange)
  const [appliedRange, setAppliedRange] = useState(initialRange)
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const applyPreset = (nextPreset) => {
    const nextRange = getPresetRange(nextPreset)
    setPreset(nextPreset)
    setDateRange(nextRange)
    setAppliedRange(nextRange)
  }

  const applyCustomRange = () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      toast.warning('Select a start and end date.')
      return
    }
    if (dateRange.startDate > dateRange.endDate) {
      toast.warning('Start date cannot be after end date.')
      return
    }
    setPreset('custom')
    setAppliedRange(dateRange)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getReports(appliedRange)
      .then((data) => {
        if (active) setReportData(data)
      })
      .catch((err) => {
        if (!active) return
        const message = err.message || 'Reports could not be loaded.'
        setError(message)
        toast.error(message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [appliedRange.startDate, appliedRange.endDate])

  const derived = useMemo(() => {
    const {
      monthly = [],
      statusBreakdown = [],
      topDoctors = [],
      inventoryStats = {},
      stockActivity = [],
      inventoryByCategory = [],
      upcomingAppointments = 0,
      supplyRequests = {},
      appointmentSummary = {},
      billingSummary = {},
      paymentsByMethod = [],
      serviceRevenue = [],
    } = reportData || {}

    const totalAppts = Number(appointmentSummary.appointments || 0)
    const totalPats = Number(appointmentSummary.unique_patients || 0)
    const totalMedical = Number(appointmentSummary.medical || 0)
    const totalDerma = Number(appointmentSummary.derma || 0)
    const avgPerMonth = monthly.length ? Math.round(totalAppts / monthly.length) : 0
    const busiestMonth = monthly.reduce((best, row) => (
      Number(row.appointments || 0) > Number(best?.appointments || 0) ? row : best
    ), null)
    const latestMonth = monthly[monthly.length - 1]
    const previousMonth = monthly[monthly.length - 2]
    const monthDelta = previousMonth?.appointments
      ? Math.round(((Number(latestMonth?.appointments || 0) - Number(previousMonth.appointments || 0)) / Number(previousMonth.appointments || 1)) * 100)
      : 0
    const patientDelta = previousMonth?.patients
      ? Math.round(((Number(latestMonth?.patients || 0) - Number(previousMonth.patients || 0)) / Number(previousMonth.patients || 1)) * 100)
      : 0
    const appointmentTrend = getTrendMeta(monthDelta)
    const patientTrend = getTrendMeta(patientDelta)
    const maxAppts = Math.max(...monthly.map((row) => Number(row.appointments || 0)), 1)
    const maxStock = Math.max(...stockActivity.map((row) => Math.max(Number(row.stock_in || 0), Number(row.stock_out || 0))), 1)
    const maxCategoryValue = Math.max(...inventoryByCategory.map((row) => Number(row.total_value || 0)), 1)
    const completedValue = Number(statusBreakdown.find((row) => row.label.toLowerCase() === 'completed')?.value || 0)
    const cancelledValue = Number(statusBreakdown.find((row) => row.label.toLowerCase() === 'cancelled')?.value || 0)
    const pendingValue = Number(statusBreakdown.find((row) => row.label.toLowerCase() === 'pending')?.value || 0)
    const confirmedValue = Number(statusBreakdown.find((row) => row.label.toLowerCase() === 'confirmed')?.value || 0)
    const completionRate = totalAppts ? Math.round((completedValue / totalAppts) * 100) : 0
    const cancellationRate = totalAppts ? Math.round((cancelledValue / totalAppts) * 100) : 0
    const fulfillmentPressure = pendingValue + confirmedValue + Number(upcomingAppointments || 0)
    const totalStockIn = stockActivity.reduce((sum, row) => sum + Number(row.stock_in || 0), 0)
    const totalStockOut = stockActivity.reduce((sum, row) => sum + Number(row.stock_out || 0), 0)
    const netStock = totalStockIn - totalStockOut
    const topCategory = inventoryByCategory[0] || null
    const mostLoadedDoctor = topDoctors[0] || null
    const insights = [
      latestMonth
        ? `${latestMonth.month} recorded ${latestMonth.appointments} appointments and ${latestMonth.patients} patients.`
        : 'No appointments were recorded in the selected period.',
      busiestMonth
        ? `${busiestMonth.month} was the busiest month with ${busiestMonth.appointments} appointments.`
        : 'There is no busiest month yet because the report period is empty.',
      topCategory
        ? `${topCategory.category || 'Uncategorized'} currently holds the highest inventory value at ${formatPeso(topCategory.total_value)}.`
        : 'Inventory category value data is not available yet.',
      mostLoadedDoctor
        ? `${mostLoadedDoctor.name} handled the highest volume with ${mostLoadedDoctor.appointments || 0} appointments in this period.`
        : 'Doctor ranking data is not available yet.',
    ]

    return {
      monthly,
      statusBreakdown,
      topDoctors,
      inventoryStats,
      stockActivity,
      inventoryByCategory,
      upcomingAppointments: Number(upcomingAppointments || 0),
      supplyRequests: {
        pending: Number(supplyRequests?.pending || 0),
        approved: Number(supplyRequests?.approved || 0),
        rejected: Number(supplyRequests?.rejected || 0),
      },
      billingSummary: {
        gross_billing: Number(billingSummary?.gross_billing || 0),
        discounts: Number(billingSummary?.discounts || 0),
        net_collected: Number(billingSummary?.net_collected || 0),
        pending_receivables: Number(billingSummary?.pending_receivables || 0),
        paid_bills: Number(billingSummary?.paid_bills || 0),
        pending_bills: Number(billingSummary?.pending_bills || 0),
      },
      paymentsByMethod,
      serviceRevenue,
        totalAppts,
      totalPats,
      totalMedical,
      totalDerma,
      avgPerMonth,
      busiestMonth,
      latestMonth,
      appointmentTrend,
      patientTrend,
      maxAppts,
      maxStock,
      maxCategoryValue,
      completionRate,
      cancellationRate,
      fulfillmentPressure,
      totalStockIn,
      totalStockOut,
      netStock,
      topCategory,
      insights,
    }
  }, [reportData])

  if (loading) return <LoadingState label="Loading reports and billing analytics..." />
  if (error) return <ErrorState message={error} onRetry={() => setAppliedRange({ ...appliedRange })} />

  const {
    monthly,
    statusBreakdown,
    topDoctors,
    inventoryStats,
    stockActivity,
    inventoryByCategory,
    upcomingAppointments,
    supplyRequests,
    billingSummary,
    paymentsByMethod,
    serviceRevenue,
    totalAppts,
    totalPats,
    totalMedical,
    totalDerma,
    avgPerMonth,
    busiestMonth,
    latestMonth,
    appointmentTrend,
    patientTrend,
    maxAppts,
    maxStock,
    maxCategoryValue,
    completionRate,
    cancellationRate,
    fulfillmentPressure,
    totalStockIn,
    totalStockOut,
    netStock,
    topCategory,
    insights,
  } = derived

  const netStockTone = netStock >= 0 ? 'text-emerald-600' : 'text-rose-600'
  const reportRangeLabel = formatRangeLabel(reportData?.range)

  const handleExportPdf = () => {
    const monthlyRows = monthly.map((row) => `
      <tr><td>${escapeHtml(row.month)}</td><td>${escapeHtml(row.appointments)}</td><td>${escapeHtml(row.medical || 0)}</td><td>${escapeHtml(row.derma || 0)}</td><td>${escapeHtml(row.patients)}</td></tr>
    `).join('')
    const topDoctorRows = topDoctors.map((doctor) => `
      <tr><td>${escapeHtml(doctor.name)}</td><td>${escapeHtml(doctor.specialty)}</td><td>${escapeHtml(doctor.appointments || 0)}</td><td>${escapeHtml(doctor.patients || 0)}</td><td>${escapeHtml(doctor.completed || 0)}</td></tr>
    `).join('')
    const statusRows = statusBreakdown.map((row) => `
      <tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td><td>${escapeHtml(row.pct)}%</td></tr>
    `).join('')
    const serviceRows = serviceRevenue.map((row) => `
      <tr><td>${escapeHtml(row.service_name)}</td><td>${escapeHtml(row.bills)}</td><td>${escapeHtml(row.quantity)}</td><td>${escapeHtml(formatPeso(row.revenue))}</td></tr>
    `).join('')
    const paymentRows = paymentsByMethod.map((row) => `
      <tr><td>${escapeHtml(String(row.payment_method || '').replace(/_/g, ' '))}</td><td>${escapeHtml(row.transactions)}</td><td>${escapeHtml(formatPeso(row.amount))}</td></tr>
    `).join('')

    const html = `<!doctype html>
      <html lang="en"><head><meta charset="utf-8"/><title>Carait Clinic Report</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 0; color: #0f172a; font-size: 11px; }
        header { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 16px; }
        h1 { margin: 0; font-size: 22px; } h2 { margin: 20px 0 8px; font-size: 14px; page-break-after: avoid; }
        p { margin: 4px 0; color: #475569; }
        .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin: 12px 0; }
        .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; }
        .label { font-size: 8px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
        .value { margin-top: 5px; font-size: 15px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; page-break-inside: auto; }
        thead { display: table-header-group; } tr { page-break-inside: avoid; }
        th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
        th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; }
        ul { margin: 5px 0; padding-left: 18px; }
        footer { position: fixed; bottom: -8mm; left: 0; right: 0; text-align: center; color: #64748b; font-size: 8px; }
      </style></head><body>
      <header><h1>Carait Medical and Dermatology Clinic</h1><p>Reports and Analytics</p><p>Period: ${escapeHtml(reportRangeLabel)}</p><p>Generated: ${escapeHtml(new Date().toLocaleString('en-PH'))}</p></header>
      <div class="cards">
        <div class="card"><div class="label">Appointments</div><div class="value">${escapeHtml(totalAppts)}</div></div>
        <div class="card"><div class="label">Unique Patients</div><div class="value">${escapeHtml(totalPats)}</div></div>
        <div class="card"><div class="label">Net Collected</div><div class="value">${escapeHtml(formatPeso(billingSummary.net_collected))}</div></div>
        <div class="card"><div class="label">Pending Receivables</div><div class="value">${escapeHtml(formatPeso(billingSummary.pending_receivables))}</div></div>
      </div>
      <h2>Key Insights</h2><ul>${insights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <h2>Monthly Performance</h2><table><thead><tr><th>Month</th><th>Appointments</th><th>Medical</th><th>Derma</th><th>Patients</th></tr></thead><tbody>${monthlyRows || '<tr><td colspan="5">No data.</td></tr>'}</tbody></table>
      <h2>Billing Summary</h2><table><tbody>
        <tr><th>Gross Billing</th><td>${escapeHtml(formatPeso(billingSummary.gross_billing))}</td><th>Discounts</th><td>${escapeHtml(formatPeso(billingSummary.discounts))}</td></tr>
        <tr><th>Net Collected</th><td>${escapeHtml(formatPeso(billingSummary.net_collected))}</td><th>Pending Receivables</th><td>${escapeHtml(formatPeso(billingSummary.pending_receivables))}</td></tr>
      </tbody></table>
      <h2>Payments by Method</h2><table><thead><tr><th>Method</th><th>Transactions</th><th>Amount</th></tr></thead><tbody>${paymentRows || '<tr><td colspan="3">No payments.</td></tr>'}</tbody></table>
      <h2>Top Services by Revenue</h2><table><thead><tr><th>Service</th><th>Bills</th><th>Quantity</th><th>Revenue</th></tr></thead><tbody>${serviceRows || '<tr><td colspan="4">No paid services.</td></tr>'}</tbody></table>
      <h2>Status Breakdown</h2><table><thead><tr><th>Status</th><th>Total</th><th>Share</th></tr></thead><tbody>${statusRows || '<tr><td colspan="3">No data.</td></tr>'}</tbody></table>
      <h2>Doctor Activity</h2><table><thead><tr><th>Doctor</th><th>Specialty</th><th>Appointments</th><th>Patients</th><th>Completed</th></tr></thead><tbody>${topDoctorRows || '<tr><td colspan="5">No data.</td></tr>'}</tbody></table>
      <footer>Carait Clinic · ${escapeHtml(reportRangeLabel)}</footer></body></html>`

    const frame = document.createElement('iframe')
    frame.setAttribute('title', 'Printable clinic report')
    frame.style.position = 'fixed'
    frame.style.width = '1px'
    frame.style.height = '1px'
    frame.style.opacity = '0'
    frame.style.pointerEvents = 'none'
    document.body.appendChild(frame)
    frame.onload = () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      window.setTimeout(() => frame.remove(), 1500)
    }
    frame.srcdoc = html
    toast.info('Print dialog opened. Choose “Save as PDF” to download the report.')
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports and Analytics</h1>
          <p className="mt-0.5 text-sm text-slate-500">Operational summary for appointments, doctors, patients, inventory, and supply pressure.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <MdPictureAsPdf className="text-[18px] text-rose-500" />
            Print / Save PDF
          </button>
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {[
              { value: 'today', label: 'Today' },
              { value: '7days', label: '7 Days' },
              { value: '30days', label: '30 Days' },
              { value: '3months', label: '3 Months' },
              { value: '6months', label: '6 Months' },
              { value: 'year', label: 'This Year' },
            ].map((option) => (
              <button key={option.value} onClick={() => applyPreset(option.value)} className={`rounded-lg px-3 py-2 text-xs font-bold transition-all ${preset === option.value ? 'bg-[#0b1a2c] text-sky-400 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="report-start-date" className="form-label">Start Date</label>
            <input id="report-start-date" type="date" value={dateRange.startDate} onChange={(e) => setDateRange((current) => ({ ...current, startDate: e.target.value }))} className="form-control mt-1.5" />
          </div>
          <div>
            <label htmlFor="report-end-date" className="form-label">End Date</label>
            <input id="report-end-date" type="date" value={dateRange.endDate} onChange={(e) => setDateRange((current) => ({ ...current, endDate: e.target.value }))} className="form-control mt-1.5" />
          </div>
          <button type="button" className="button-primary" onClick={applyCustomRange}>Apply Range</button>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">Showing {reportRangeLabel}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Gross Billing', value: formatPeso(billingSummary.gross_billing), helper: `${billingSummary.paid_bills} paid bills` },
          { label: 'Discounts', value: formatPeso(billingSummary.discounts), helper: 'Approved discounts' },
          { label: 'Net Collected', value: formatPeso(billingSummary.net_collected), helper: `${paymentsByMethod.length} payment methods` },
          { label: 'Pending Receivables', value: formatPeso(billingSummary.pending_receivables), helper: `${billingSummary.pending_bills} pending bills` },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{card.label}</p>
            <p className="mt-2 text-xl font-black text-slate-800">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_35%),linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-sky-700">
              <MdInsights className="text-sm" />
              Executive Snapshot
            </div>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">
              {latestMonth ? `${latestMonth.month} closed with ${latestMonth.appointments} appointments.` : 'No report data yet.'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Use this page to spot patient demand, doctor workload, inventory risk, and supply request pressure in one place.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: 'Appointments',
                  value: totalAppts,
                  helper: appointmentTrend.text,
                  icon: MdEventAvailable,
                  tone: 'bg-sky-50 text-sky-700 border-sky-200',
                },
                {
                  label: 'Unique Patients',
                  value: totalPats,
                  helper: patientTrend.text,
                  icon: MdPeople,
                  tone: 'bg-violet-50 text-violet-700 border-violet-200',
                },
                {
                  label: 'Completion Rate',
                  value: formatPercent(completionRate),
                  helper: `${formatPercent(cancellationRate)} cancelled`,
                  icon: MdChecklist,
                  tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                },
                {
                  label: 'Inventory Value',
                  value: formatPeso(inventoryStats?.total_value),
                  helper: `${inventoryStats?.total_items || 0} tracked items`,
                  icon: MdInventory2,
                  tone: 'bg-amber-50 text-amber-700 border-amber-200',
                },
              ].map((card) => (
                <div key={card.label} className={`rounded-2xl border px-4 py-4 ${card.tone}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em]">{card.label}</p>
                    <card.icon className="text-lg" />
                  </div>
                  <p className="mt-3 text-3xl font-black">{card.value}</p>
                  <p className="mt-2 text-xs font-medium opacity-85">{card.helper}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-5">
            <div className="flex items-center gap-2">
              <MdCalendarToday className="text-lg text-slate-500" />
              <h3 className="text-sm font-bold text-slate-800">Operational Pressure</h3>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Upcoming Appointments</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{upcomingAppointments}</p>
                <p className="mt-1 text-xs text-slate-500">Pending, confirmed, and rescheduled patients still in the pipeline.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Demand Load</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{fulfillmentPressure}</p>
                <p className="mt-1 text-xs text-slate-500">Pending and confirmed appointments plus upcoming schedule pressure.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Supply Requests</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{supplyRequests.pending}</p>
                <p className="mt-1 text-xs text-slate-500">Pending requests. {supplyRequests.approved} approved, {supplyRequests.rejected} rejected in this period.</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Average Per Month</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{avgPerMonth}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {busiestMonth ? `${busiestMonth.month} was peak demand.` : 'Waiting for enough data to identify a peak month.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <MdBarChart className="text-lg text-slate-500" />
            <h2 className="text-sm font-bold text-slate-800">Key Insights</h2>
          </div>
          <div className="mt-4 space-y-3">
            {insights.map((insight) => (
              <div key={insight} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {insight}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <MdInventory2 className="text-lg text-slate-500" />
            <h2 className="text-sm font-bold text-slate-800">Inventory Health</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: 'Out of Stock',
                value: inventoryStats?.out_of_stock || 0,
                tone: 'border-rose-200 bg-rose-50 text-rose-700',
                helper: 'Needs immediate restocking.',
              },
              {
                label: 'Low Stock',
                value: inventoryStats?.low_stock || 0,
                tone: 'border-amber-200 bg-amber-50 text-amber-700',
                helper: 'Monitor before shortages hit.',
              },
              {
                label: 'Expiring Soon',
                value: inventoryStats?.expiring_soon || 0,
                tone: 'border-violet-200 bg-violet-50 text-violet-700',
                helper: 'Review within the next 30 days.',
              },
            ].map((item) => (
              <div key={item.label} className={`rounded-2xl border px-4 py-4 ${item.tone}`}>
                <p className="text-2xl font-black">{item.value}</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em]">{item.label}</p>
                <p className="mt-2 text-xs opacity-85">{item.helper}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Most Valuable Category</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{topCategory?.category || 'No category data'}</p>
              </div>
              <p className="text-sm font-black text-slate-800">{topCategory ? formatPeso(topCategory.total_value) : '-'}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Monthly Appointments</h2>
            <p className="mt-1 text-xs text-slate-400">Medical and derma split by month.</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-medium text-slate-400">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" /> Medical</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> Derma</span>
          </div>
        </div>
        {monthly.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <MdBarChart className="mb-2 text-[40px]" />
            <p className="text-sm font-medium">No data for this period</p>
          </div>
        ) : (
          <div className="flex items-end gap-2 h-52">
            {monthly.map((row) => (
              <div key={row.ym} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <p className="text-[10px] font-bold text-slate-500">{row.appointments}</p>
                <div className="flex w-full flex-col gap-0.5" style={{ height: '170px', justifyContent: 'flex-end' }}>
                  <div
                    className="w-full rounded-t-sm bg-emerald-400 transition-all duration-500"
                    style={{ height: `${((Number(row.derma || 0)) / maxAppts) * 100}%`, minHeight: row.derma > 0 ? '3px' : '0' }}
                  />
                  <div
                    className="w-full rounded-b-sm bg-sky-500 transition-all duration-500"
                    style={{ height: `${((Number(row.medical || 0)) / maxAppts) * 100}%`, minHeight: row.medical > 0 ? '3px' : '0' }}
                  />
                </div>
                <p className="w-full truncate text-center text-[10px] font-medium text-slate-400">{row.month}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Appointment Status Breakdown</h2>
          {statusBreakdown.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No data available</p>
          ) : (
            <div className="space-y-3">
              {statusBreakdown.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-700">{row.label}</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold ${row.textColor}`}>{row.pct}%</p>
                      <p className="text-[11px] text-slate-400">{row.value}</p>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all duration-700 ${row.color}`} style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-800">Clinical Mix</h2>
            <p className="text-[11px] font-medium text-slate-400">{totalAppts} total appointments</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-700">Medical</p>
              <p className="mt-2 text-3xl font-black text-sky-700">{totalMedical}</p>
              <p className="mt-1 text-xs text-sky-700/80">{formatPercent(totalAppts ? (totalMedical / totalAppts) * 100 : 0)} of total visits</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">Derma</p>
              <p className="mt-2 text-3xl font-black text-emerald-700">{totalDerma}</p>
              <p className="mt-1 text-xs text-emerald-700/80">{formatPercent(totalAppts ? (totalDerma / totalAppts) * 100 : 0)} of total visits</p>
            </div>
          </div>
        </section>
      </div>

      {stockActivity.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Inventory Stock Activity</h2>
              <p className="mt-1 text-xs text-slate-400">Shows total stock moved in and out each month.</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-black ${netStockTone}`}>{netStock >= 0 ? '+' : ''}{netStock}</p>
              <p className="text-[11px] text-slate-400">Net movement for selected period</p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
            <div className="flex items-end gap-2 h-44">
              {stockActivity.map((row) => (
                <div key={row.ym} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex w-full gap-0.5" style={{ height: '125px', alignItems: 'flex-end' }}>
                    <div
                      className="flex-1 rounded-t-sm bg-emerald-400 transition-all duration-500"
                      style={{ height: `${((Number(row.stock_in || 0)) / maxStock) * 100}%`, minHeight: row.stock_in > 0 ? '3px' : '0' }}
                    />
                    <div
                      className="flex-1 rounded-t-sm bg-rose-400 transition-all duration-500"
                      style={{ height: `${((Number(row.stock_out || 0)) / maxStock) * 100}%`, minHeight: row.stock_out > 0 ? '3px' : '0' }}
                    />
                  </div>
                  <p className="w-full truncate text-center text-[10px] font-medium text-slate-400">{row.month}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Total Stock In</p>
                <p className="mt-2 text-2xl font-black text-emerald-600">{totalStockIn}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Total Stock Out</p>
                <p className="mt-2 text-2xl font-black text-rose-600">{totalStockOut}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Net Movement</p>
                <p className={`mt-2 text-2xl font-black ${netStockTone}`}>{netStock >= 0 ? '+' : ''}{netStock}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Top Doctors</h2>
          {topDoctors.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No data available</p>
          ) : (
            <div className="space-y-3">
              {topDoctors.map((doctor) => {
                const Icon = doctor.is_derma ? MdFace : MdMedicalServices
                const pct = topDoctors[0]?.patients > 0 ? Math.round((Number(doctor.patients || 0) / Number(topDoctors[0].patients || 1)) * 100) : 0
                const completion = Number(doctor.patients || 0) > 0
                  ? Math.round((Number(doctor.completed || 0) / Number(doctor.patients || 1)) * 100)
                  : 0
                return (
                  <div key={doctor.name} className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${doctor.is_derma ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                      <Icon className={`text-[16px] ${doctor.is_derma ? 'text-emerald-600' : 'text-slate-500'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center justify-between">
                        <p className="truncate text-xs font-bold text-slate-800">{doctor.name}</p>
                        <p className="ml-2 shrink-0 text-xs font-bold text-slate-600">{doctor.patients}</p>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full transition-all duration-700 ${doctor.is_derma ? 'bg-emerald-400' : 'bg-sky-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">{doctor.specialty} | {doctor.completed} completed | {completion}% completion</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Inventory by Category</h2>
          {inventoryByCategory.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No inventory category data available</p>
          ) : (
            <div className="space-y-3">
              {inventoryByCategory.map((row) => {
                const width = Math.max(8, Math.round((Number(row.total_value || 0) / maxCategoryValue) * 100))
                return (
                  <div key={row.category} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{row.category || 'Uncategorized'}</p>
                        <p className="text-xs text-slate-500">{row.items} items | {Number(row.total_stock || 0).toLocaleString('en-PH')} units on hand</p>
                      </div>
                      <p className="text-sm font-bold text-slate-700">{formatPeso(row.total_value)}</p>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white">
                      <div className="h-2 rounded-full bg-[#0b1a2c]" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {monthly.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Monthly Performance Table</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Month</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Appointments</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-sky-500">Medical</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-emerald-500">Derma</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Patients</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">MoM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthly.map((row, index) => {
                  const prev = monthly[index - 1]
                  const delta = prev?.appointments
                    ? Math.round(((Number(row.appointments || 0) - Number(prev.appointments || 0)) / Number(prev.appointments || 1)) * 100)
                    : 0
                  const tone = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-500'

                  return (
                    <tr key={row.ym} className="transition-colors hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-semibold text-slate-700">{row.month}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">{row.appointments}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-sky-600">{row.medical || 0}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-emerald-600">{row.derma || 0}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-500">{row.patients}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${tone}`}>
                        {index === 0 ? '-' : `${delta > 0 ? '+' : ''}${delta}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-700">Total</td>
                  <td className="px-3 py-2.5 text-right font-black text-slate-800">{totalAppts}</td>
                  <td className="px-3 py-2.5 text-right font-black text-sky-600">{totalMedical}</td>
                  <td className="px-3 py-2.5 text-right font-black text-emerald-600">{totalDerma}</td>
                  <td className="px-3 py-2.5 text-right font-black text-slate-500">{totalPats}</td>
                  <td className="px-3 py-2.5 text-right font-black text-slate-500">-</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

export default Admin_Reports


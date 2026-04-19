import { useEffect, useMemo, useState } from 'react'
import { getReports } from '../../services/admin.service'
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
  MdTrendingDown,
  MdTrendingFlat,
  MdWarning,
} from 'react-icons/md'

const formatPeso = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
const formatPercent = (value) => `${Math.round(Number(value || 0))}%`

const getTrendMeta = (value) => {
  if (value > 0) return { icon: MdArrowUpward, text: `Up ${Math.abs(value)}% vs previous month`, tone: 'text-emerald-600' }
  if (value < 0) return { icon: MdArrowDownward, text: `Down ${Math.abs(value)}% vs previous month`, tone: 'text-rose-600' }
  return { icon: MdTrendingFlat, text: 'No month-over-month change', tone: 'text-slate-500' }
}

const Admin_Reports = () => {
  const [period, setPeriod] = useState('6months')
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)

  const handlePeriodChange = (nextPeriod) => {
    if (nextPeriod === period) return
    setLoading(true)
    setPeriod(nextPeriod)
  }

  useEffect(() => {
    getReports(period)
      .then((data) => setReportData(data))
      .catch((err) => console.error('Reports error:', err))
      .finally(() => setLoading(false))
  }, [period])

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
    } = reportData || {}

    const totalAppts = monthly.reduce((sum, row) => sum + Number(row.appointments || 0), 0)
    const totalPats = monthly.reduce((sum, row) => sum + Number(row.patients || 0), 0)
    const totalMedical = monthly.reduce((sum, row) => sum + Number(row.medical || 0), 0)
    const totalDerma = monthly.reduce((sum, row) => sum + Number(row.derma || 0), 0)
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
        ? `${mostLoadedDoctor.name} handled the highest volume with ${mostLoadedDoctor.patients} patient appointments in this period.`
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
        <p className="text-sm font-medium text-slate-400 animate-pulse">Loading reports...</p>
      </div>
    )
  }

  const {
    monthly,
    statusBreakdown,
    topDoctors,
    inventoryStats,
    stockActivity,
    inventoryByCategory,
    upcomingAppointments,
    supplyRequests,
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

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports and Analytics</h1>
          <p className="mt-0.5 text-sm text-slate-500">Operational summary for appointments, doctors, patients, inventory, and supply pressure.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {[{ v: '3months', l: 'Last 3 Months' }, { v: '6months', l: 'Last 6 Months' }].map(({ v, l }) => (
            <button
              key={v}
              onClick={() => handlePeriodChange(v)}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                period === v ? 'bg-[#0b1a2c] text-sky-400 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

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

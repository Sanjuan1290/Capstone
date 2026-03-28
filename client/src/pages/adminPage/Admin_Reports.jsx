// client/src/pages/adminPage/Admin_Reports.jsx
import { useEffect, useState } from 'react'
import { getReports } from '../../services/admin.service'
import {
  MdBarChart, MdPeople, MdEventAvailable, MdTrendingUp,
  MdTrendingDown, MdFace, MdMedicalServices, MdInventory2,
  MdWarning, MdArrowUpward, MdArrowDownward
} from 'react-icons/md'

const Admin_Reports = () => {
  const [period,      setPeriod]      = useState('6months')
  const [reportData,  setReportData]  = useState(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    setLoading(true)
    getReports(period)
      .then(data => setReportData(data))
      .catch(err  => console.error('Reports error:', err))
      .finally(()  => setLoading(false))
  }, [period])

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
      <p className="text-slate-400 font-medium animate-pulse text-sm">Loading reports…</p>
    </div>
  )

  const { monthly = [], statusBreakdown = [], topDoctors = [], inventoryStats, stockActivity = [] } = reportData || {}
  const totalAppts = monthly.reduce((s, m) => s + (m.appointments || 0), 0)
  const totalPats  = monthly.reduce((s, m) => s + (m.patients || 0), 0)
  const maxAppts   = Math.max(...monthly.map(m => m.appointments || 0), 1)
  const maxStock   = Math.max(...stockActivity.map(s => Math.max(s.stock_in || 0, s.stock_out || 0)), 1)

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Overview of appointments, patients, and inventory.</p>
        </div>
        {/* Period selector */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {[{ v: '3months', l: 'Last 3 Months' }, { v: '6months', l: 'Last 6 Months' }].map(({ v, l }) => (
            <button key={v} onClick={() => setPeriod(v)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all
                ${period === v ? 'bg-[#0b1a2c] text-sky-400 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards — no Monthly Revenue */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Appointments', value: totalAppts,                                    icon: MdEventAvailable,  color: 'text-sky-600',     bg: 'bg-sky-50'     },
          { label: 'Unique Patients',    value: totalPats,                                     icon: MdPeople,          color: 'text-violet-600',  bg: 'bg-violet-50'  },
          { label: 'Inventory Value',    value: `₱${(inventoryStats?.total_value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`, icon: MdInventory2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Inventory Items',    value: inventoryStats?.total_items || 0,              icon: MdBarChart,        color: 'text-amber-600',   bg: 'bg-amber-50'   },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`text-[18px] ${color}`} />
            </div>
            <p className="text-2xl font-black text-slate-800">{value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Inventory Alert Row */}
      {(inventoryStats?.out_of_stock > 0 || inventoryStats?.low_stock > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {inventoryStats?.out_of_stock > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-center gap-3">
              <MdWarning className="text-red-500 text-[20px] shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-700">{inventoryStats.out_of_stock} Item{inventoryStats.out_of_stock !== 1 ? 's' : ''} Out of Stock</p>
                <p className="text-xs text-red-500 mt-0.5">Immediate restocking required</p>
              </div>
            </div>
          )}
          {inventoryStats?.low_stock > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3">
              <MdTrendingDown className="text-amber-500 text-[20px] shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-700">{inventoryStats.low_stock} Item{inventoryStats.low_stock !== 1 ? 's' : ''} Low on Stock</p>
                <p className="text-xs text-amber-500 mt-0.5">Consider restocking soon</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Appointments Chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-slate-800">Monthly Appointments</h2>
          <div className="flex items-center gap-4 text-[11px] text-slate-400 font-medium">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" /> Medical</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Derma</span>
          </div>
        </div>
        {monthly.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <MdBarChart className="text-[40px] mb-2" />
            <p className="text-sm font-medium">No data for this period</p>
          </div>
        ) : (
          <div className="flex items-end gap-2 h-48">
            {monthly.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-500">{m.appointments}</p>
                <div className="w-full flex flex-col gap-0.5" style={{ height: '160px', justifyContent: 'flex-end' }}>
                  {/* Derma bar */}
                  <div className="w-full rounded-t-sm bg-emerald-400 transition-all duration-500"
                    style={{ height: `${((m.derma || 0) / maxAppts) * 100}%`, minHeight: m.derma > 0 ? '3px' : '0' }} />
                  {/* Medical bar */}
                  <div className="w-full rounded-b-sm bg-sky-500 transition-all duration-500"
                    style={{ height: `${((m.medical || 0) / maxAppts) * 100}%`, minHeight: m.medical > 0 ? '3px' : '0' }} />
                </div>
                <p className="text-[10px] text-slate-400 font-medium truncate w-full text-center">{m.month}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inventory Stock Activity Chart */}
      {stockActivity.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-slate-800">Inventory Stock Activity</h2>
            <div className="flex items-center gap-4 text-[11px] text-slate-400 font-medium">
              <span className="flex items-center gap-1.5"><MdArrowUpward className="text-emerald-500 text-[12px]" /> Stock In</span>
              <span className="flex items-center gap-1.5"><MdArrowDownward className="text-red-400 text-[12px]" /> Stock Out</span>
            </div>
          </div>
          <div className="flex items-end gap-2 h-40">
            {stockActivity.map((s, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full flex gap-0.5" style={{ height: '120px', alignItems: 'flex-end' }}>
                  <div className="flex-1 rounded-t-sm bg-emerald-400 transition-all duration-500"
                    style={{ height: `${((s.stock_in || 0) / maxStock) * 100}%`, minHeight: s.stock_in > 0 ? '3px' : '0' }} />
                  <div className="flex-1 rounded-t-sm bg-red-400 transition-all duration-500"
                    style={{ height: `${((s.stock_out || 0) / maxStock) * 100}%`, minHeight: s.stock_out > 0 ? '3px' : '0' }} />
                </div>
                <p className="text-[10px] text-slate-400 font-medium truncate w-full text-center">{s.month}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Appointment Status Breakdown */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Appointment Status Breakdown</h2>
          {statusBreakdown.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No data available</p>
          ) : (
            <div className="space-y-3">
              {statusBreakdown.map((s, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-700">{s.label}</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold ${s.textColor}`}>{s.pct}%</p>
                      <p className="text-[11px] text-slate-400">{s.value}</p>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all duration-700`}
                      style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Doctors */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Top Doctors</h2>
          {topDoctors.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No data available</p>
          ) : (
            <div className="space-y-3">
              {topDoctors.map((doc, i) => {
                const Icon = doc.is_derma ? MdFace : MdMedicalServices
                const pct  = topDoctors[0]?.patients > 0 ? Math.round((doc.patients / topDoctors[0].patients) * 100) : 0
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${doc.is_derma ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                      <Icon className={`text-[15px] ${doc.is_derma ? 'text-emerald-600' : 'text-slate-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-bold text-slate-800 truncate">{doc.name}</p>
                        <p className="text-xs font-bold text-slate-600 shrink-0 ml-2">{doc.patients}</p>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${doc.is_derma ? 'bg-emerald-400' : 'bg-sky-400'} rounded-full transition-all duration-700`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{doc.specialty} · {doc.completed} completed</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Clinic Type Split */}
      {monthly.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Clinic Type Split by Month</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Month</th>
                  <th className="text-right py-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</th>
                  <th className="text-right py-2 px-3 text-[10px] font-bold text-sky-500 uppercase tracking-widest">Medical</th>
                  <th className="text-right py-2 px-3 text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Derma</th>
                  <th className="text-right py-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patients</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthly.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-700">{m.month}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800">{m.appointments}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-sky-600">{m.medical || 0}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">{m.derma || 0}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-500">{m.patients}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="py-2.5 px-3 font-bold text-slate-700 text-[11px] uppercase tracking-widest">Total</td>
                  <td className="py-2.5 px-3 text-right font-black text-slate-800">{totalAppts}</td>
                  <td className="py-2.5 px-3 text-right font-black text-sky-600">{monthly.reduce((s,m)=>s+(m.medical||0),0)}</td>
                  <td className="py-2.5 px-3 text-right font-black text-emerald-600">{monthly.reduce((s,m)=>s+(m.derma||0),0)}</td>
                  <td className="py-2.5 px-3 text-right font-black text-slate-500">{totalPats}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin_Reports
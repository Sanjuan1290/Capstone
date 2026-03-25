import { useState } from "react"
import {
  MdBarChart, MdTrendingUp, MdTrendingDown, MdPeople,
  MdEventAvailable, MdFace, MdMedicalServices, MdCalendarToday,
  MdArrowUpward, MdArrowDownward
} from "react-icons/md"

const monthlyData = [
  { month:"Oct",  appointments:62,  patients:48,  derma:35, medical:27 },
  { month:"Nov",  appointments:71,  patients:55,  derma:40, medical:31 },
  { month:"Dec",  appointments:58,  patients:43,  derma:32, medical:26 },
  { month:"Jan",  appointments:74,  patients:61,  derma:44, medical:30 },
  { month:"Feb",  appointments:83,  patients:67,  derma:50, medical:33 },
  { month:"Mar",  appointments:91,  patients:72,  derma:55, medical:36 },
]

const topDoctors = [
  { name:"Dr. Maria Santos",  specialty:"Dermatologist",        patients:55, completed:52, type:"derma"   },
  { name:"Dr. Jose Reyes",    specialty:"General Practitioner", patients:48, completed:45, type:"medical" },
  { name:"Dr. Carlo Lim",     specialty:"Cosmetic Dermatology", patients:31, completed:29, type:"derma"   },
  { name:"Dr. Ana Villanueva",specialty:"Internal Medicine",    patients:27, completed:25, type:"medical" },
]

const statusBreakdown = [
  { label:"Completed",    value:161, pct:65, color:"bg-emerald-500", textColor:"text-emerald-700" },
  { label:"Confirmed",    value:42,  pct:17, color:"bg-sky-400",     textColor:"text-sky-700"     },
  { label:"Pending",      value:25,  pct:10, color:"bg-amber-400",   textColor:"text-amber-700"   },
  { label:"Cancelled",    value:20,  pct:8,  color:"bg-red-400",     textColor:"text-red-600"     },
]

const maxAppt = Math.max(...monthlyData.map(d => d.appointments))

const Admin_Reports = () => {
  const [period, setPeriod] = useState("6months")
  const current  = monthlyData[monthlyData.length - 1]
  const previous = monthlyData[monthlyData.length - 2]
  const apptChange = Math.round(((current.appointments - previous.appointments) / previous.appointments) * 100)
  const ptChange   = Math.round(((current.patients    - previous.patients)    / previous.patients)    * 100)

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1 className="text-2xl font-bold text-slate-800">Reports</h1><p className="text-sm text-slate-500 mt-0.5">Clinic performance overview and analytics.</p></div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {[{k:"6months",l:"6 Months"},{k:"3months",l:"3 Months"}].map(({k,l})=>(
            <button key={k} onClick={()=>setPeriod(k)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${period===k ? "bg-[#0b1a2c] text-amber-400" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:"Total Appointments", value: current.appointments, change:apptChange, icon:MdEventAvailable, color:"text-slate-800",   bg:"bg-white"       },
          { label:"New Patients",        value: current.patients,     change:ptChange,   icon:MdPeople,         color:"text-sky-700",     bg:"bg-sky-50"       },
          { label:"Derma Consultations", value: current.derma,        change:null,       icon:MdFace,           color:"text-emerald-700", bg:"bg-emerald-50"   },
          { label:"Medical Consultations",value:current.medical,      change:null,       icon:MdMedicalServices,color:"text-violet-700",  bg:"bg-violet-50"    },
        ].map(({label,value,change,icon:Icon,color,bg}) => (
          <div key={label} className={`${bg} border border-slate-200 rounded-2xl px-5 py-4`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
              </div>
              <Icon className={`text-[22px] ${color} opacity-40`} />
            </div>
            {change !== null && (
              <div className={`flex items-center gap-1 mt-1 text-[11px] font-semibold ${change>=0?"text-emerald-600":"text-red-500"}`}>
                {change>=0 ? <MdArrowUpward className="text-[12px]" /> : <MdArrowDownward className="text-[12px]" />}
                {Math.abs(change)}% vs last month
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chart + breakdown row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">

        {/* Bar chart */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Monthly Appointments</h2>
          <div className="flex items-end gap-3 h-36">
            {monthlyData.map(d => {
              const heightPct = Math.round((d.appointments / maxAppt) * 100)
              const dermaH    = Math.round((d.derma    / d.appointments) * heightPct)
              const medicalH  = heightPct - dermaH
              return (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                  <p className="text-[10px] font-bold text-slate-600">{d.appointments}</p>
                  <div className="w-full flex flex-col rounded-t-lg overflow-hidden" style={{height:`${heightPct * 1.2}px`}}>
                    <div className="bg-emerald-400 w-full" style={{height:`${(dermaH/heightPct)*100}%`}} />
                    <div className="bg-sky-400 w-full flex-1" />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">{d.month}</p>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Dermatology</span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-3 h-3 rounded-sm bg-sky-400 inline-block" /> General Medicine</span>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Appointment Status</h2>
          <div className="space-y-3">
            {statusBreakdown.map(({ label, value, pct, color, textColor }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-600">{label}</span>
                  <span className={`text-xs font-bold ${textColor}`}>{value} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{width:`${pct}%`}} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">Total: <span className="font-bold text-slate-700">248</span> appointments this period</p>
          </div>
        </div>
      </div>

      {/* Top doctors */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Doctor Performance</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {topDoctors.map((doc, i) => {
            const completionRate = Math.round((doc.completed / doc.patients) * 100)
            const Icon = doc.type==="derma" ? MdFace : MdMedicalServices
            return (
              <div key={doc.name} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                <span className="text-sm font-black text-slate-300 w-5 text-center shrink-0">{i+1}</span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${doc.type==="derma"?"bg-emerald-50":"bg-slate-100"}`}>
                  <Icon className={`text-[16px] ${doc.type==="derma"?"text-emerald-600":"text-slate-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{doc.name}</p>
                  <p className="text-xs text-slate-500">{doc.specialty}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-800">{doc.patients} patients</p>
                  <p className="text-[11px] text-emerald-600 font-semibold">{completionRate}% completion</p>
                </div>
                <div className="w-20 shrink-0">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{width:`${completionRate}%`}} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
export default Admin_Reports
// client/src/pages/patientPage/PatientDashboard.jsx
// FIX: Removed Waiting Time Tracker (hardcoded mock, not connected to real data)

import { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { getMyAppointments } from "../../services/patient.service"
import {
  MdCalendarToday, MdEventAvailable, MdAccessTime,
  MdHistory, MdAdd, MdCancel, MdPerson,
  MdArrowForward
} from "react-icons/md"
import { NavLink } from "react-router-dom"


// ── PatientDashboard ──────────────────────────────────────────────────────────
const PatientDashboard = () => {
  const { user } = useAuth()
  const [upcomingAppointment, setUpcomingAppointment] = useState(null)
  const [recentVisits,        setRecentVisits]        = useState([])
  const [totalVisits,         setTotalVisits]         = useState(0)
  const [loadingData,         setLoadingData]         = useState(true)

  useEffect(() => {
    getMyAppointments()
      .then(data => {
        const all = Array.isArray(data) ? data : []

        const active = all
          .filter(a => a.status === "confirmed" || a.status === "pending")
          .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))

        const completed = all.filter(a => a.status === "completed")

        setUpcomingAppointment(active[0] || null)
        setRecentVisits(completed.slice(0, 3))
        setTotalVisits(completed.length)
      })
      .catch(() => {})
      .finally(() => setLoadingData(false))
  }, [])


  const quickActions = [
    { label: "Book Appointment",    icon: MdCalendarToday,  to: "/patient/book"         },
    { label: "My Appointments",     icon: MdEventAvailable, to: "/patient/appointments" },
    { label: "Appointment History", icon: MdHistory,        to: "/patient/history"      },
  ]


  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome back, {user?.full_name || "Patient"} 👋
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Here's an overview of your appointments and health activity.
        </p>
      </div>


      {/* ── Stat Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Upcoming",     value: upcomingAppointment ? "1" : "0", sub: "appointments" },
          { label: "Total Visits", value: totalVisits.toString(),           sub: "completed"    },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-slate-200 px-6 py-5"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-4xl font-bold text-slate-800 mt-1">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>


      {/* ── Main 2-column grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">


        {/* LEFT column */}
        <div className="space-y-4">

          {/* Next Appointment */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Next Appointment</h2>
              <NavLink
                to="/patient/book"
                className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors duration-150"
              >
                <MdAdd className="text-[14px]" />
                Book New
              </NavLink>
            </div>

            {loadingData ? (
              <div className="p-5 text-center text-slate-400 text-sm">Loading appointment…</div>
            ) : upcomingAppointment ? (
              <div className="p-5">
                {/* Top row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      #{upcomingAppointment.id}
                    </span>
                    <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full">
                      scheduled
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full capitalize">
                    {upcomingAppointment.status}
                  </span>
                </div>

                {/* Doctor */}
                <p className="text-lg font-bold text-slate-800 mb-4">
                  {upcomingAppointment.doctor || upcomingAppointment.doctor_name}
                </p>

                {/* Detail grid */}
                <div className="grid grid-cols-2 gap-y-4 gap-x-6 mb-5">
                  <div>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                      <MdCalendarToday className="text-[11px]" /> Date
                    </p>
                    <p className="text-sm font-semibold text-slate-700">
                      {upcomingAppointment.date || upcomingAppointment.appointment_date}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                      <MdAccessTime className="text-[11px]" /> Time
                    </p>
                    <p className="text-sm font-semibold text-slate-700">
                      {upcomingAppointment.time || upcomingAppointment.appointment_time}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                      <MdPerson className="text-[11px]" /> Reason
                    </p>
                    <p className="text-sm font-semibold text-slate-700">
                      {upcomingAppointment.reason || "—"}
                    </p>
                  </div>
                </div>

                <NavLink
                  to="/patient/appointments"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-xl transition-all duration-150 w-fit"
                >
                  <MdCancel className="text-[14px]" />
                  Manage Appointment
                </NavLink>
              </div>
            ) : (
              <div className="p-5 text-center text-slate-400 text-sm">
                No upcoming appointments.{" "}
                <NavLink to="/patient/book" className="text-emerald-600 hover:underline font-medium">
                  Book one now.
                </NavLink>
              </div>
            )}
          </div>


          {/* Recent Visits */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Recent Visits</h2>
              <NavLink
                to="/patient/history"
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 transition-colors"
              >
                View All <MdArrowForward className="text-[13px]" />
              </NavLink>
            </div>

            {loadingData ? (
              <div className="p-4 text-center text-slate-400 text-sm">Loading visits…</div>
            ) : recentVisits.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-sm">No recent visits yet.</div>
            ) : (
              <div className="p-4 space-y-2">
                {recentVisits.map(visit => (
                  <div
                    key={visit.id}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="w-14 h-14 rounded-xl bg-[#0b1a2c] flex flex-col items-center justify-center shrink-0 text-center">
                      <span className="text-[11px] font-bold text-white leading-tight">
                        {(visit.time || visit.appointment_time || "").replace(" ", "\n")}
                      </span>
                      <span className="text-[9px] text-slate-400 mt-0.5">
                        {visit.date || visit.appointment_date}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {visit.doctor || visit.doctor_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{visit.reason || "—"}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full shrink-0">
                      {visit.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>


        {/* RIGHT column — Quick Actions only */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Quick Actions</h2>
            </div>
            <div className="p-3 space-y-1.5">
              {quickActions.map(({ label, icon: Icon, to }) => (
                <NavLink
                  key={label}
                  to={to}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all duration-150 text-left group"
                >
                  <Icon className="text-[15px] text-slate-500 group-hover:text-emerald-600 transition-colors shrink-0" />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                    {label}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}


export default PatientDashboard
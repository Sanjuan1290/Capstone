import { useEffect, useState } from 'react'
import { getDoctors, createDoctor, toggleDoctor } from '../../services/admin.service'
import {
  MdSearch, MdClose, MdAdd, MdPerson, MdEmail,
  MdPhone, MdChevronRight, MdEdit, MdBlock,
  MdCheck, MdVisibility, MdVisibilityOff, MdArrowBack,
  MdMedicalServices, MdFace, MdScience
} from "react-icons/md"

const SPECIALTIES = ["Dermatologist", "General Practitioner", "Cosmetic Dermatology", "Internal Medicine", "Pediatrician", "OB-GYN"]

const AddModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ full_name: "", specialty: "Dermatologist", type: "derma", email: "", phone: "", prc: "", password: "" })
  const [showPass, setShowPass] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.full_name.trim() && form.email.trim() && form.prc.trim() && form.password.trim()

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onAdd(form)
      onClose()
    } catch (err) {
      console.error("Failed to create doctor:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div><p className="text-sm font-bold text-slate-800">Add Doctor Account</p><p className="text-xs text-slate-500 mt-0.5">PRC license number required</p></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose className="text-[18px]" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {[
            { k: "full_name", l: "Full Name (with title)", t: "text", p: "e.g. Dr. Juan Santos" },
            { k: "email", l: "Email", t: "email", p: "e.g. juan@carait.com" },
            { k: "phone", l: "Phone", t: "tel", p: "09171234567" },
            { k: "prc", l: "PRC License No.", t: "text", p: "e.g. PRC-001234" },
          ].map(({ k, l, t, p }) => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{l} <span className="text-red-400">*</span></label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={p}
                className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Specialty</label>
            <select value={form.specialty} onChange={set("specialty")}
              className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400">
              {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Clinic Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: "derma", l: "Dermatology" }, { v: "medical", l: "General Medicine" }].map(({ v, l }) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))}
                  className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all
                    ${form.type === v ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Password <span className="text-red-400">*</span></label>
            <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400">
              <input type={showPass ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="Set initial password"
                className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
              <button type="button" onClick={() => setShowPass(s => !s)} className="text-slate-400 hover:text-slate-600">
                {showPass ? <MdVisibilityOff className="text-[15px]" /> : <MdVisibility className="text-[15px]" />}
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button disabled={!valid || isSubmitting}
            onClick={handleSubmit}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl">
            {isSubmitting ? "Creating..." : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  )
}

const DetailPanel = ({ doctor, onClose, onToggle }) => {
  if (!doctor) return null
  const Icon = doctor.type === "derma" ? MdFace : MdMedicalServices
  const isActive = doctor.is_active === 1

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden"><MdArrowBack className="text-[18px]" /></button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${doctor.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Icon className={`text-[18px] ${doctor.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{doctor.full_name}</p>
          <p className="text-xs text-slate-500">{doctor.specialty} · <span className="font-mono">{doctor.id}</span></p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0
          ${isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
          {isActive ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Info</p>
          {[
            { icon: MdEmail, label: "Email", value: doctor.email },
            { icon: MdPhone, label: "Phone", value: doctor.phone || "N/A" },
            { icon: MdScience, label: "PRC License", value: doctor.prc },
            { icon: MdPerson, label: "Joined", value: doctor.created_at ? new Date(doctor.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "N/A" },
          ].map(({ icon: I, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <I className="text-[13px] text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-slate-800">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="px-6 pb-6 pt-4 border-t border-slate-100 space-y-2 shrink-0">
        <button className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
          <MdEdit className="text-[14px]" /> Edit Account
        </button>
        <button onClick={() => onToggle(doctor.id)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-colors
            ${isActive ? "text-red-500 bg-red-50 border border-red-200 hover:bg-red-100" : "text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"}`}>
          {isActive ? <><MdBlock className="text-[14px]" /> Deactivate</> : <><MdCheck className="text-[14px]" /> Activate</>}
        </button>
      </div>
    </div>
  )
}

const Admin_DoctorAccount = () => {
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    getDoctors()
      .then(data => {
        setDoctors(data)
        if (data.length > 0) setSelected(data[0])
      })
      .catch(err => console.error("Error loading doctors:", err))
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (id) => {
    try {
      const res = await toggleDoctor(id)
      setDoctors(prev => prev.map(d => d.id === id ? { ...d, is_active: res.is_active } : d))
      setSelected(prev => prev?.id === id ? { ...prev, is_active: res.is_active } : prev)
    } catch (err) {
      alert("Failed to update status.")
    }
  }

  const handleAdd = async (formData) => {
    const newDoc = await createDoctor(formData)
    setDoctors(prev => [...prev, newDoc])
    if (!selected) setSelected(newDoc)
  }

  const filtered = doctors.filter(d => {
    const fullName = d.full_name || ""
    const specialty = d.specialty || ""
    return !search || 
           fullName.toLowerCase().includes(search.toLowerCase()) || 
           specialty.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-slate-800">Doctor Accounts</h1><p className="text-sm text-slate-500 mt-0.5">Manage doctor profiles and clinic permissions.</p></div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> Add Doctor
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm" style={{ minHeight: "500px" }}>
        {/* List Section */}
        <div className={`flex flex-col border-r border-slate-100 w-full lg:w-[360px] shrink-0 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-amber-400 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or specialty…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500"><MdClose className="text-[13px]" /></button>}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm italic">Loading accounts...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">No doctors found.</div>
            ) : filtered.map(doc => {
              const Icon = doc.type === "derma" ? MdFace : MdMedicalServices
              const isActive = doc.is_active === 1
              return (
                <button key={doc.id} onClick={() => setSelected(doc)}
                  className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all
                    ${selected?.id === doc.id ? "border-l-amber-400 bg-slate-50" : "border-l-transparent hover:bg-slate-50/70"}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${doc.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                    <Icon className={`text-[16px] ${doc.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{doc.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{doc.specialty}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full
                      ${isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"}`}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                    <MdChevronRight className={`text-[14px] ${selected?.id === doc.id ? "text-slate-500" : "text-slate-300"}`} />
                  </div>
                </button>
              )
            })}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{filtered.length} of {doctors.length} doctors</p>
          </div>
        </div>

        {/* Detail Section */}
        <div className={`flex flex-col flex-1 min-w-0 ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? (
            <DetailPanel doctor={doctors.find(d => d.id === selected.id)} onClose={() => setSelected(null)} onToggle={handleToggle} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                <MdMedicalServices className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-600">Select a doctor account</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Choose a profile from the list to view full credentials or manage status.</p>
            </div>
          )}
        </div>
      </div>
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

export default Admin_DoctorAccount
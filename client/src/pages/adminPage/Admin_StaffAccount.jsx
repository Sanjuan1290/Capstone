import { useState } from "react"
import {
  MdSearch, MdClose, MdAdd, MdPerson, MdEmail,
  MdPhone, MdChevronRight, MdEdit, MdBlock,
  MdCheck, MdVisibility, MdVisibilityOff, MdArrowBack
} from "react-icons/md"

const initialStaff = [
  { id: "STF-001", name: "Ana Reyes",      email: "ana.reyes@carait.com",    phone: "09171234567", status: "active",   joinDate: "Jan 10, 2024" },
  { id: "STF-002", name: "Mark Santos",    email: "mark.santos@carait.com",  phone: "09281234567", status: "active",   joinDate: "Mar 5, 2024"  },
  { id: "STF-003", name: "Liza Cruz",      email: "liza.cruz@carait.com",    phone: "09351234567", status: "active",   joinDate: "Jun 1, 2024"  },
  { id: "STF-004", name: "Ben Torres",     email: "ben.torres@carait.com",   phone: "09161234567", status: "inactive", joinDate: "Sep 15, 2023" },
  { id: "STF-005", name: "Claire Manalo",  email: "claire.m@carait.com",     phone: "09491234567", status: "active",   joinDate: "Feb 20, 2025" },
]

const AddModal = ({ onClose, onAdd }) => {
  const [form,     setForm]     = useState({ name:"", email:"", phone:"", password:"" })
  const [showPass, setShowPass] = useState(false)
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const valid = form.name.trim() && form.email.trim() && form.password.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div><p className="text-sm font-bold text-slate-800">Add Staff Account</p><p className="text-xs text-slate-500 mt-0.5">Account credentials will be shared with staff</p></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose className="text-[18px]" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {[
            { k:"name",  l:"Full Name",  t:"text",     p:"e.g. Ana Reyes"            },
            { k:"email", l:"Email",      t:"email",    p:"e.g. ana@carait.com"        },
            { k:"phone", l:"Phone",      t:"tel",      p:"e.g. 09171234567"           },
          ].map(({k,l,t,p}) => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{l} <span className="text-red-400">*</span></label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={p}
                className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Password <span className="text-red-400">*</span></label>
            <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400 transition-colors">
              <input type={showPass?"text":"password"} value={form.password} onChange={set("password")} placeholder="Set initial password"
                className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
              <button type="button" onClick={() => setShowPass(s=>!s)} className="text-slate-400 hover:text-slate-600">
                {showPass ? <MdVisibilityOff className="text-[15px]" /> : <MdVisibility className="text-[15px]" />}
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button disabled={!valid} onClick={() => { onAdd({...form, id:`STF-00${Date.now()}`, status:"active", joinDate: new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}); onClose() }}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl">
            Create Account
          </button>
        </div>
      </div>
    </div>
  )
}

const DetailPanel = ({ staff, onClose, onToggle }) => {
  if (!staff) return null
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden"><MdArrowBack className="text-[18px]" /></button>
        <div className="w-10 h-10 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-amber-400 font-bold text-sm shrink-0">
          {staff.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{staff.name}</p>
          <p className="text-xs text-slate-500 font-mono">{staff.id}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0
          ${staff.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
          {staff.status === "active" ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Info</p>
          {[
            { icon: MdEmail, label:"Email",    value: staff.email    },
            { icon: MdPhone, label:"Phone",    value: staff.phone    },
            { icon: MdPerson,label:"Joined",   value: staff.joinDate },
          ].map(({icon:Icon,label,value}) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <Icon className="text-[13px] text-slate-400" />
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
        <button onClick={() => onToggle(staff.id)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-colors
            ${staff.status === "active" ? "text-red-500 bg-red-50 border border-red-200 hover:bg-red-100" : "text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"}`}>
          {staff.status === "active" ? <><MdBlock className="text-[14px]" /> Deactivate Account</> : <><MdCheck className="text-[14px]" /> Activate Account</>}
        </button>
      </div>
    </div>
  )
}

const Admin_StaffAccount = () => {
  const [staff,     setStaff]     = useState(initialStaff)
  const [search,    setSearch]    = useState("")
  const [selected,  setSelected]  = useState(initialStaff[0])
  const [showAdd,   setShowAdd]   = useState(false)
  const [filter,    setFilter]    = useState("all")

  const filtered = staff.filter(s => {
    const matchFilter = filter === "all" || s.status === filter
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const handleToggle = id => setStaff(prev => prev.map(s => s.id === id ? {...s, status: s.status==="active"?"inactive":"active"} : s))

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Accounts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create and manage clinic staff accounts.</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> Add Staff
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex" style={{minHeight:"520px"}}>
        {/* List */}
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[360px] shrink-0">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-300">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or email…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && <button onClick={()=>setSearch("")} className="text-slate-300 hover:text-slate-500"><MdClose className="text-[13px]" /></button>}
            </div>
            <div className="flex gap-1">
              {[{k:"all",l:"All"},{k:"active",l:"Active"},{k:"inactive",l:"Inactive"}].map(({k,l}) => (
                <button key={k} onClick={()=>setFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                    ${filter===k ? "bg-[#0b1a2c] text-amber-400" : "text-slate-500 hover:bg-slate-100"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.map(s => (
              <button key={s.id} onClick={()=>setSelected(s)}
                className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all
                  ${selected?.id===s.id ? "border-l-amber-400 bg-slate-50" : "border-l-transparent hover:bg-slate-50/70"}`}>
                <div className="w-9 h-9 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                  {s.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 truncate">{s.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full
                    ${s.status==="active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"}`}>
                    {s.status==="active"?"Active":"Inactive"}
                  </span>
                  <MdChevronRight className={`text-[14px] ${selected?.id===s.id?"text-slate-500":"text-slate-300"}`} />
                </div>
              </button>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">{filtered.length} of {staff.length} staff</p>
          </div>
        </div>

        {/* Detail */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {selected ? (
            <DetailPanel staff={staff.find(s=>s.id===selected.id)} onClose={()=>setSelected(null)} onToggle={handleToggle} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdPerson className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Select a staff member</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddModal onClose={()=>setShowAdd(false)} onAdd={s=>setStaff(p=>[...p,s])} />}
    </div>
  )
}
export default Admin_StaffAccount
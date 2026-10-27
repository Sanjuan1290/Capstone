import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MdMedicalServices, MdPeople } from 'react-icons/md'
import Admin_StaffAccount from './Admin_StaffAccount'
import Admin_DoctorAccount from './Admin_DoctorAccount'

const Admin_Accounts = () => {
  const [params,setParams]=useSearchParams()
  const tab=useMemo(()=>params.get('tab')==='doctors'?'doctors':'staff',[params])
  return <div className="mx-auto w-full max-w-7xl space-y-5">
    <div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdPeople className="text-amber-500"/> Accounts</h1><p className="mt-1 text-sm text-slate-500">Manage Staff and Doctor accounts from one place.</p></div>
    <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
      <button onClick={()=>setParams({tab:'staff'})} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab==='staff'?'bg-[#0b1a2c] text-white':'text-slate-500 hover:bg-slate-50'}`}><MdPeople/> Staff</button>
      <button onClick={()=>setParams({tab:'doctors'})} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab==='doctors'?'bg-[#0b1a2c] text-white':'text-slate-500 hover:bg-slate-50'}`}><MdMedicalServices/> Doctors</button>
    </div>
    <div>{tab==='staff'?<Admin_StaffAccount embedded/>:<Admin_DoctorAccount embedded/>}</div>
  </div>
}
export default Admin_Accounts

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdDashboard, MdMedicalServices, MdCalendarToday, MdEventAvailable, MdSettings } from 'react-icons/md'
import { useAuth } from '../context/AuthContext'

const STEPS=[
 {title:'Welcome to your Patient Portal',body:'Your dashboard shows upcoming appointments, clinic updates, and your recent activity.',path:'/patient',Icon:MdDashboard},
 {title:'Check Doctor Availability',body:'See each doctor’s clinic days and available or booked appointment slots before choosing a schedule.',path:'/patient/doctors',Icon:MdMedicalServices},
 {title:'Book an Appointment',body:'Choose the clinic type, doctor, available schedule, and reason for your visit.',path:'/patient/book',Icon:MdCalendarToday},
 {title:'Manage Your Appointments',body:'View confirmed or pending appointments and cancel or request a reschedule when needed.',path:'/patient/appointments',Icon:MdEventAvailable},
 {title:'Keep Your Profile Updated',body:'Update your personal details, contact information, password, profile photo, and theme in Settings.',path:'/patient/settings',Icon:MdSettings},
]
const PatientOnboardingTour=()=>{const {user,setUser}=useAuth();const nav=useNavigate();const [i,setI]=useState(0);if(!user?.is_profile_complete||user?.onboarding_completed_at)return null;const step=STEPS[i],Icon=step.Icon;const finish=async()=>{await fetch('/api/patient/onboarding/complete',{method:'PATCH',credentials:'include'}).catch(()=>{});setUser(p=>({...p,onboarding_completed_at:new Date().toISOString()}))};const go=idx=>{setI(idx);nav(STEPS[idx].path)};return <div className="fixed inset-0 z-[100] bg-slate-950/45 backdrop-blur-[1px]"><div className="absolute bottom-6 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-3xl border border-white/20 bg-white p-6 shadow-2xl sm:bottom-10"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Icon className="text-xl"/></div><div><p className="text-xs font-black uppercase tracking-widest text-emerald-600">Quick Tour · {i+1} of {STEPS.length}</p><h2 className="mt-1 text-lg font-black text-slate-900">{step.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p></div></div><div className="mt-6 flex items-center justify-between"><button onClick={finish} className="text-sm font-semibold text-slate-400">Skip Tour</button><div className="flex gap-2">{i>0&&<button onClick={()=>go(i-1)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Previous</button>}<button onClick={()=>i===STEPS.length-1?finish():go(i+1)} className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-bold text-white">{i===STEPS.length-1?'Finish':'Next'}</button></div></div></div></div>}
export default PatientOnboardingTour




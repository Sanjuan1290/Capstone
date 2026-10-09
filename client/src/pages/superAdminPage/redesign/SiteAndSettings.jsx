import AdminLandingPage from '../../adminPage/Admin_LandingPage'
import SettingsPage from '../../shared/SettingsPage'
import {MdOpenInNew,MdSecurity,MdLanguage} from 'react-icons/md'
import {PageHead,Banner} from './shared'

export const SuperAdminLandingPage=()=> <div className="space-y-6">
  <PageHead title="Landing Page Manager" description="Manage the public website for all Carait Clinic locations." action={<a className="button-secondary inline-flex items-center gap-2" href="/" target="_blank" rel="noopener noreferrer"><MdOpenInNew/> Preview Public Site</a>}/>
  <Banner type="info" title="Changes affect the public website">Content edited here is shared across the clinic network. Review branch addresses, contact details and links before saving. Open the public preview to confirm the result.</Banner>
  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4"><div className="flex items-start gap-3"><MdLanguage className="mt-0.5 shrink-0 text-amber-600" size={23}/><div><h2 className="font-bold text-slate-900">Website Content</h2><p className="mt-1 text-sm text-slate-500">Use the existing content editor below. Branch-specific operations are managed in Clinic Branches, not on this page.</p></div></div></div>
  <AdminLandingPage/>
 </div>

export const SuperAdminSettings=()=> <div className="space-y-6">
  <PageHead title="Account & Security Settings" description="Manage your Super Admin profile, verification and personal account preferences."/>
  <Banner type="info" title="Organization-level account">These settings affect your Super Admin identity. To manage a Branch Administrator, go to Accounts & Access.</Banner>
  <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4"><div className="flex items-start gap-3"><MdSecurity className="mt-0.5 shrink-0 text-teal-700" size={23}/><div><h2 className="font-bold text-slate-900">Profile & Security</h2><p className="mt-1 text-sm text-slate-500">Use the original secure verification process to change sensitive account information. Existing account and password safeguards remain in place.</p></div></div></div>
  <SettingsPage/>
 </div>

import { Outlet } from 'react-router-dom'
import { MdSettings } from 'react-icons/md'
import SystemSetupTabs from '../../components/system/SystemSetupTabs'

const Admin_SystemSetupBilling = () => (
  <div className="mx-auto w-full max-w-7xl space-y-5">
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdSettings className="text-amber-500" /> System Setup</h1>
      <p className="mt-1 text-sm text-slate-500">Manage patient visit options, billing configuration, service references, and inventory setup from one place.</p>
    </div>
    <SystemSetupTabs />
    <Outlet />
  </div>
)

export default Admin_SystemSetupBilling

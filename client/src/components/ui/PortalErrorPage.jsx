import { Link, useLocation } from 'react-router-dom'
import { MdErrorOutline, MdRefresh, MdDashboard } from 'react-icons/md'

// A user-safe fallback for rendering failures inside the branch operations UI.
// Technical details stay in developer tooling instead of being shown to clinic staff.
export default function PortalErrorPage() {
  const { pathname } = useLocation()
  const selectedBranch = pathname.match(/^\/superadmin\/branches\/\d+/)?.[0]
  const dashboard = selectedBranch || '/admin'
  return (
    <main role="alert" className="flex min-h-[60vh] items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-rose-100 bg-white p-6 text-center shadow-sm">
        <MdErrorOutline className="mx-auto text-4xl text-rose-500" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">This page could not be displayed</h1>
        <p className="mt-2 text-sm text-slate-600">The clinic system could not display this section. Your payment or record status has not been confirmed by this screen. Check the record before repeating an action.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className="button-secondary" onClick={() => window.location.reload()}><MdRefresh /> Reload page</button>
          <Link to={dashboard} className="button-primary"><MdDashboard /> Back to dashboard</Link>
        </div>
      </div>
    </main>
  )
}

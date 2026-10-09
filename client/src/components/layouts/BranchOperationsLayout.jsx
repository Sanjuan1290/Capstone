import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { fetchJson, Banner } from '../../pages/superAdminPage/redesign/shared'
import AdminLayout from './AdminLayout'

// The pre-branch AdminLayout is the single visual source of truth for branch operations.
// Branch data is still resolved server-side; only validated branch IDs are passed to the UI.
export default function BranchOperationsLayout({ admin = false }) {
  const { branchId } = useParams()
  const [state, setState] = useState({ loading: true, branch: null, permissions: [], error: '' })
  const base = admin ? '/admin' : `/superadmin/branches/${branchId}`
  useEffect(() => {
    let active = true
    setState({ loading: true, branch: null, permissions: [], error: '' })
    fetchJson(admin ? '/me' : '/')
      .then(data => {
        if (!active) return
        const result = admin ? data : data.find(b => Number(b.id) === Number(branchId))
        if (!result) throw new Error('This clinic branch could not be found.')
        setState({ loading: false, branch: admin
          ? { id: result.branch_id, name: result.branch_name }
          : result, permissions: admin ? (result.permissions || []) : null, error: '' })
      })
      .catch(error => { if (active) setState({ loading: false, branch: null, permissions: [], error: error.message }) })
    return () => { active = false }
  }, [admin, branchId])
  if (state.loading) return <div className="p-10 text-sm text-slate-600" role="status">Loading clinic branch…</div>
  if (state.error) return <div className="mx-auto max-w-xl p-10"><Banner>{state.error}</Banner><NavLink to={admin?'/admin/login':'/superadmin/branches'} className="button-secondary mt-4">Go back</NavLink></div>
  return <AdminLayout base={base} branch={state.branch} superBranch={!admin} permissions={state.permissions} />
}

// Preserve the selected clinic when navigating from Super Admin's branch workspace.
// This is UI routing only; backend branch authorization is still enforced server-side.
export const branchPortalPath = (path, pathname = '') => {
  const branch = String(pathname).match(/^\/superadmin\/branches\/(\d+)(?=\/|$)/)
  if (!branch || !String(path).startsWith('/admin')) return path
  return String(path).replace(/^\/admin(?=\/|\?|$)/, `/superadmin/branches/${branch[1]}`)
}


// Use the active URL to retain the selected Super Admin branch across service workflows.
// Permissions are enforced by protected routes and the server, not by this helper.
export const portalBaseForPath = (pathname = '') => {
  const match = String(pathname).match(/^\/superadmin\/branches\/(\d+)(?=\/|$)/)
  if (match) return `/superadmin/branches/${match[1]}`
  return /^\/staff(?=\/|$)/.test(pathname) ? '/staff' : '/admin'
}
export const canManageServicePricingAtPath = (pathname = '') => portalBaseForPath(pathname) !== '/staff'


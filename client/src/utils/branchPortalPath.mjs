// Preserve the selected clinic when navigating from Super Admin's branch workspace.
// This is UI routing only; backend branch authorization is still enforced server-side.
export const branchPortalPath = (path, pathname = '') => {
  const branch = String(pathname).match(/^\/superadmin\/branches\/(\d+)(?=\/|$)/)
  if (!branch || !String(path).startsWith('/admin')) return path
  return String(path).replace(/^\/admin(?=\/|\?|$)/, `/superadmin/branches/${branch[1]}`)
}

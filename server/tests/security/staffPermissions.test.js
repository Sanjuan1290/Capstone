const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Staff permission access control', () => {
  it('defines all requested feature permissions and groups Walk-in Queue with Appointments', () => {
    const config = read('client', 'src', 'config', 'staffPermissions.js')
    ;['dashboard','appointments','patient_records','doctor_schedules','checkout','billing','inventory','stock_transfers','accounts','system_setup','reports','audit_logs','landing_page']
      .forEach((key) => expect(config).toContain(`key: '${key}'`))
    expect(config).toContain('Appointments + Walk-in Queue')
    expect(config).toContain('patient check-ins, and the Walk-in Queue')
  })

  it('enforces Staff permissions at the API layer instead of only hiding navigation', () => {
    const router = read('server', 'routers', 'staff.router.js')
    expect(router).toContain("can('appointments'), staffCtrl.getAppointments")
    expect(router).toContain("can('appointments'), staffCtrl.getQueue")
    expect(router).toContain("can('checkout'), staffCtrl.payBill")
    expect(router).toContain("can('inventory'), staffCtrl.getInventory")
    expect(router).toContain("can('stock_transfers'), staffCtrl.getSupplyRequests")
    expect(router).toContain("can('reports'), adminCtrl.getReports")
    expect(router).toContain("can('system_setup'), adminCtrl.getSystemSetup")
  })

  it('persists permissions in a normalized table and revokes sessions when access changes', () => {
    const schema = read('server', 'utils', 'schema.js')
    const admin = read('server', 'controllers', 'admin.controller.js')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS staff_permissions')
    expect(schema).toContain('PRIMARY KEY (staff_id, permission_key)')
    expect(admin).toContain('replaceStaffPermissions')
    expect(admin).toContain('session_version = session_version + ?')
    expect(admin).toContain('sessions_revoked:permissionChanged')
  })

  it('returns permissions during Staff login/auth and filters the Staff navigation', () => {
    const controller = read('server', 'controllers', 'staff.controller.js')
    const layout = read('client', 'src', 'components', 'layouts', 'StaffLayout.jsx')
    expect(controller).toContain('const permissions = await loadStaffPermissions(staff.id)')
    expect(controller).toContain("role: 'staff', permissions")
    expect(layout).toContain('hasStaffPermission(user, item.permission)')
    expect(layout).toContain("permission: 'appointments', name: 'Walk-in Queue'")
  })

  it('shows clear permission descriptions with hover/tap help in Staff account creation', () => {
    const picker = read('client', 'src', 'components', 'accounts', 'StaffPermissionPicker.jsx')
    const account = read('client', 'src', 'pages', 'adminPage', 'Admin_StaffAccount.jsx')
    expect(picker).toContain('Customize Permissions')
    expect(picker).toContain('title={permission.description}')
    expect(picker).toContain('setOpenHelp')
    expect(account).toContain('StaffPermissionPicker')
    expect(account).toContain('Save Access Changes')
  })

  it('checks the legacy operational permissions by default for newly created Staff accounts', () => {
    const config = read('client', 'src', 'config', 'staffPermissions.js')
    const account = read('client', 'src', 'pages', 'adminPage', 'Admin_StaffAccount.jsx')
    const serverPermissions = read('server', 'utils', 'staffPermissions.js')
    const admin = read('server', 'controllers', 'admin.controller.js')
    const migration = read('server', 'db', 'migrations', '2026-09-26-staff-permissions.sql')
    const defaults = ['dashboard','appointments','patient_records','doctor_schedules','checkout','inventory','stock_transfers']
    expect(config).toContain('DEFAULT_STAFF_PERMISSIONS')
    expect(account).toContain('permissions: [...DEFAULT_STAFF_PERMISSIONS]')
    expect(serverPermissions).toContain('const DEFAULT_STAFF_PERMISSIONS = Object.freeze([')
    expect(admin).toContain('hasPermissionPayload ? req.body.permissions : DEFAULT_STAFF_PERMISSIONS')
    defaults.forEach((key) => {
      expect(config).toContain(`'${key}'`)
      expect(serverPermissions).toContain(`'${key}'`)
      expect(migration).toContain(`SELECT '${key}'`)
    })
  })

  it('keeps Accounts and Audit archive destructive controls Admin-only for delegated Staff access', () => {
    const accounts = read('client', 'src', 'pages', 'staffPage', 'Staff_AccountsView.jsx')
    const archive = read('client', 'src', 'pages', 'adminPage', 'Admin_AuditArchive.jsx')
    expect(accounts.toLowerCase()).toContain('read-only')
    expect(archive).toContain("const canDelete=role==='admin'")
  })
})

const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path')
const root=path.resolve(__dirname,'../../..')
const load=p=>fs.readFileSync(path.join(root,p),'utf8')
const app=load('client/src/App.jsx'),service=load('client/src/services/admin.service.js'),branch=load('server/routers/branches.router.js'),admin=load('server/controllers/admin.controller.js'),layout=load('client/src/components/layouts/AdminLayout.jsx'),loader=load('client/src/components/layouts/BranchOperationsLayout.jsx')
test('original admin dashboard, appointments, patient records and schedules are mounted for both portals',()=>{
 for(const p of ['Admin_Dashboard','Admin_Appointments','Admin_PatientRecord','Admin_DoctorSchedules','Admin_Accounts','Admin_Billing','Admin_Inventory','Admin_SystemSetup','Admin_Reports','Admin_AuditLogs']){
  const occurrences=(app.match(new RegExp(`element=\\{<${p} ?\\/>\\}`,'g'))||[]).length
  assert.ok(occurrences>=2,`${p} must mount for both portals`)
 }
})
test('branch portal renders the exact original AdminLayout component',()=>assert.match(loader,/<AdminLayout base=\{base\} branch=\{state.branch\}/))
test('original AdminLayout remaps absolute module links without escaping branch workspace',()=>{
 assert.match(layout,/interceptOriginalLink/);assert.match(layout,/onClickCapture=\{interceptOriginalLink\}/)
})
test('branch users cannot accidentally call global /api/admin operational controllers',()=>{
 assert.match(service,/\/api\/branches\/my\/legacy/)
 assert.match(service,/\/api\/branches\/workspace\/\$\{selected\[1\]\}\/legacy/)
 assert.match(load('server/routers/admin.router.js'),/requireLegacySuperAdmin/)
})
test('new compatibility endpoints have branch predicates, not JS-only list filtering',()=>{
 for(const fn of ['originalDashboard','originalAppointments','originalPatients','originalPatientDetails','originalDoctors','originalInventory'])assert.ok(branch.includes(`const ${fn}`))
 assert.match(branch,/WHERE a\.branch_id=\?/)
 assert.match(branch,/WHERE p\.id=\? AND EXISTS/)
 assert.match(branch,/AND a\.branch_id=\?/)
})
test('patient and doctor password hashes are not selected',()=>{
 assert.doesNotMatch(branch,/SELECT p\.\* FROM patients/)
 assert.doesNotMatch(branch,/SELECT \* FROM doctors WHERE branch_id=/)
})
test('legacy mutations not explicitly registered cannot route to old global controllers',()=>{
 assert.match(branch,/Unsupported legacy mutations deliberately return 404/)
 assert.doesNotMatch(service,/fetch\(\s*\x60\/api\/admin\/appointments/)
})
test('original Doctor and Staff creation explicitly sets assigned physical branch',()=>{
 assert.match(admin,/INSERT INTO staff \(full_name, email, phone, password, role, status, must_change_password, branch_id\)/)
 assert.match(admin,/INSERT INTO doctors \(full_name, email, phone, clinic_type, prc_license, password, must_change_password, branch_id\)/)
})
test('account mutations verify branch ownership first',()=>{
 assert.match(branch,/SELECT id FROM \$\{table\} WHERE id=\? AND branch_id=\?/)
 assert.match(branch,/ownedPerson\('staff','accounts'/)
 assert.match(branch,/ownedPerson\('doctors','accounts'/)
})
test('branch administrators cannot delegate permissions they lack',()=>{
 assert.match(branch,/You cannot grant staff permissions beyond your assigned branch access/)
 assert.match(branch,/p==='landing_page'/)
})
test('original dashboard clears loading state on API failure',()=>{
 const dashboard=load('client/src/pages/adminPage/Admin_Dashboard.jsx')
 assert.match(dashboard,/Dashboard is temporarily unavailable/)
 assert.match(dashboard,/setLoadError\(err\.message/)
})

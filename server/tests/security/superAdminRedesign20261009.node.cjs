// Dependency-free regression contracts for the Super Admin redesign.
// These tests check source wiring; real API and UI integration must still run in staging.
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('fs'),path=require('path')
const root=path.join(__dirname,'../../..')
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
const pages='client/src/pages/superAdminPage/redesign/'
const router=read('server/routers/branches.router.js')
test('frontend protects against HTML response being treated as JSON',()=>{
 const shared=read(pages+'shared.jsx')
 assert.match(shared,/content-type/)
 assert.match(shared,/application\/json/)
 assert.match(shared,/backend is running and the API proxy/)
})
test('dashboard and reports separate billed from collected and have date selectors',()=>{
 const ui=read(pages+'Overview.jsx')
 assert.match(ui,/Collected Revenue/)
 assert.match(ui,/Billed Amount/)
 assert.match(ui,/Custom dates/)
 assert.match(router,/billing_payments p JOIN billing_records br/)
 assert.match(router,/p\.status='completed'/)
})
test('branch manager uses modal and branch-aware readiness',()=>{
 const ui=read(pages+'Branches.jsx')
 assert.match(ui,/Create Clinic Branch/)
 assert.match(ui,/Deactivate Branch/)
 assert.match(ui,/analytics\/readiness/)
 assert.match(router,/upcoming or active appointment/)
})
test('admin reassignment requires a distinct confirmation',()=>{
 const ui=read(pages+'Accounts.jsx')
 assert.match(ui,/Confirm Branch Reassignment/)
 assert.match(ui,/session/)
 assert.match(ui,/invitation_sent===false/)
})
test('audit views are paginated and redact sensitive details',()=>{
 const ui=read(pages+'Audits.jsx')
 assert.match(ui,/paginated:'1'/)
 assert.match(ui,/redact/)
 assert.match(router,/LIMIT \? OFFSET \?/)
})
test('Super Admin and Branch Admin layouts preserve separate workflows',()=>{
 const ui=read('client/src/pages/superAdminPage/BranchPortals.jsx')
 assert.match(ui,/SuperAdminLayout/)
 assert.match(ui,/BranchAdminLayout/)
 assert.match(ui,/BranchWorkspace/)
})

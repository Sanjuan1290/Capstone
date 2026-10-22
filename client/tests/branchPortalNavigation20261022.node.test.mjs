import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { branchPortalPath } from '../src/utils/branchPortalPath.mjs'
const read = (name) => readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8')
test('branch workspace billing tabs stay in the selected branch',()=>{
 const path='/superadmin/branches/1/billing?tab=overview'
 assert.equal(branchPortalPath('/admin/billing/approvals',path),'/superadmin/branches/1/billing/approvals')
 assert.equal(branchPortalPath('/admin/billing/reconciliation',path),'/superadmin/branches/1/billing/reconciliation')
 assert.equal(branchPortalPath('/admin/billing?tab=overview',path),'/superadmin/branches/1/billing?tab=overview')
 assert.equal(branchPortalPath('/admin/billing/transactions/321',path),'/superadmin/branches/1/billing/transactions/321')
})
test('ordinary Branch Admin navigation is unchanged',()=>{
 assert.equal(branchPortalPath('/admin/billing/approvals','/admin/billing'),'/admin/billing/approvals')
 assert.equal(branchPortalPath('/news','/superadmin/branches/1'),' /news'.trim())
})
test('Billing navigation and related action links resolve using the selected branch',()=>{
 const nav=read('components/billing/AdminBillingNav.jsx')
 const overview=read('pages/adminPage/Admin_Billing.jsx')
 assert.match(nav,/to=\{branchPortalPath\(item.path, location.pathname\)\}/)
 assert.match(overview,/to=\{portalPath\(item.to\)\}/)
 assert.match(overview,/to=\{portalPath\(issue.to\)\}/)
})

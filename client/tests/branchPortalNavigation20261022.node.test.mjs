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



test('billing transaction and checkout action links preserve selected superadmin branch',()=>{
 const app=read('App.jsx')
 assert.equal((app.match(/path='billing\/transactions\/:billingId'/g)||[]).length,2)
 assert.doesNotMatch(app,/path='billing\/transactions\/:id'/)
 for(const file of ['pages/adminPage/Admin_BillingTransactions.jsx','pages/adminPage/Admin_BillingTransactionDetail.jsx','pages/adminPage/Admin_Checkout.jsx']){
   const contents=read(file)
   assert.match(contents,/branchPortalPath\(path, location\.pathname\)/)
   assert.doesNotMatch(contents,/to=[{]?`?\/admin\/billing\/(?:checkout|transactions)/)
 }
 for(const current of ['/admin/billing/transactions','/superadmin/branches/2/billing/transactions']){
   const prefix=current.startsWith('/admin')?'/admin':'/superadmin/branches/2'
   assert.equal(branchPortalPath('/admin/billing/transactions/12',current),`${prefix}/billing/transactions/12`)
   assert.equal(branchPortalPath('/admin/billing/checkout/12',current),`${prefix}/billing/checkout/12`)
 }
})
test('transaction details reject invalid billing ids without network retry',()=>{
 const content=read('pages/adminPage/Admin_BillingTransactionDetail.jsx')
 assert.match(content,/Number\.isSafeInteger\(parsedBillingId\)/)
 assert.match(content,/if \(!validBillingId\) return/)
 assert.match(content,/if \(!validBillingId\) return <div/)
 assert.match(content,/message="Transaction not found\."/)
 assert.match(content,/Back to Transactions/)
})
test('doctor Today and Upcoming indicators use independent dashboard totals',()=>{
 const content=read('pages/doctorPage/Doctor_Appointments.jsx')
 assert.match(content,/Number\(summary\.remainingToday \?\? 0\)/)
 assert.match(content,/Number\(summary\.upcomingCount \?\? 0\)/)
 assert.doesNotMatch(content,/remainingToday \|\| appointments\.filter/)
 assert.doesNotMatch(content,/upcomingCount \|\| \(viewMode/)
})

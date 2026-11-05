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
test('shared Billing navigation and action links retain the selected physical branch',async()=>{
 const {billingPortal}=await import('../src/utils/billingPortal.mjs')
 const portal=billingPortal('/superadmin/branches/2/billing/transactions/6')
 assert.equal(portal.base,'/superadmin/branches/2');assert.equal(portal.api,'/api/branches/workspace/2/legacy')
 assert.match(read('components/billing/BillingNav.jsx'),/billingPortal\(location.pathname\)/)
 assert.match(read('components/billing/BillingWorkspace.jsx'),/api.portal.base/)
 assert.match(read('components/billing/BillHistory.jsx'),/api.portal.base/)
 assert.equal((read('App.jsx').match(/path='billing\/transactions\/:billingId'/g)||[]).length,2)
})

test('billing transaction and checkout action links preserve selected superadmin branch',async()=>{
 const app=read('App.jsx')
 assert.doesNotMatch(app,/path='billing\/transactions\/:id'/)
 for(const current of ['/admin/billing/transactions','/superadmin/branches/2/billing/transactions']){
  const prefix=current.startsWith('/admin')?'/admin':'/superadmin/branches/2'
  assert.equal(branchPortalPath('/admin/billing/transactions/12',current),`${prefix}/billing/transactions/12`)
  assert.equal(branchPortalPath('/admin/billing/checkout/12',current),`${prefix}/billing/checkout/12`)
 }
 for(const file of ['components/billing/BillingWorkspace.jsx','components/billing/BillHistory.jsx'])assert.doesNotMatch(read(file),/to=[{]?`?\/admin\/billing\/(?:checkout|transactions)/)
 assert.match(read('components/billing/BillCheckout.jsx'),/const billingHome=`\$\{targetBase\}/)
})

test('transaction details reject invalid billing identifiers before issuing network requests',()=>{
 const content=read('components/billing/BillHistory.jsx')
 assert.match(content,/Number.isSafeInteger\(parsedBillingId\)/)
 assert.match(content,/if\(!validBillingId\)\{setLoading\(false\);return\}/)
 assert.match(content,/if\(!validBillingId\)return <ErrorState/)
})

test('doctor Today and Upcoming indicators use independent dashboard totals',()=>{
 const content=read('pages/doctorPage/Doctor_Appointments.jsx')
 assert.match(content,/Number\(summary\.remainingToday \?\? 0\)/)
 assert.match(content,/Number\(summary\.upcomingCount \?\? 0\)/)
 assert.doesNotMatch(content,/remainingToday \|\| appointments\.filter/)
 assert.doesNotMatch(content,/upcomingCount \|\| \(viewMode/)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { portalBaseForPath, canManageServicePricingAtPath } from '../src/utils/branchPortalPath.mjs'
import { destinationForAuthenticatedUser } from '../src/utils/guestNavigation.mjs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('service workflows retain the authorized portal and selected branch', () => {
  assert.equal(portalBaseForPath('/superadmin/branches/1/system-setup/billing/services/new'), '/superadmin/branches/1')
  assert.equal(portalBaseForPath('/superadmin/branches/203/system-setup?tab=service_categories'), '/superadmin/branches/203')
  assert.equal(portalBaseForPath('/admin/system-setup/billing/services'), '/admin')
  assert.equal(portalBaseForPath('/staff/system-setup/billing/services'), '/staff')
  assert.equal(canManageServicePricingAtPath('/staff/system-setup/billing/services'), false)
  assert.equal(canManageServicePricingAtPath('/superadmin/branches/1/system-setup/billing/services'), true)
})

test('service editor, catalog, System Setup and both tab bars use branch-preserving destinations', () => {
  for (const file of ['../src/pages/adminPage/Admin_BillingServiceForm.jsx', '../src/pages/adminPage/Admin_BillingCatalog.jsx', '../src/pages/adminPage/Admin_SystemSetup.jsx', '../src/components/billing/BillingSetupNav.jsx', '../src/components/system/SystemSetupTabs.jsx']) {
    assert.match(read(file), /portalBaseForPath\(location\.pathname\)/, file)
  }
  assert.doesNotMatch(read('../src/pages/adminPage/Admin_BillingServiceForm.jsx'), /location\.pathname\.startsWith\('\/staff'\)/)
})

test('guest login redirects respect active role, account identity and required password change', () => {
  assert.equal(destinationForAuthenticatedUser('superadmin', { account_role: 'superadmin' }), '/superadmin')
  assert.equal(destinationForAuthenticatedUser('admin', { account_role: 'admin' }), '/admin')
  assert.equal(destinationForAuthenticatedUser('staff', { must_change_password: 1 }), '/staff/change-password-required')
  assert.equal(destinationForAuthenticatedUser('doctor', { must_change_password: 1 }), '/doctor/change-password-required')
  assert.equal(destinationForAuthenticatedUser('admin', { account_role: 'admin', must_change_password: 1 }), '/admin/change-password-required')
  assert.equal(destinationForAuthenticatedUser('patient', {}), '/patient')
  assert.equal(destinationForAuthenticatedUser(null, null), null)
  assert.match(read('../src/App.jsx'), /path='\/superadmin\/login' element=\{<GuestOnlyRoute><SuperAdminLogin/)
})

test('booking state is preserved on transient API failures and submission is gated', () => {
  const source = read('../src/pages/patientPage/BookAppointment.jsx')
  assert.match(source, /Keep last known readiness and the user's draft/)
  assert.match(source, /const readinessRequestId = useRef\(0\)/)
  assert.match(source, /if \(bookingSubmissionLock\.current \|\| submitting \|\| !policyAccepted/)
  assert.doesNotMatch(source, /setBookingReadiness\(null\)\s*setReadinessError\(err\.message/)
})

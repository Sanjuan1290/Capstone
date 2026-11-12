// Synthetic-only execution of the actual guest controller. No DB or providers.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '../..')
const state = { patients: [], appointments: [], access: [], sentPatientMessages: 0 }
const conn = {
  beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
  query: async (sql, values = []) => {
    if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]]
    if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]]
    if (sql.startsWith('SELECT id FROM patients')) return [[state.patients.find(p => values.includes(p.phone))].filter(Boolean)]
    if (sql.startsWith('INSERT INTO patients')) {
      state.patients.push({ id: 1, phone: values[5], birthdate: values[1], reported_age: values[2], password: null })
      return [{ insertId: 1 }]
    }
    if (sql.startsWith('INSERT INTO appointments')) { state.appointments.push({ id: 1, patient_age_at_visit: values[8] }); return [{ insertId: 1 }] }
    if (sql.startsWith('INSERT INTO guest_booking_access')) { state.access.push({ id: values[0], token_hash: values[1] }); return [{ insertId: 1 }] }
    if (sql.startsWith('INSERT INTO patient_consents')) return [{ insertId: 1 }]
    throw Error(`Unexpected synthetic SQL: ${sql}`)
  },
}
const db = { getConnection: async () => conn, query: async sql => {
  if (sql.includes('FROM clinic_branches')) return [[{ id: 1, name: 'Synthetic branch', offers_medical: 1 }]]
  if (sql.includes('FROM doctors')) return [[{ id: 8, full_name: 'Synthetic doctor', clinic_type: 'medical' }]]
  if (sql.includes('FROM billing_service_catalog')) return [[{ id: 77, service_name: 'Synthetic service', default_price: 650, clinic_type: 'medical', average_duration_minutes: 60 }]]
  throw Error(`Unexpected synthetic SQL: ${sql}`)
} }
const dependencies = {
  crypto, '../db/connect': db,
  '../utils/phone': require('../../server/utils/phone'), '../utils/patientProfile': { validateBirthdate: () => null },
  '../utils/appointmentSecurity': { withAppointmentSlotLock: async (_, callback) => callback(), validateAppointmentSlot: async () => {} },
  '../utils/bookingPolicy': { loadBookingSettings: async () => ({ booking_start_interval_minutes: 30, online_min_lead_minutes: 720, pending_confirmation_cutoff_minutes: 60 }), roundReservedDurationMinutes: () => 60, buildConfirmationDeadlineSql: () => '2027-02-01 09:00:00' },
  '../utils/date': { getTodayDateOnly: () => '2026-11-12' },
  '../utils/notifications': { notifyRoles: async () => {} }, '../utils/sse': { broadcast() {} }, '../utils/audit': { writeAuditLog: async () => {} },
  '../utils/bookingReadiness': { getOnlineBookingReadiness: async () => ({}), applyBranchBookingOfferings: () => ({ medical: { bookable: true } }) },
}
const moduleObject = { exports: {} }
vm.runInNewContext(fs.readFileSync(path.join(root, 'server/controllers/guestBooking.controller.js'), 'utf8'), { module: moduleObject, require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name] } })
const controller = moduleObject.exports
const request = phone => ({ body: { full_name: 'Synthetic Guest', gender: 'Female', reported_age: 35, phone, consent_given: true, branch_id: 1, doctor_id: 8, requested_service_id: 77, clinic_type: 'medical', appointment_date: '2027-02-01', appointment_time: '10:00', reason: 'other', reason_details: 'Synthetic follow up' } })
async function main() {
  let minimalFailure
  try { await controller.create(request(''), {}) } catch (error) { minimalFailure = error.code }
  assert.equal(minimalFailure, 'CONTACT_REQUIRED')
  const response = { setHeader() {}, status() { return this }, json() { throw Error('SIMULATED_RESPONSE_LOSS_AFTER_COMMIT') } }
  await assert.rejects(controller.create(request('09170000001'), response), /SIMULATED_RESPONSE_LOSS_AFTER_COMMIT/)
  assert.equal(state.appointments.length, 1)
  assert.equal(state.access.length, 1)
  let retryFailure
  try { await controller.create(request('09170000001'), response) } catch (error) { retryFailure = error.code }
  assert.equal(retryFailure, 'EXISTING_PATIENT')
  assert.equal(state.patients[0].password, null)
  assert.equal(state.patients[0].birthdate, null)
  assert.equal(state.patients[0].reported_age, 35)
  assert.equal(state.appointments[0].patient_age_at_visit, 35)
  assert.equal(state.access[0].token_hash.length, 64)
  const result = { syntheticOnly: true, noProductionWrites: true, minimalPersonalDetailsRejected: minimalFailure, committedBookingsAfterLostResponse: state.appointments.length,
    retryRejected: retryFailure, savedPatientHasPortalPassword: false, savedAge: 35, savedBirthdate: null, savedAppointmentAge: 35,
    findings: ['Guest booking requires a phone despite PDF name/sex/age-only request', 'A lost post-commit response strands the guest access token; retry is rejected'] }
  fs.writeFileSync(path.join(__dirname, 'guest-reproduction.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })

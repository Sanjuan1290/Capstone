import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const page = read('client/src/pages/shared/AppointmentCreatePage.jsx')
const list = read('client/src/pages/shared/Appointments.jsx')
const router = read('client/src/App.jsx')
const patient = read('client/src/pages/patientPage/BookAppointment.jsx')
const branches = read('server/routers/branches.router.js')

test('New Appointment is a dedicated page and not an embedded modal', () => {
  assert.doesNotMatch(list, /<AddAppointmentModal/)
  assert.match(list, /navigate\(`\$\{location\.pathname/)
  assert.match(page, /New Appointment/)
  assert.match(page, /useBlocker/)
  assert.match(page, /Discard & Leave/)
})
test('Staff route requires appointments permission; Admin and Super Admin branch routes exist', () => {
  assert.match(router, /path='appointments\/new' element=\{<StaffPermissionRoute permission="appointments"><Staff_NewAppointment/)
  assert.equal((router.match(/path='appointments\/new' element=\{<Admin_NewAppointment/g) || []).length, 2)
  for (const role of ['admin', 'staff']) assert.match(read(`client/src/pages/${role}Page/${role[0].toUpperCase()+role.slice(1)}_NewAppointment.jsx`), /<AppointmentCreatePage services=/)
})
test('scheduled flow uses the Patient Portal components and the same four booking steps after Patient', () => {
  assert.match(page, /\['Patient', 'Service', 'Doctor', 'Date & Time', 'Review'\]/)
  for (const name of ['StepBar', 'StepService', 'StepDoctor', 'StepSchedule', 'StepDetails', 'BookingSummary']) {
    assert.match(page, new RegExp(`\\b${name}\\b`))
    assert.match(patient, new RegExp(`export const ${name} =`))
  }
  assert.match(page, /normalizeBookingServiceResults/)
  assert.match(page, /availableSlots\.includes\(form\.time\)/)
})
test('walk-in has a shorter flow and checks for duplicate queues and existing appointments', () => {
  assert.match(page, /\['Patient', 'Visit Details', 'Review'\]/)
  assert.match(page, /services\.getQueuePrecheck\(savedPatientId\)/)
  assert.match(page, /if \(verified\?\.active_queue\)/)
  assert.match(page, /check_in_appointment_id: existing\.id/)
  assert.match(page, /services\.addToQueue\(payload\)/)
  assert.match(page, /setCreatedPatientId\(savedPatientId\)/)
  assert.match(page, /if \(submitting\.current/)
})
test('queue display is available from Appointments and walk-in success, in a new tab', () => {
  assert.match(list, /href="\/display\/queue" target="_blank" rel="noopener noreferrer"/)
  assert.match(page, /const QUEUE_DISPLAY = '\/display\/queue'/)
  assert.match(page, /success\.type === 'walk_in' && <a href=\{QUEUE_DISPLAY\} target="_blank" rel="noopener noreferrer"/)
  const q = read('client/src/pages/displayPage/QueueDisplay.jsx')
  assert.match(q, /queue_number|queueNo|queueNo/)
})
test('staff appointments-only access can read doctor schedules and unavailable dates without permission to edit schedules', () => {
  assert.match(branches, /get\(`\$\{prefix\}\/doctors\/:id\/schedules`,\.\.\.middle,allowAnyPermission\('appointments','doctor_schedules'\)/)
  assert.match(branches, /get\(`\$\{prefix\}\/doctors\/:id\/unavailable-dates`,\.\.\.middle,allowAnyPermission\('appointments','doctor_schedules'\)/)
  assert.match(branches, /get\(`\$\{prefix\}\/doctors\/:id\/available-slots`,\.\.\.middle,allowAnyPermission\('appointments','doctor_schedules'\)/)
  assert.match(branches, /put\(`\$\{prefix\}\/doctors\/:id\/schedules`,afterSuccessfulMutation\('schedule.updated'\),\.\.\.ownedPerson\('doctors','doctor_schedules'/)
})
test('staff-assisted appointment never bypasses branch-scoped server validation', () => {
  const booking = read('server/routers/branchAppointmentWrites.js')
  assert.match(booking, /withAppointmentSlotLock/)
  assert.match(booking, /validateAppointmentSlot/)
  assert.match(booking, /req\.branchId/)
  assert.match(page, /services\.createAppointment\(\{/)
  assert.match(page, /override_no_show_warning: overrideNoShowWarning/)
})
test('requires visit reason, patient privacy consent, and explicit review acknowledgement', () => {
  assert.match(page, /reason === 'Other'/)
  assert.match(page, /reasonDetails\.trim\(\)\.length >= 2/)
  assert.match(page, /patientFields\.consent_given/)
  assert.match(page, /validatePatientBirthdate/)
  assert.match(page, /informedPatient/)
})
test('failed submissions preserve the form; prior no-shows require a deliberate override', () => {
  assert.match(page, /setError\(err\.message \|\| 'Could not finish this appointment/)
  assert.match(page, /err\.code === 'NO_SHOW_WARNING'/)
  assert.match(page, /setNoShowWarning/)
  assert.match(page, /submit\(true\)/)
})

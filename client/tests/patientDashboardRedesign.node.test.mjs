import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getPatientDashboardSummary, appointmentMinutes, clinicNow } from '../src/utils/patientDashboardData.mjs'
import { publicServicePrice, listServicesForCategory } from '../src/utils/patientServicePresentation.mjs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const at = new Date('2026-11-01T13:30:00+08:00')
const appointments = [
  { id: 1, branch_id: 1, status: 'pending', appointment_date: '2026-11-02', appointment_time: '10:00 AM' },
  { id: 2, branch_id: 2, status: 'confirmed', appointment_date: '2026-11-01', appointment_time: '2:00 PM' },
  { id: 3, branch_id: 1, status: 'confirmed', appointment_date: '2026-11-01', appointment_time: '3:00 PM' },
  { id: 4, branch_id: 1, status: 'confirmed', appointment_date: '2026-11-01', appointment_time: '10:00 AM' },
  { id: 5, branch_id: 1, status: 'completed', appointment_date: '2026-10-20', appointment_time: '9:00 AM' },
  { id: 6, branch_id: 1, status: 'cancelled', appointment_date: '2026-11-03' },
  { id: 7, branch_id: 2, status: 'completed', appointment_date: '2026-10-22' },
]

test('Manila calendar time is used for appointment summary, including AM/PM', () => {
  assert.deepEqual(clinicNow(at), { date: '2026-11-01', minutes: 13 * 60 + 30 })
  assert.equal(appointmentMinutes('12:00 AM'), 0)
  assert.equal(appointmentMinutes('12:00 PM'), 720)
  assert.equal(appointmentMinutes('3:05 PM'), 905)
  assert.equal(appointmentMinutes('invalid'), null)
})
test('next appointment excludes past time, other branches, cancelled and completed visits', () => {
  const summary = getPatientDashboardSummary(appointments, 1, at)
  assert.equal(summary.upcoming.id, 3)
  assert.equal(summary.upcomingCount, 2)
  assert.equal(summary.completedCount, 1)
  assert.deepEqual(summary.recentVisits.map(item => item.id), [5])
})
test('switching branch changes next appointment, counts and completed visits', () => {
  const summary = getPatientDashboardSummary(appointments, '2', at)
  assert.equal(summary.upcoming.id, 2)
  assert.equal(summary.upcomingCount, 1)
  assert.equal(summary.completedCount, 1)
  assert.deepEqual(summary.recentVisits.map(item => item.id), [7])
})
test('empty and malformed appointment inputs do not produce false visits', () => {
  assert.deepEqual(getPatientDashboardSummary(null, 1, at), {upcoming:null, upcomingCount:0, completedCount:0, recentVisits:[]})
  assert.equal(getPatientDashboardSummary([{branch_id:1,status:'pending',appointment_date:'bad'}],1,at).upcoming,null)
})
test('service categories are filtered without mutating the booking catalog', () => {
  const services = [{id:1,clinic_type:'medical'}, {id:2,clinic_type:'derma'}, {id:3,clinic_type:'all'}]
  assert.deepEqual(listServicesForCategory(services,'derma').map(x=>x.id),[2,3])
  assert.equal(services.length,3)
})
test('unapproved catalog prices and placeholders are not presented as public prices', () => {
  assert.equal(publicServicePrice({default_price:1}),null)
  assert.equal(publicServicePrice({default_price:759.97}),null)
  assert.equal(publicServicePrice({default_price:0,public_price_visible:true}),null)
  assert.equal(publicServicePrice({default_price:1200,public_price_visible:true}),1200)
})
test('redesigned dashboard retains live services, offers, announcements, and booking paths', () => {
  const dash=read('../src/pages/patientPage/PatientDashboard.jsx')
  assert.match(dash,/max-w-\[1200px\]/)
  assert.match(dash,/<PatientServices branchId=\{branchId\}/)
  assert.match(dash,/<FeaturedOffers promotions=\{promotions\}/)
  assert.match(dash,/<PatientAnnouncementPromos branchId=\{branchId\}/)
  assert.match(dash,/getPatientDashboardSummary\(data, branchId\)/)
  assert.match(dash,/\/patient\/book/)
  assert.match(dash,/motion-reduce:transition-none/)
  const services=read('../src/components/services/PatientServices.jsx')
  assert.match(services,/getBookingServices\('',branchId\)/)
  assert.match(services,/serviceBookingPath\(service,branchId\)/)
  assert.match(services,/publicServicePrice\(service\)/)
})

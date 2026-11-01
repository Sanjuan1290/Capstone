import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appointmentStats, filterAppointmentList, paginateAppointments, sortAppointmentList,
  hasRescheduleRequest, isAwaitingAction, visiblePageNumbers,
} from '../src/utils/appointmentList.mjs'
const today = '2026-11-01'
const rows = [
  {id:1, status:'completed', date:'2026-10-31', created_at:'2026-10-31T09:00:00', patient_name:'Ana Cruz', doctor:'Dr. A'},
  {id:2, status:'confirmed', date:'2026-11-03', time:'10:00 AM', created_at:'2026-10-30T09:00:00', patient_name:'Marco', doctor:'Dr. A'},
  {id:3, status:'pending', date:'2026-10-30', created_at:'2026-10-31T10:00:00', patient_name:'Ben', doctor:'Dr. A'},
  {id:4, status:'pending', date:'2026-11-02', created_at:'2026-10-31T11:00:00', reschedule_requested_at:'2026-10-31T11:00:00', patient_name:'Liza', doctor:'Dr. B'},
  {id:5, status:'cancelled', date:'2026-11-05', created_at:'2026-10-31T12:00:00', patient_name:'Cal', doctor:'Dr. B'},
  {id:6, status:'confirmed', date:'2026-11-01', time:'09:00 AM', created_at:'2026-10-31T13:00:00', patient_name:'Jen', doctor:'Dr. B'},
]
test('all appointments show pending requests before visits, even when the pending date is old', () => {
  assert.deepEqual(sortAppointmentList(rows, {today}).map(x=>x.id), [4,3,6,2,5,1])
})
test('reschedule request counts as pending and appears first', () => {
  assert.equal(hasRescheduleRequest(rows[3]), true)
  assert.equal(isAwaitingAction(rows[3]), true)
  assert.deepEqual(sortAppointmentList(filterAppointmentList(rows, {tab:'needs_action'}),{tab:'needs_action',today}).map(x=>x.id), [4,3])
})
test('summary counts do not depend on selected filters', () => {
  assert.deepEqual(appointmentStats(rows, today), { all:6, byStatus:{completed:1,confirmed:2,pending:2,cancelled:1},needsAction:2,rescheduleRequests:1,today:1,upcoming:2 })
})
test('search includes patient phone and email but does not lose role/branch scoping', () => {
  const records = [{...rows[0],patient_phone:'09171234567',patient_email:'ana@example.com'}]
  assert.equal(filterAppointmentList(records,{query:'0917'}).length,1)
  assert.equal(filterAppointmentList(records,{query:'EXAMPLE.COM'}).length,1)
  assert.equal(filterAppointmentList(records,{query:'wrong'}).length,0)
})
test('status filters and date range work together', () => {
  assert.deepEqual(filterAppointmentList(rows,{tab:'pending',dateFrom:'2026-11-01'}).map(x=>x.id),[4])
  assert.deepEqual(filterAppointmentList(rows,{tab:'all',dateFrom:'2026-11-01',dateTo:'2026-11-01'}).map(x=>x.id),[6])
})
test('sort menu supports upcoming time and latest created order', () => {
  assert.equal(sortAppointmentList(rows,{order:'soonest',today})[0].id,6)
  assert.equal(sortAppointmentList(rows,{order:'newest',today})[0].id,6)
})
test('pagination starts at ten and clamps invalid pages and sizes', () => {
  const many=Array.from({length:23},(_,id)=>({id:id+1}))
  const first=paginateAppointments(many,1,10)
  assert.deepEqual([first.first,first.last,first.totalPages,first.items.length],[1,10,3,10])
  const last=paginateAppointments(many,99,10)
  assert.deepEqual([last.currentPage,last.first,last.last,last.items.length],[3,21,23,3])
  assert.equal(paginateAppointments(many,1,20).items.length,20)
  assert.equal(paginateAppointments(many,1,7).pageSize,10)
})
test('empty results have safe range and page number', () => {
  const page=paginateAppointments([],4,10)
  assert.deepEqual([page.first,page.last,page.totalPages,page.currentPage],[0,0,1,1])
})

test('visible page buttons stay in range and include the selected page', () => {
  assert.deepEqual(visiblePageNumbers(1,10), [1,2,3,4,5])
  assert.deepEqual(visiblePageNumbers(5,10), [3,4,5,6,7])
  assert.deepEqual(visiblePageNumbers(10,10), [6,7,8,9,10])
  assert.deepEqual(visiblePageNumbers(1,1), [1])
})

test('shared admin/staff page renders immediate priorities, visible pagination, and a details action', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/pages/shared/Appointments.jsx', import.meta.url), 'utf8')
  assert.match(source, /Requests needing attention/)
  assert.match(source, /View all \{needsAttention\.length\} requests/)
  assert.match(source, /compact = false/)
  assert.match(source, /View Details/)
  assert.match(source, /<Pagination page=\{currentPage\}/)
  assert.match(source, /visiblePageNumbers\(currentPage, totalPages\)/)
  assert.match(source, /onPageSizeChange=\{setPageSize\}/)
})

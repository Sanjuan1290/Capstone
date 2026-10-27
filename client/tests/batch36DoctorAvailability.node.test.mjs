import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildSlotBookingPath,readSlotPrefill} from '../src/utils/bookingHandoff.mjs'
const read = rel=>readFileSync(new URL(`../src/${rel}`,import.meta.url),'utf8')
test('availability slot builds branch-scoped doctor/date/time link',()=>{
 const link=buildSlotBookingPath({branchId:2,doctorId:6,clinicType:'medical',date:'2026-11-20',time:'9:00 AM'})
 const [path,query]=link.split('?');const p=new URLSearchParams(query)
 assert.equal(path,'/patient/book')
 assert.deepEqual([p.get('branch_id'),p.get('doctor'),p.get('date'),p.get('time')],['2','6','2026-11-20','9:00 AM'])
 assert.deepEqual(readSlotPrefill(p,'2026-10-22'),{date:'2026-11-20',time:'9:00 AM'})
 assert.deepEqual(readSlotPrefill(new URLSearchParams('date=2025-01-01&time=10:00'), '2026-10-22'),{date:null,time:''})
})
test('doctor availability shows selectable only for available slots',()=>{
 const src=read('pages/patientPage/DoctorAvailability.jsx')
 assert.match(src,/slot\.available \? \(/)
 assert.match(src,/buildSlotBookingPath\(\{branchId,doctorId:doctor.id,clinicType,date:day.date,time:slot.time\}\)/)
 assert.match(src,/aria-pressed=\{clinicFilter===value\}/)
})
test('booking prefill is revalidated with the available-slots endpoint',()=>{
 const src=read('pages/patientPage/BookAppointment.jsx')
 assert.match(src,/readSlotPrefill\(searchParams, getLocalDateOnly\(\)\)/)
 assert.match(src,/!available\.includes\(prev\.time\)/)
 assert.match(src,/getDoctorAvailableSlots\(/)
 assert.match(src,/doctor: current.doctor\?\.clinic_type === clinicType \? current.doctor : null/)
})
test('rescheduling passes branch context and shows failed availability as error',()=>{
 const src=read('pages/patientPage/ResheduleAppointment.jsx')
 assert.match(src,/branchId: appt\.branch_id/)
 assert.match(src,/setSlotsError\('Unable to check available times/)
 assert.match(src,/slotsError &&/)
})



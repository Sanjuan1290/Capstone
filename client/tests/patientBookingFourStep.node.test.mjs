import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BOOKING_STEPS, normalizeBookingServiceResults, eligibleBookingPromotions } from '../src/utils/patientBookingFlow.mjs'

const source = readFileSync(new URL('../src/pages/patientPage/BookAppointment.jsx', import.meta.url),'utf8')

test('booking has four patient-facing steps and combines details with final review',()=>{
  assert.deepEqual(BOOKING_STEPS,['Service','Doctor','Date & Time','Review'])
  for(const marker of ['<StepService category={serviceCategory}','<StepDoctor clinicType={form.clinicType}','<StepSchedule date={form.date}','<StepReview form={{...form,branchId}}']) assert.ok(source.includes(marker),marker)
  assert.match(source,/step===3 \? submitting \? 'Submitting…' : 'Request Appointment'/)
  assert.match(source,/policyAccepted && !submitting/)
})

test('multi-category service results retain bookable clinic type and remove inactive or repeated rows',()=>{
  const services=normalizeBookingServiceResults([
    {status:'fulfilled',value:[{id:10,service_name:'Consult',is_active:1},{id:10,service_name:'Consult'},{id:11,service_name:'Inactive',is_active:0}]},
    {status:'fulfilled',value:[{id:10,service_name:'Consult',is_active:1},{id:12,service_name:'Skin',is_active:1}]},
  ])
  assert.deepEqual(services.map(s=>`${s.booking_clinic_type}:${s.id}`),['medical:10','derma:10','derma:12'])
  assert.deepEqual(normalizeBookingServiceResults([{status:'rejected',reason:Error('down')},{status:'fulfilled',value:[]}]),[])
})

test('promotion only appears for a matching branch, active offer, service and appointment date',()=>{
  const rows=[
    {id:1,branch_id:2,is_active:1,service_ids:[7],starts_on:'2026-11-01',ends_on:'2026-11-30'},
    {id:2,branch_id:3,is_active:1,service_ids:[7],starts_on:'2026-11-01',ends_on:'2026-11-30'},
    {id:3,branch_id:2,is_active:0,service_ids:[7],starts_on:'2026-11-01',ends_on:'2026-11-30'},
    {id:4,branch_id:2,is_active:1,service_ids:[8],starts_on:'2026-11-01',ends_on:'2026-11-30'},
  ]
  assert.deepEqual(eligibleBookingPromotions(rows,{branchId:2,serviceId:7,date:'2026-11-10'}).map(p=>p.id),[1])
  assert.equal(eligibleBookingPromotions(rows,{branchId:2,serviceId:7,date:'2026-12-01'}).length,0)
  assert.equal(eligibleBookingPromotions(rows,{branchId:2,serviceId:7,date:''}).length,0)
})

test('booking never submits unverified email, stale slots or missing policy acceptance',()=>{
  assert.match(source,/emailStatus !== 'verified'/)
  assert.match(source,/timeSlots\.includes\(form\.time\)/)
  assert.match(source,/bookingSubmissionLock\.current \|\| submitting/)
  assert.match(source,/!policyAccepted/)
  assert.match(source,/setBookingNotice\(err\.message/)
  assert.match(source,/getDoctorAvailableSlots\(/)
  assert.match(source,/getBookingReadiness\(branchId\)/)
  assert.match(source,/booking_clinic_type/)
  assert.match(source,/id:'system-other', label:'Other'/)
})

test('booking keeps correct information visible, supports mobile and reduced motion',()=>{
  assert.match(source,/aria-label="Appointment summary"/)
  assert.match(source,/lg:grid-cols-\[minmax\(0,1\.7fr\)/)
  assert.match(source,/aria-current=\{index === current \? 'step'/)
  assert.match(source,/motion-reduce:transition-none/)
  assert.match(source,/Read Booking Policy/)
  assert.match(source,/booking-policy\?branch_id=/)
  assert.doesNotMatch(source,/Read full online booking policy/)
  assert.match(source,/Pending Clinic Confirmation/)
})

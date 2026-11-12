import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
test('daily appointment screen removes View a Date and keeps notification targeting',()=>{
 const source=read('../src/pages/doctorPage/Doctor_Appointments.jsx')
 assert.doesNotMatch(source,/>View a Date</)
 assert.match(source,/notificationDate/)
 assert.match(source,/Today/)
 assert.match(source,/Upcoming/)
})
test('past consultation search combines clinic and date range filters',()=>{
 const source=read('../src/pages/doctorPage/Doctor_ConsultationHistory.jsx')
 for(const fragment of ['Search Past Consultations','clinicFilter','dateFrom','dateTo','Clear filters'])assert.ok(source.includes(fragment))
})
test('checkout lists actual included-item adjustments from doctor consultation',()=>{
 const source=read('../src/components/billing/BillCheckout.jsx')
 assert.match(source,/Consultation inventory adjustments reflected in this service price/)
 assert.match(source,/material_adjustments/)
})
test('consultation quantities are whole-number input fields',()=>{
 const source=read('../src/pages/doctorPage/Doctor_Consultation.jsx')
 assert.match(source,/Number.isSafeInteger\(quantity\)/)
 assert.match(source,/step="1"/)
 assert.match(source,/pattern="\[0-9\]\*"/)
})

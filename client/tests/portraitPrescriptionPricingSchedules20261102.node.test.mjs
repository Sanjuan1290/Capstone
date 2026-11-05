import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=(relative)=>readFileSync(path.join(root,relative),'utf8')
const rxSource=read('src/utils/consultationPrint.js')
const rx=await import('data:text/javascript;base64,'+Buffer.from(rxSource).toString('base64'))
const pricing=await import('data:text/javascript;base64,'+Buffer.from(read('src/utils/patientServicePresentation.mjs')).toString('base64'))
test('one portrait prescription panel per physical sheet and no signature',()=>{
  const html=rx.buildPrescriptionPadHtml({patient:{name:'Sample',age:21,sex:'Female'},prescriptions:[{medicine:'Paracetamol',quantity:5}]})
  assert.match(html,/@page\{size:A5 portrait;margin:0\}/)
  assert.equal((html.match(/<section class="pad"/g)||[]).length,1)
  assert.doesNotMatch(html, /\$\{pad\(group\)\}\$\{pad\(group\)\}/)
  assert.doesNotMatch(html, /doctor['’]s signature|class="signature"/i)
  assert.match(html, /Name&amp;nbsp;|Name&nbsp;/)
})
test('long medicine lists split across separate portrait pages',()=>{
  const meds=Array.from({length:7},(_,i)=>({medicine:'Prescription '+(i+1)}))
  const html=rx.buildPrescriptionPadHtml({prescriptions:meds})
  assert.equal((html.match(/<section class="pad"/g)||[]).length,3)
  assert.equal((html.match(/<div class="medicine-entry"/g)||[]).length,7)
})
test('escape markup in prescription values',()=>{
  const html=rx.buildPrescriptionPadHtml({patient:{name:'<script>bad</script>'}})
  assert.doesNotMatch(html, /<script>bad<\/script>/)
  assert.match(html, /&lt;script&gt;/)
})
test('patient service price uses saved total, not an opt-in visibility flag',()=>{
  assert.equal(pricing.formatPublicServicePrice({default_price:455,consultation_fee:350}), '₱455.00')
  assert.equal(pricing.formatPublicServicePrice({default_price:0}), '₱0.00')
  assert.equal(pricing.formatPublicServicePrice({default_price:null}), 'Price unavailable')
  assert.equal(pricing.formatPublicServicePrice({}), 'Price unavailable')
})
test('available service cards show price for every service',()=>{
  const src=read('src/components/services/PatientServices.jsx')
  assert.match(src,/Service price: <strong>\{formatPublicServicePrice\(service\)\}<\/strong>/)
  assert.doesNotMatch(src,/Ask the clinic about pricing/)
})
test('booking shows service price in selection, review, and success',()=>{
  const src=read('src/pages/patientPage/BookAppointment.jsx')
  assert.match(src,/preview\.quote\?\.discount > 0/)
  assert.match(src,/Service price: \{formatPublicServicePrice\(service\)\}/)
  assert.match(src,/\['Service Price',form\.service \? \(hasDiscount \? peso\(quote\.current\)/)
  assert.match(src,/Service price: \{formatPublicServicePrice\(form\.service\)\}/)
  assert.match(src,/selectedPromotion=\{selectedPromotion\}/)
})
test('doctor schedule background refresh does not hide schedule cards',()=>{
 const src=read('src/pages/adminPage/Admin_DoctorSchedules.jsx')
 assert.match(src,/if \(!silent\) \{\s*setSelected\(doctor\)/)
 assert.match(src,/onSaved=\{\(\) => loadScheduleData\(selected,\{silent:true\}\)\}/)
 assert.match(src,/if \(!silent && request === requestVersion\.current\) setSchedLoading\(false\)/)
})
test('doctor self-service schedule refreshes silently after a save',()=>{
 const src=read('src/pages/doctorPage/Doctor_Schedule.jsx')
 assert.match(src,/onSaved=\{\(\) => loadScheduleData\(\{silent:true\}\)\}/)
 assert.match(src,/if \(!silent\) setSchedLoading\(true\)/)
})
test('schedule toggle prevents simultaneous writes',()=>{
 const src=read('src/components/schedule/ScheduleDayCard.jsx')
 assert.match(src,/if \(saving\) return\s*setSaving\(true\)/)
 assert.match(src,/finally \{ setSaving\(false\) \}/)
})


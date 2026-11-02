import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const printSource = readFileSync(resolve(import.meta.dirname,'../src/utils/consultationPrint.js'),'utf8')
const consultationSource = readFileSync(resolve(import.meta.dirname,'../src/pages/doctorPage/Doctor_Consultation.jsx'),'utf8')
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(printSource).toString('base64')
const {buildPrescriptionPadHtml,printPrescriptionPad}=await import(moduleUrl)
const data={patient:{name:'Demo Patient',age:28,sex:'Female'},date:'November 2, 2026',diagnosis:'Test diagnosis',prescriptions:[{medicine:'Sample Medicine 500 mg tablet',quantity:12,frequency:'Once daily',duration:'14 days',notes:'After meal'}],doctorName:'Test Doctor, MD',doctorSpecialty:'General Medicine',prcLicense:'TEST-1234',clinic:{clinic_name:'Carait Medical and Dermatology Clinic',address:'Clinic address',phone:'Demo clinic number'}}
test('prescription prints as two landscape pads without signature box',()=>{
 const html=buildPrescriptionPadHtml(data)
 assert.match(html,/@page\{size:letter landscape/)
 assert.equal((html.match(/class="pad"/g)||[]).length,2)
 assert.doesNotMatch(html,/Signature|signature/)
})
test('existing fields print and duplicate across pads',()=>{
 const html=buildPrescriptionPadHtml(data)
 for(const value of ['November 2, 2026','Test diagnosis','Sample Medicine 500 mg tablet','Once daily','14 days','Test Doctor, MD','TEST-1234','Carait Medical and Dermatology Clinic'])assert.equal(html.split(value).length-1,2,value)
})
test('HTML data escapes user entered medication and diagnosis',()=>{
 const html=buildPrescriptionPadHtml({...data,diagnosis:'<img src=x onerror=alert(1)>',prescriptions:[{medicine:'<script>bad</script>'}]})
 assert.doesNotMatch(html,/<script>bad<\/script>/)
 assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/)
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/)
})
test('no fabricated PTR number or hand drawn signature',()=>{
 const html=buildPrescriptionPadHtml(data)
 assert.doesNotMatch(html,/PTR No/)
 assert.doesNotMatch(html,/Doctor.s Signature/)
})
test('prescription printer and consultation record are separate controls',()=>{
 assert.match(consultationSource,/Print Prescription/)
 assert.match(consultationSource,/Print Consultation Record/)
 assert.match(consultationSource,/disabled=\{!prescriptions\.some/)
})
test('popup receives generated print page',()=>{
 let written='';let printed=0
 const popup={document:{open(){},write(v){written=v},close(){}},focus(){},print(){printed++}}
 globalThis.window={location:{origin:'https://caraitclinic.com'},open(){return popup}}
 printPrescriptionPad(data)
 assert.match(written,/Demo Patient/)
 popup.onload()
 assert.equal(printed,1)
 delete globalThis.window
})
test('long prescription continues on extra sheet without dropping medicine entries',()=>{
 const meds=Array.from({length:9},(_,i)=>({medicine:`Sample medicine ${i+1}`,quantity:i+1}))
 const html=buildPrescriptionPadHtml({...data,prescriptions:meds})
 assert.equal((html.match(/class="page"/g)||[]).length,3)
 for(let i=1;i<=9;i++)assert.equal((html.split(`Sample medicine ${i}<`).length-1),2)
 assert.doesNotMatch(html,/max-height:104mm/)
})

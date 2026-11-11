import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL,fileURLToPath } from 'node:url'
import {createRequire} from 'node:module'
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),require=createRequire(path.join(root,'client/package.json'))
const {chromium}=require('@playwright/test'),baseline=process.argv.includes('--baseline'),base=baseline?path.join(here,'.baseline'):root
const {buildBillingReceiptHtml}=await import(pathToFileURL(path.join(base,'client/src/utils/billingReceiptTemplate.mjs')))
const item={service_name:'Synthetic Clinic Service',quantity:1,unit_price:807,line_total:807}
const bill={id:1,patient_name:'Synthetic Patient',doctor_name:'Synthetic Doctor',appointment_date:'2026-11-11',subtotal:807,total_amount:607,discount_amount:200,approved_courtesy_discount:200,paid_amount:607,balance_amount:0,items:[item]}
const payment={id:1,receipt_number:'OR-QA-20261111-000001',payment_method:'cash',status:'completed',paid_at:'2026-11-11 10:30:00',amount:607,reference_number:'Synthetic reference'}
const clinicSettings={clinic_name:'Synthetic Branch',address:'Synthetic clinic address, Philippines',phone:'09170000000',email:'qa@example.invalid'}
const cases=[['one-service',{}],['multiple-services',{items:Array.from({length:4},(_,i)=>({...item,service_name:'Synthetic Service '+(i+1)}))}],['promotion',{promotion_discount_amount:100,approved_courtesy_discount:100}],['partial',{paid_amount:200,balance_amount:407,payment:{amount:200}}],['refunded',{payment:{refund_amount:50,refund_reason:'Synthetic test refund'}}],['voided',{payment:{status:'voided',void_reason:'Synthetic duplicate test'}}],['long-fields',{patient_name:'Synthetic Patient With A Long Name '.repeat(3),items:[{...item,service_name:'Synthetic long service description '.repeat(4)}],payment:{receipt_number:'OR-QA-'+('1234567890'.repeat(8)),reference_number:'QA-'+('reference-'.repeat(10))}}],['many-items',{items:Array.from({length:40},(_,i)=>({...item,service_name:'Synthetic service '+i}))}]]
const browsers=[['Edge','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],['Chrome','C:/Program Files/Google/Chrome/Application/chrome.exe']]
const results=[]
fs.mkdirSync(path.join(here,'browser-artifacts'),{recursive:true})
for(const [name,executablePath] of browsers){
 if(!fs.existsSync(executablePath)){results.push({browser:name,status:'BLOCKED',reason:'Browser executable not installed'});continue}
 const browser=await chromium.launch({headless:true,executablePath})
 try{for(const [label,overrides] of cases){
  const page=await browser.newPage()
  await page.route('**/*',route=>route.abort())
  const html=buildBillingReceiptHtml({bill:{...bill,...overrides},payment:{...payment,...overrides.payment},clinicSettings,logoUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46"/>'})
  await page.setContent(html)
  for(const headers of [false,true]){
   const output=path.join(here,'browser-artifacts',`${baseline?'baseline':'current'}-${name}-${label}-${headers?'headers':'clean'}.pdf`)
   await page.pdf({path:output,preferCSSPageSize:true,printBackground:true,displayHeaderFooter:headers})
   results.push({browser:name,case:label,headers,pdf:path.relative(here,output),expected:label==='many-items'?'multiple-pages':'one-page'})
  }
  await page.close()
 }}finally{await browser.close()}
}
fs.writeFileSync(path.join(here,`${baseline?'baseline-':''}print-results.json`),JSON.stringify(results,null,2))
console.log('Generated '+results.filter(r=>r.pdf).length+' real browser PDFs; page counts require PDF inspection.')

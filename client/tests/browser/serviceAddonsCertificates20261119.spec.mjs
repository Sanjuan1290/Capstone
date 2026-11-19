import {test,expect} from '@playwright/test'
import {readFile,writeFile} from 'node:fs/promises'
import {mockClinic} from './helpers/clinic20261111.mjs'
import fixtures from '../../../server/tests/helpers/serviceAddonsFixture.cjs'

async function connect(page,{role='admin',status='ready',price=100,permissions}={}){
 const h=fixtures.fixture({status,price}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await mockClinic(page,role,{requests:false,permissions})
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),p=url.pathname,method=route.request().method()
  const send=(data,status=200)=>route.fulfill({json:data,status})
  let body;try{body=route.request().postDataJSON()}catch{}
  if(p==='/api/doctor/check-auth')return send({authenticated:true,user:{id:40,full_name:'Dr. Test',prc_license:'123456',role:'doctor',clinic_type:'medical',branch_id:2,branches:[{id:2,name:'Test Branch'}]}})
  if(p==='/api/doctor/branches')return send([{id:2,name:'Test Branch'}])
  if(p==='/api/doctor/appointments')return send([{id:10,patient_id:30,doctor_id:40,patient_name:'José Test',appointment_date:'2026-11-01',appointment_time:'10:00 AM',status:'completed',consultation_id:20,consultation_status:'finalized',clinic_type:'medical',requested_service_name_snapshot:'Consultation'}])
  if(p==='/api/doctor/consultations/10')return send({id:20,appointment_id:10,patient_id:30,patient_name:'José Test',doctor_name:'Dr. Test',status:'finalized',version:1,type:'medical',diagnosis:'Visit diagnosis',prescription:'[]',billable_services:[],billing:await h.readBill(1)})
  if(p==='/api/doctor/consultations/10/medical-certificate'){
   const res=await h.call(method==='POST'?h.certificates.issue:h.certificates.get,{...h.certReq,body:body||{}});return send(res.body,res.statusCode)
  }
  const addon=p.match(/\/billing\/(\d+)\/addons$/)
  if(addon){const res=await h.call(method==='POST'?h.addons.confirm:h.addons.options,{params:{id:Number(addon[1])},branchId:2,user:{id:9,role:'staff'},body:body||{}});return send(res.body,res.statusCode)}
  const pay=p.match(/\/billing\/(\d+)\/pay$/)
  if(pay){const res=await h.pay(Number(pay[1]),Number(body.payment_amount),body.idempotency_key);return send(res.body,res.statusCode)}
  const bill=p.match(/\/billing\/(\d+)$/)
  if(bill){if(method==='PUT')h.state.lastBillSave=body;return send(await h.readBill(Number(bill[1])))}
  if(p.endsWith('/available-promotions'))return send({services:[],promotions:[]})
  const catalog=p.match(/\/billing\/catalog(?:\/(\d+))?$/)
  if(catalog){
   if(method==='PUT'){const conn=await h.db.getConnection();await h.addons.saveServiceAddons(conn,2,Number(catalog[1]),body.addons);return send({id:Number(catalog[1]),...body})}
   return send([{id:5,category_id:1,category:'Consultation',clinic_type:'medical',service_name:'Consultation',consultation_fee:1000,default_price:1000,average_duration_minutes:60,is_active:1,materials:[],addons:h.state.attached.map(a=>({...a,price_override:a.price_override}))}])
  }
  if(p.endsWith('/system-setup'))return send({service_categories:[{id:1,name:'Consultation',clinic_type:'medical',is_active:1}]})
  if(p.endsWith('/billing/addons')){const res=await h.call(method==='POST'?h.addons.save:h.addons.list,{params:{},branchId:2,user:{id:9,role:'admin'},body:body||{}});return send(res.body,res.statusCode)}
  if(p.endsWith('/charge-adjustments'))return send({requests:[],targets:[]})
  if(p.endsWith('/billing')){
   const statuses=url.searchParams.get('status')?.split(',')
   const items=await Promise.all(h.state.bills.filter(b=>!statuses||statuses.includes(b.status)).map(b=>h.readBill(b.id)))
   return send({items,pagination:{page:1,totalPages:1,total:items.length}})
  }
  return route.fallback()
 })
 return {h,errors}
}
async function collect(page,amount){
 await page.getByRole('button',{name:'Cash',exact:true}).click()
 await page.getByRole('button',{name:'Record Payment',exact:true}).click()
 await page.getByRole('button',{name:`Confirm Payment ₱${amount}`,exact:true}).click()
 await expect(page.getByRole('heading',{name:'Payment recorded successfully'})).toBeVisible()
}
test('paid visit, past certificate PDF, new pending charge and two isolated receipts',async({page})=>{
 const {h,errors}=await connect(page)
 await page.goto('/admin/billing/checkout/1');await collect(page,'1,000.00')
 const original=structuredClone(h.state.payments[0])
 await page.goto('/doctor/consultation-history')
 await page.getByRole('button',{name:'View Consultation Record'}).click()
 await page.getByRole('button',{name:'Issue Medical Certificate',exact:true}).click()
 const modal=page.getByRole('dialog')
 await expect(modal.getByLabel('Diagnosis')).toHaveValue('Visit diagnosis')
 await modal.getByLabel('Recommendation').fill('Rest for two days.')
 await modal.getByLabel('Remarks').fill('Clinic test certificate.')
 await modal.getByRole('button',{name:'Preview Certificate'}).click()
 await expect(modal.getByRole('article')).toContainText('Consultation Date: 2026-11-01')
 await expect(modal.getByRole('img',{name:'Medical certificate page 1 of 1'})).toBeVisible()
 await modal.getByRole('button',{name:'Issue Medical Certificate',exact:true}).click()
 const downloadEvent=page.waitForEvent('download')
 await modal.getByRole('button',{name:'Download PDF'}).click()
 const download=await downloadEvent,bytes=await readFile(await download.path())
 expect(bytes.subarray(0,8).toString()).toBe('%PDF-1.4');expect(download.suggestedFilename()).toBe('Medical-Certificate-MC-1.pdf')
 expect(bytes.toString('latin1')).toContain('/MediaBox [0 0 612 792]')
 await download.saveAs('../QA_REPORT/addons-2026-11-19/medical-certificate-sample.pdf')
 const preview=modal.getByRole('img',{name:'Medical certificate page 1 of 1'})
 await expect(preview).toBeVisible()
 const previewData=await preview.getAttribute('src')
 await writeFile('../QA_REPORT/addons-2026-11-19/medical-certificate-preview.png',Buffer.from(previewData.split(',')[1],'base64'))
 const repeatDownload=page.waitForEvent('download')
 await modal.getByRole('button',{name:'Download PDF'}).click();await repeatDownload
 await page.reload()
 await page.getByRole('button',{name:'Issue Medical Certificate',exact:true}).click()
 await expect(page.getByRole('button',{name:'Download PDF'})).toBeVisible()
 expect(h.state.certificates).toHaveLength(1);expect(h.state.receipts).toBe(1)
 expect(h.state.charges).toHaveLength(0)
 await page.goto('/admin/billing/transactions/1')
 await page.getByRole('button',{name:'New Add-on Charge'}).click()
 await page.getByRole('combobox',{name:'Add-on'}).selectOption('5:6')
 await page.getByRole('button',{name:'Confirm Add-on',exact:true}).click()
 await expect(page.getByRole('dialog')).toContainText('Payments → Pending')
 await page.goto('/admin/billing?tab=payments')
 await expect(page.getByRole('main',{name:'Billing workspace'})).toContainText('Add-on charge · Original Bill #1')
 await page.getByRole('link',{name:'Bill Checkout'}).click();await collect(page,'100.00')
 await page.goto('/admin/billing/transactions/2')
 const addonPopup=page.waitForEvent('popup');await page.getByRole('button',{name:'Receipt',exact:true}).click();const addonReceipt=await addonPopup
 await expect(addonReceipt.locator('.payment-summary')).toContainText('₱100.00')
 await expect(addonReceipt.locator('body')).toContainText('Medical Certificate')
 await expect(addonReceipt.locator('body')).not.toContainText('₱1,000.00');await addonReceipt.close()
 await page.goto('/admin/billing/transactions/1')
 const originalPopup=page.waitForEvent('popup');await page.getByRole('button',{name:'Receipt',exact:true}).click();const originalReceipt=await originalPopup
 await expect(originalReceipt.locator('.payment-summary')).toContainText('₱1,000.00');await expect(originalReceipt.locator('body')).not.toContainText('Medical Certificate');await originalReceipt.close()
 expect(h.state.payments[0]).toEqual(original);expect(h.state.payments[1].receipt_number).not.toBe(original.receipt_number)
 await page.reload();expect(h.state.charges).toHaveLength(1);expect(h.state.receipts).toBe(2);expect(errors).toEqual([])
})
test('editable bill adds a saved line; billing-only Staff cannot see the action',async({page})=>{
 const {h,errors}=await connect(page,{status:'draft'})
 await page.goto('/admin/billing/checkout/1')
 await page.getByRole('button',{name:'Add Add-on',exact:true}).click()
 await page.getByRole('combobox',{name:'Add-on'}).selectOption('5:6')
 await page.getByRole('button',{name:'Confirm Add-on',exact:true}).click()
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(page.locator('body')).toContainText('Medical Certificate')
 expect(h.state.bills).toHaveLength(1);expect(h.state.bills[0].total_amount).toBe(1100);expect(h.state.receipts).toBe(0);expect(errors).toEqual([])
 await page.unrouteAll({behavior:'wait'})
 await connect(page,{role:'staff',status:'paid',permissions:['billing']})
 await page.goto('/staff/billing/history/1')
 await expect(page.getByRole('main',{name:'Bill history'})).toBeVisible()
 await expect(page.getByRole('button',{name:'New Add-on Charge'})).toHaveCount(0)
})
test('free add-on records an included transaction without offering payment collection',async({page})=>{
 const {h}=await connect(page,{status:'paid',price:0})
 await page.goto('/admin/billing/transactions/1')
 await page.getByRole('button',{name:'New Add-on Charge'}).click()
 await page.getByRole('combobox',{name:'Add-on'}).selectOption('5:6')
 await page.getByRole('button',{name:'Confirm Add-on',exact:true}).click()
 await expect(page.getByRole('dialog')).toContainText('No collection or payment receipt is required')
 await expect(page.getByRole('button',{name:'Bill Checkout'})).toHaveCount(0)
 expect(h.state.charges).toHaveLength(1);expect(h.state.receipts).toBe(0)
})
test('setup creates a reusable free add-on and saves multiple service attachments with a price override',async({page})=>{
 const {h,errors}=await connect(page)
 await page.goto('/admin/system-setup/billing/addons')
 await page.getByRole('textbox',{name:'Name',exact:true}).fill('Travel Note')
 await page.getByRole('spinbutton',{name:'Default Price (₱)'}).fill('0')
 await page.getByRole('button',{name:'Create Add-on'}).click()
 await expect(page.getByText('Travel Note',{exact:true})).toBeVisible()
 await page.goto('/admin/system-setup/billing/services/5/edit')
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('spinbutton',{name:'Medical Certificate service price override'}).fill('75')
 await page.getByRole('checkbox',{name:/Travel Note/}).check()
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:'Save Changes',exact:true}).click()
 await expect(page).toHaveURL(/\/system-setup\/billing\/services$/)
 expect(h.state.attached).toEqual([{branch_id:2,service_id:5,addon_id:6,price_override:75},{branch_id:2,service_id:5,addon_id:7,price_override:null}])
 expect(h.state.charges).toHaveLength(0)
 expect(errors).toEqual([])
})
test('free included line can pass editable checkout review with no missing-price warning',async({page})=>{
 const {h}=await connect(page,{status:'draft',price:0})
 await page.goto('/admin/billing/checkout/1')
 await page.getByRole('button',{name:'Add Add-on',exact:true}).click()
 await page.getByRole('combobox',{name:'Add-on'}).selectOption('5:6')
 await page.getByRole('button',{name:'Confirm Add-on',exact:true}).click()
 await expect(page.getByText('Confirmed Add-on',{exact:true}).first()).toBeVisible()
 await expect(page.locator('body')).not.toContainText('missing/₱0.00 price')
 await page.getByRole('button',{name:/Continue to Confirm Bill/}).click()
 await expect(page.getByRole('heading',{name:'3. Confirm Bill (Read Only)'})).toBeVisible()
 expect(h.state.charges).toHaveLength(1);expect(h.state.receipts).toBe(0)
})

test('template preview and PDF share Letter geometry and paginate long clinical text without clipping',async({page})=>{
 const {h}=await connect(page)
 await page.goto('/doctor/consultation?id=10')
 await page.getByRole('button',{name:'Issue Medical Certificate',exact:true}).click()
 const modal=page.getByRole('dialog')
 await modal.getByLabel('Diagnosis').fill('Diagnostic continuation detail '.repeat(75)+'END_DIAGNOSIS')
 await modal.getByLabel('Recommendation').fill('Recommendation continuation detail '.repeat(75)+'END_RECOMMENDATION')
 await modal.getByLabel('Remarks').fill('Remarks continuation detail '.repeat(60)+'END_REMARKS')
 await modal.getByRole('button',{name:'Preview Certificate'}).click()
 const preview=modal.getByRole('article')
 await expect(preview).toHaveAttribute('aria-busy','false')
 expect(await preview.getByRole('img').count()).toBeGreaterThan(1)
 await page.evaluate(()=>{
  window.certificateDraws=[]
  const fill=CanvasRenderingContext2D.prototype.fillText
  CanvasRenderingContext2D.prototype.fillText=function(value,x,y,...args){
   if(this.canvas.width===1224&&this.canvas.height===1584){
    const width=this.measureText(String(value)).width
    const left=this.textAlign==='right'?x-width:this.textAlign==='center'?x-width/2:x
    window.certificateDraws.push({value:String(value),left,right:left+width,y,font:this.font})
   }
   return fill.call(this,value,x,y,...args)
  }
 })
 await modal.getByRole('button',{name:'Issue Medical Certificate',exact:true}).click()
 await expect(preview).toHaveAttribute('aria-busy','false')
 await expect(preview.getByRole('img').first()).toHaveAttribute('alt',/page 1 of/)
 await expect.poll(()=>page.evaluate(()=>window.certificateDraws.some(line=>line.value.startsWith('MC-1')))).toBe(true)
 const pageCount=await preview.getByRole('img').count()
 const drawn=await page.evaluate(()=>window.certificateDraws.splice(0))
 expect(drawn.every(line=>line.left>=35&&line.right<=548&&line.y>=0&&line.y<=750)).toBe(true)
 const text=drawn.map(line=>line.value).join('\n')
 expect(text).toContain('END_DIAGNOSIS');expect(text).toContain('END_RECOMMENDATION');expect(text).toContain('END_REMARKS')
 expect(text).toContain('Dr. Test');expect(text).toContain('License No. 123456')
 const downloadEvent=page.waitForEvent('download')
 await modal.getByRole('button',{name:'Download PDF'}).click()
 const pdf=await downloadEvent,bytes=await readFile(await pdf.path())
 expect(bytes.toString('latin1')).toContain(`/Count ${pageCount}`)
 expect(bytes.toString('latin1')).toContain('/MediaBox [0 0 612 792]')
 expect(await page.evaluate(()=>window.certificateDraws)).toEqual(drawn)
 expect(h.state.certificates).toHaveLength(1);expect(h.state.charges).toHaveLength(0);expect(h.state.receipts).toBe(0)
})

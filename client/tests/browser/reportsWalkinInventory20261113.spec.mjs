import {test,expect} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {mockClinic} from './helpers/clinic20261111.mjs'
const fixture=JSON.parse(readFileSync(new URL('../../../QA_REPORT/reports-walkin-inventory-2026-11-13/report-fixtures.json',import.meta.url),'utf8'))
const evidence='../QA_REPORT/reports-walkin-inventory-2026-11-13/browser-artifacts'
const permissions=['dashboard','appointments','walk_in_queue','patient_records','doctor_schedules','billing','checkout','inventory','system_setup','reports','audit_logs']
const movement={id:81,user_id:8,user_role:'staff',performed_by:'Synthetic Staff',actor_name:'Synthetic Staff',branch_name:'Branch 1',branch_id:1,action:'inventory.movement_recorded',entity_type:'inventory_item',entity_id:1,inventory_item_name:'Item 1',target_name_snapshot:'Item 1',area_code:'inventory',outcome:'success',old_values:{quantity:12},new_values:{quantity:10,moved_quantity:2,movement_type:'clinical_use',batch_id:1},created_at:'2026-11-13T01:00:00+08:00'}
async function reportApi(page){
 const calls=[]
 await page.route('**/api/branches/analytics/**',route=>{
  const url=new URL(route.request().url());calls.push(url)
  const data=url.pathname.endsWith('/report-details')?fixture.reports[url.searchParams.get('section')]
   :url.pathname.endsWith('/all')?[{id:1,name:'Branch 1',is_active:1,appointments:4,pending:0,completed:1,no_shows:1,doctors:2,billed:1200,collected:100}]
   :url.pathname.endsWith('/trends')?{appointments:fixture.trends}:[{id:1,name:'Branch 1',is_active:1,ready:true,missing:[]}]
  return route.fulfill({json:data})
 })
 return calls
}
test('all five Super Admin report sections display SQL-derived data and retain filters in PDF requests',async({page,context})=>{
 await context.addInitScript(()=>{window.print=()=>{}})
 await page.clock.install({time:new Date('2026-11-13T04:00:00Z')})
 await mockClinic(page,'superadmin',{permissions});const calls=await reportApi(page)
 await page.goto('/superadmin/reports')
 const report=page.locator('#super-admin-report')
 await report.getByRole('combobox',{name:'Clinic Branch'}).selectOption('1')
 await report.getByRole('combobox',{name:'Reporting Period'}).selectOption('custom')
 await report.getByLabel('From',{exact:true}).fill('2026-11-01');await report.getByLabel('To',{exact:true}).fill('2026-11-13')
 await report.getByRole('button',{name:'Appointments & Patients',exact:true}).click()
 await expect(report.getByText('New Patients',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('2')
 await expect(report.getByText('Returning Patients',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('1')
 await report.getByRole('button',{name:'Financial',exact:true}).click()
 await expect(report.getByText('Gross Billed',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('₱1,300.00')
 await expect(report.getByText('Net Collections',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('₱100.00')
 await expect(report.getByText('Outstanding',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('₱200.00')
 await report.getByRole('button',{name:'Doctors & Services',exact:true}).click()
 await expect(report.getByRole('cell',{name:'Doctor 2',exact:true})).toBeVisible()
 await report.getByRole('button',{name:'Inventory',exact:true}).click()
 await expect(report.getByText('Products',{exact:true}).first().locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('3')
 await expect(report.getByText('Low Stock',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('1')
 await report.getByRole('button',{name:'Overview',exact:true}).click()
 await expect(report.getByText('Unique Patients',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('3')
 await report.getByRole('button',{name:'Print / Save PDF',exact:true}).click()
 const print=page.frameLocator('iframe[title="Printable Carait Clinic reports"]')
 await expect(print.getByRole('heading',{name:'Appointments',exact:true})).toHaveCount(1)
 await expect(print.locator('body')).toContainText('2026-11-01 to 2026-11-13')
 expect(calls.filter(url=>url.pathname.endsWith('/report-details')).slice(-5).every(url=>url.searchParams.get('branch_id')==='1'&&url.searchParams.get('from')==='2026-11-01'&&url.searchParams.get('to')==='2026-11-13')).toBeTruthy()
 await page.screenshot({path:`${evidence}/superadmin-reports.png`,fullPage:true})
})

for(const role of ['admin','staff','superadmin'])test(`${role}: branch report summaries use real aggregate rows`,async({page})=>{
 const {root}=await mockClinic(page,role,{permissions})
 await page.route('**/reports?*',route=>route.fulfill({json:fixture.branch}))
 await page.goto(`${root}/reports`)
 await expect(page.getByText('Patient Mix',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('2 new')
 await expect(page.getByText('Patient Mix',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('1 returning')
 await expect(page.getByText('Inventory Selling-value Estimate',{exact:true}).locator('xpath=ancestor::*[contains(@class,"border")][1]')).toContainText('₱700.00')
 await expect(page.getByRole('cell',{name:'Doctor 2',exact:true})).toBeVisible()
})

test('Staff queue uses the shared service selection and returns to the queue after check-in',async({page})=>{
 await mockClinic(page,'staff',{permissions})
 await page.goto('/staff/walkin')
 await page.getByRole('button',{name:'Add Walk-in Visit',exact:true}).click()
 await expect(page).toHaveURL(/appointments\/new\?visit_type=walk_in&return_to=queue/)
 await page.getByPlaceholder(/Search.*patient|Search.*name/i).first().fill('Test')
 await page.getByRole('button',{name:/Test Patient/}).click()
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:/General Medicine Wound Dressing/}).click()
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:/Dr Test.*Accepting walk-ins/}).click()
 await page.getByRole('button',{name:'Follow up',exact:true}).click()
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('checkbox').check()
 await page.getByRole('button',{name:'Check In Patient',exact:true}).click()
 await page.getByRole('button',{name:'Back to Walk-in Queue',exact:true}).click()
 await expect(page).toHaveURL(/\/staff\/walkin$/)
})

for(const separate of [false,true])test(`existing appointment can be ${separate?'kept separate from a new service':'checked in with its original service'}`,async({page})=>{
 const {state}=await mockClinic(page,'staff',{permissions})
 await page.route('**/queue/precheck/*',route=>route.fulfill({json:{active_queue:null,today_appointment:{id:111,doctor_id:8,doctor_name:'Dr Test',clinic_type:'medical',reason:'Follow up',requested_service_id:99,requested_service_name_snapshot:'Previously booked treatment',requested_service_price_snapshot:250}}}))
 await page.goto('/staff/appointments/new?visit_type=walk_in&return_to=queue')
 await page.getByPlaceholder(/Search.*patient|Search.*name/i).first().fill('Test');await page.getByRole('button',{name:/Test Patient/}).click()
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/General Medicine Wound Dressing/}).click()
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Dr Test.*Accepting walk-ins/}).click()
 await page.getByRole('button',{name:'Follow up',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click()
 if(separate)await page.getByRole('radio',{name:'Create a separate walk-in with the selected service'}).check()
 else await expect(page.getByRole('complementary').filter({hasText:'Appointment Summary'})).toContainText('Previously booked treatment')
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Check In Patient',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Patient checked in'})).toBeVisible()
 const body=state.calls.find(call=>call.method==='POST'&&call.path.endsWith('/queue')).body
 if(separate){expect(body.requested_service_id).toBe(77);expect(body.allow_separate_walkin).toBe(true)}
 else {expect(body.check_in_appointment_id).toBe(111);expect(body.requested_service_id).toBeUndefined()}
})

test('Staff intake print contains only current intake fields and a guardian consent signature',async({page,context})=>{
 await context.addInitScript(()=>{window.print=()=>{window.__printed=true}})
 await mockClinic(page,'staff',{permissions});await page.goto('/staff/walkin')
 const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'Print Intake Form',exact:true}).click()])
 await expect(popup.getByRole('heading',{name:'Carait Clinic - Walk-in Patient Intake'})).toBeVisible()
 await expect(popup.locator('body')).toContainText('Requested service')
 await expect(popup.locator('body')).toContainText('parent / guardian')
 await expect(popup.locator('body')).not.toContainText('Email Address')
 await expect(popup.locator('body')).not.toContainText('Queue / Reference')
 await popup.screenshot({path:`${evidence}/intake.png`,fullPage:true})
})

test('queue action errors are visible, calls can be retried, and the queue changes day at Philippine midnight',async({page})=>{
 await page.clock.install({time:new Date('2026-11-13T15:59:50Z')})
 await mockClinic(page,'staff',{permissions})
 const entry={id:12,patient_name:'Synthetic Patient',doctor_name:'Dr Test',type:'medical',queue_number:1,status:'waiting'}
 let failure=true;const dates=[]
 await page.route('**/api/staff/queue**',route=>{
  const req=route.request(),url=new URL(req.url())
  if(req.method()==='PATCH'){if(failure)return route.fulfill({status:409,json:{message:'Queue changed. Please retry.'}});entry.status=req.postDataJSON().status;return route.fulfill({json:entry})}
  dates.push(url.searchParams.get('date'));return route.fulfill({json:url.searchParams.get('date')==='2026-11-13'?[entry]:[]})
 })
 await page.goto('/staff/walkin');await page.getByRole('button',{name:'Call Patient',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('Queue changed')
 failure=false;await page.getByRole('button',{name:'Call Patient',exact:true}).click()
 await expect(page.getByRole('button',{name:'Return to Waiting',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Return to Waiting',exact:true}).click();await expect(page.getByRole('button',{name:'Call Patient',exact:true})).toBeVisible()
 await page.clock.fastForward(16000)
 await expect.poll(()=>dates.includes('2026-11-14')).toBeTruthy()
 await expect(page.getByText('No active walk-ins yet.',{exact:true})).toBeVisible()
})

test('walk-in toggle survives parent rerenders, late GET responses, and navigation without reverting a saved value',async({page})=>{
 await mockClinic(page,'staff',{permissions})
 let enabled=true,reads=0,held,holdNext=false
 await page.route('**/walk-ins/acceptance',route=>{
  if(route.request().method()==='PUT'){enabled=route.request().postDataJSON().accepting_walk_ins;return route.fulfill({json:{accepting_walk_ins:enabled}})}
  reads++;if(holdNext){holdNext=false;held=route;return}
  return route.fulfill({json:{accepting_walk_ins:enabled}})
 })
 await page.goto('/staff/doctor-schedules')
 await page.getByRole('button',{name:/Dr Test/}).last().click()
 const toggle=page.getByRole('switch',{name:'Accepting Walk-ins',exact:true})
 await expect(toggle).toBeChecked();const initial=reads
 await page.getByPlaceholder('Search by name or clinic assignment...').fill('Dr')
 await expect(toggle).toBeChecked();expect(reads).toBe(initial)
 holdNext=true
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect.poll(()=>Boolean(held)).toBeTruthy()
 await toggle.click();await expect(toggle).not.toBeChecked()
 await held.fulfill({json:{accepting_walk_ins:true}})
 await expect(toggle).not.toBeChecked()
 await page.goto('/staff/walkin');await page.goto('/staff/doctor-schedules')
 await page.getByRole('button',{name:/Dr Test/}).last().click()
 await expect(page.getByRole('switch',{name:'Accepting Walk-ins',exact:true})).not.toBeChecked()
 await page.screenshot({path:`${evidence}/acceptance-paused.png`,fullPage:true})
})

for(const role of ['admin','superadmin'])test(`${role}: Inventory Activity uses whole quantities, before/after totals and stronger stock alerts`,async({page})=>{
 await page.setViewportSize({width:role==='admin'?1440:390,height:1100})
 const {root}=await mockClinic(page,role,{permissions})
 await page.route('**/api/**/inventory',route=>route.fulfill({json:[{id:1,name:'Item 1',stock:10,available_stock:2,stock_base:10,unit_size:1,threshold:5,selling_price:50,category:'medical',item_type:'medicine',uom:'unit'},{id:2,name:'Empty item',stock:0,threshold:5,unit_size:1,selling_price:50,category:'medical',item_type:'medicine'}]}))
 await page.route('**/inventory/logs?*',route=>route.fulfill({json:{items:[{id:81,item_name:'Item 1',qty:'2.00',quantity_before:'12.00',quantity_after:'10.00',type:'out',movement_type:'clinical_use',performed_by:'Dr Test',performed_by_role:'Doctor',logged_at:'2026-11-13T01:00:00+08:00'}],pagination:{page:1,limit:10,total:1,totalPages:1}}}))
 await page.goto(`${root}/inventory`)
 await expect(page.getByText('Stock needs attention: 2 items',{exact:true})).toBeVisible()
 await expect(page.getByText('Low stock - restock',{exact:true})).toBeVisible()
 const row=page.getByRole('row',{name:/Item 1.*Clinical Use/})
 await expect(row.getByRole('cell',{name:'2',exact:true})).toBeVisible();await expect(row.getByRole('cell',{name:'12',exact:true})).toBeVisible();await expect(row.getByRole('cell',{name:'10',exact:true})).toBeVisible()
 await expect(row).toContainText('Doctor')
 await page.getByRole('button',{name:'Review stock alerts',exact:true}).click()
 await page.screenshot({path:`${evidence}/inventory-${role}.png`,fullPage:true})
})

for(const global of [false,true])test(`${global?'global':'branch'} Audit Logs show inventory item totals before and after`,async({page})=>{
 const {root}=await mockClinic(page,'superadmin',{permissions})
 await page.route('**/audit-logs?*',route=>route.fulfill({json:{items:[movement],pagination:{page:1,limit:25,total:1,totalPages:1}}}))
 await page.route('**/audit/all?*',route=>route.fulfill({json:{rows:[movement],total:1,pages:1}}))
 await page.goto(global?'/superadmin/audit-logs':`${root}/audit-logs`)
 await expect(page.getByText('Before 12',{exact:true})).toBeVisible();await expect(page.getByText('After 10',{exact:true})).toBeVisible()
})

for(const role of ['admin','staff'])test(`${role}: dashboard gives stock alerts a prominent restocking action`,async({page})=>{
 const {root}=await mockClinic(page,role,{permissions})
 await page.route(/\/api\/.*\/dashboard(?:\/stats)?(?:\?.*)?$/,route=>route.fulfill({json:{lowStock:2,lowStockCount:2,pendingApprovals:0,totalPatients:3,totalToday:0,queueCount:0,doctorStatus:[],bookingReadiness:{medical:{bookable:true,missing:[]},derma:{bookable:true,missing:[]}}}}))
 await page.goto(root)
 await expect(page.getByText('Stock needs attention: 2 items',{exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:'Review stock alerts',exact:true})).toBeVisible()
})

test('Super Admin dashboard and All Inventory share prominent alerts and the alerts filter',async({page})=>{
 await mockClinic(page,'superadmin',{permissions});await reportApi(page)
 const rows=[{id:1,inventory_id:1,name:'Item 1',stock:10,quantity_base:10,available_stock:2,threshold:5,low:true,out:false,selling_value:500},
  {id:2,inventory_id:2,name:'Empty item',stock:0,quantity_base:0,available_stock:0,threshold:5,low:false,out:true,selling_value:0}].map(row=>({...row,branch_id:1,branch_name:'Branch 1',category:'medical',item_type:'medicine',base_unit:'unit',selling_price:50}))
 await page.route('**/api/branches/inventory/all?*',route=>route.fulfill({json:{view:'by_branch',page:1,limit:10,total:2,rows,summary:{total_items:2,total_units:10,low_stock:1,out_of_stock:1,total_selling_value:500},branches:[{id:1,name:'Branch 1',is_active:1}],comparison:[]}}))
 await page.goto('/superadmin')
 await expect(page.getByText('Stock needs attention: 2 items',{exact:true})).toBeVisible()
 await page.getByRole('link',{name:'Review stock alerts',exact:true}).click()
 await expect(page.getByRole('combobox',{name:'Filter stock status',exact:true})).toHaveValue('alerts')
 await expect(page.getByText('Stock needs attention: 2 items',{exact:true})).toBeVisible()
 await page.screenshot({path:`${evidence}/all-inventory-alerts.png`,fullPage:true})
})

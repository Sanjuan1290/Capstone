const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const billing=require('../../utils/billing'),finance=require('../../utils/chargeAdjustments')
const {billingFixture}=require('../helpers/billingFixture.cjs')
const source=fs.readFileSync(path.join(__dirname,'../../controllers/doctor.controller.js'),'utf8')
const validation=source.slice(source.indexOf('const enforceFixedCatalogConsumables ='),source.indexOf('const buildConsultationPayload ='))
const finalization=source.slice(source.indexOf('const finalizeConsultation ='),source.indexOf('const clinicalChargeAdjustments='))
function lifecycle(){
 const {state,conn:financial}=billingFixture()
 Object.assign(state.bill,{appointment_id:9,consultation_id:11,patient_id:4,doctor_id:3,subtotal:540,total_amount:405,discount_amount:135,promotion_discount_amount:135,discount_type:'promotion',discount_label:'Christmas Promo'})
 state.clinical={id:11,status:'draft',version:1};state.consumed=[];state.notifications=[]
 const appointment={id:9,branch_id:1,patient_id:4,doctor_id:3,status:'in-progress',requested_service_id:77,promotion_selected_for_service_id:77,promotion_discount_amount_snapshot:135,promotion_title_snapshot:'Christmas Promo'}
 const catalog={id:77,service_name:'Wound Dressing',default_price:540,consultation_fee:350,is_active:1,materials:[{catalog_service_id:77,inventory_id:7,quantity:1,material_name:'Gauze',unit_label:'unit'}]}
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,args=[])=>{
  if(sql.startsWith('SELECT * FROM appointments'))return [[...(Number(args[0])===9&&args[1]===3&&args[2]===1?[structuredClone(appointment)]:[])]]
  if(sql.includes('FROM queue'))return [[]]
  if(sql.startsWith('SELECT id, status, version FROM consultations'))return [[structuredClone(state.clinical)]]
  if(sql.startsWith('UPDATE consultations')){if(sql.includes("SET status='finalized'"))state.clinical.status='finalized';return [{affectedRows:1}]}
  if(sql.startsWith("UPDATE appointments SET status")){appointment.status='completed';return [{affectedRows:1}]}
  if(sql.includes('FROM inventory WHERE id=?'))return [[{id:7,name:'Gauze',unit:'unit',base_unit:'unit',uom:'unit',archived_at:null}]]
  if(sql.includes('FROM inventory')&&sql.includes('WHERE id IN'))return [[{id:7,name:'Gauze',unit:'unit',uom:'unit',selling_price:5}]]
  if(sql.includes('FROM billing_service_catalog bsc'))return [[catalog]]
  if(sql.includes('FROM billing_service_materials m'))return [catalog.materials]
  if(sql.includes('FROM billing_records WHERE appointment_id'))return [[structuredClone(state.bill)]]
  if(sql.includes('FROM billing_records b'))return [[{...state.bill,promotion_title_snapshot:'Christmas Promo',promotion_selected_for_service_id:77,promotion_discount_amount_snapshot:135,approved_courtesy_discount:state.requests.filter(r=>r.status==='approved').reduce((n,r)=>n+r.requested_amount,0)}]]
  if(sql.trimStart().startsWith('SELECT')&&sql.includes('FROM billing_items')&&!sql.includes('billing_items bi JOIN'))return [structuredClone(state.items)]
  if(sql.includes('FROM billing_payments bp'))return [[]]
  if(sql.startsWith('DELETE FROM billing_items')){state.items=[];return [{affectedRows:1}]}
  if(sql.startsWith('INSERT INTO billing_items')){const keys=['billing_id','catalog_service_id','item_type','source_type','source_reference_id','source_inventory_id','category','service_name','quantity','base_amount','markup_percentage','unit_price','line_total','details_json','notes','sort_order'];state.items.push({id:90+state.items.length,...Object.fromEntries(keys.map((key,i)=>[key,args[i]]))});return [{insertId:90,affectedRows:1}]}
  if(sql.startsWith('UPDATE billing_records')&&sql.includes('SET consultation_id')){Object.assign(state.bill,{consultation_id:args[0],subtotal:args[1],discount_amount:args[2],promotion_discount_amount:args[3],total_amount:args[4]});return [{affectedRows:1}]}
  return financial.query(sql,args)
 }}
 const context={db:{getConnection:async()=>conn},getBillingCatalogServiceById:async(id,executor,branch)=>id===77&&branch===1?catalog:null,
 validateSupplyQuantity:require('../../utils/supplyQuantity').validateSupplyQuantity,
 makeConsultationValidationError:(message,code)=>Object.assign(new Error(message),{statusCode:400,code}),
 normalizeConsultationTextFields:()=>({diagnosis:'Test diagnosis',prescription:null,notes:null,prescriptionStatus:'none'}),
 assertAppointmentTransition:require('../../utils/appointmentSecurity').assertAppointmentTransition,
 assertConsultationVersion:require('../../utils/consultationIntegrity').assertConsultationVersion,
 assertBookedServicePresent:(appt,services)=>assert.equal(services[0].catalog_service_id,appt.requested_service_id),
 upsertDraftBillingForAppointment:billing.upsertDraftBillingForAppointment,
 consumeClinicalInventory:async({billing:bill})=>{state.consumed=billing.collectInventoryUsageFromBillingItems(bill.items)},
 writeAuditLog:require('../../utils/audit').writeAuditLog,getTodayDateOnly:()=> '2026-11-05',broadcast:()=>{},
 createNotification:async n=>state.notifications.push(n),console}
 const finalize=vm.runInNewContext(validation+'\n'+finalization+';finalizeConsultation',context)
 return {state,conn,finalize}
}
for(const decision of ['none','approved','rejected'])test(`complete consultation with ${decision} reduction decision preserves promotion and actual consumption`,async()=>{
 const {state,conn,finalize}=lifecycle()
 let requestId
 if(decision!=='none')requestId=await finance.request({billingId:6,branchId:1,actorRole:'doctor',actorId:3,targetType:'service_fee',serviceId:77,amount:20,reason:'Patient courtesy request',allowDraft:true},conn)
 assert.deepEqual(state.consumed,[])
 let status=200,result
 await finalize({params:{appointmentId:9},branchId:1,user:{id:3},body:{expected_version:1,billable_services:[{catalog_service_id:77,quantity:1,usage_change_reason:'Used two pads for treatment.',materials:[{inventory_id:7,material_name:'Gauze',quantity:2,unit_label:'unit'}]}]}},{status(n){status=n;return this},json(value){result=value;return this}})
 assert.equal(status,200);assert.equal(result.status,'finalized');assert.equal(state.clinical.status,'finalized')
 assert.equal(result.billing.subtotal,540);assert.equal(result.billing.promotion_discount_amount,135);assert.equal(result.billing.total_amount,405)
 assert.equal(state.consumed[0].quantity,2);assert.equal(state.notifications.length,2)
 if(requestId)await finance.resolve({billingId:6,branchId:1,requestId,adminId:8,actorRole:'admin',status:decision,note:decision==='rejected'?'Not eligible':'Reviewed clinical request'},conn)
 assert.equal(state.bill.total_amount,decision==='approved'?385:405);assert.equal(state.consumed[0].quantity,2)
})

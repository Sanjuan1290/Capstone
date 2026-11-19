const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {createRequire}=require('node:module')
const clone=x=>structuredClone(x)
function load(file,imports){
 const filename=path.resolve(__dirname,'../..',file),actual=createRequire(filename),module={exports:{}}
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:name=>Object.hasOwn(imports,name)?imports[name]:actual(name),Intl,Date},{filename})
 return module.exports
}
function fixture({status='ready',override=null,price=100}={}){
 const state={bills:[{id:1,branch_id:2,appointment_id:10,consultation_id:20,patient_id:30,doctor_id:40,status,version:1,subtotal:1000,total_amount:1000,discount_amount:0,original_bill_id:null}],
 items:[{id:1,billing_id:1,item_type:'service',catalog_service_id:5,source_type:'consultation',service_name:'Consultation',quantity:1,unit_price:1000,line_total:1000}],payments:[],charges:[],snapshots:[],certificates:[],audit:[],receipts:0,
 addons:[{id:6,branch_id:2,name:'Medical Certificate',default_price:price,is_active:1}],attached:[{branch_id:2,service_id:5,addon_id:6,price_override:override}]}
 const readBill=async id=>{const bill=state.bills.find(b=>b.id===Number(id));if(!bill)return null;const payments=state.payments.filter(p=>p.billing_id===bill.id);return {...clone(bill),patient_name:'José Test',doctor_name:'Dr. Test',appointment_date:'2026-11-01',items:clone(state.items.filter(i=>i.billing_id===bill.id)),payments:clone(payments),paid_amount:payments.reduce((s,p)=>s+p.amount,0),balance_amount:bill.total_amount-payments.reduce((s,p)=>s+p.amount,0)}}
 let lock=Promise.resolve()
 const query=async(sql,p=[])=>{
  if(sql.startsWith('SELECT * FROM billing_records'))return [clone(state.bills.filter(b=>b.id===Number(p[0])&&b.branch_id===Number(p[1])))]
  if(sql.startsWith('SELECT * FROM billing_addon_charges WHERE original_bill_id='))return [clone(state.charges.filter(c=>c.original_bill_id===Number(p[0])&&(sql.includes('AND service_id=')?c.service_id===Number(p[1])&&c.addon_id===Number(p[2]):c.branch_id===Number(p[1]))))]
  if(sql.startsWith('SELECT id FROM billing_addon_charges'))return [clone(state.charges.filter(c=>c.branch_id===p[0]&&c.request_key===p[1]))]
  if(sql.startsWith('SELECT DISTINCT sa.service_id'))return [state.attached.filter(a=>a.branch_id===p[0]&&state.items.some(i=>i.billing_id===p[1]&&i.catalog_service_id===a.service_id&&i.item_type==='service')).flatMap(a=>state.addons.filter(b=>b.id===a.addon_id&&b.branch_id===a.branch_id&&b.is_active).map(b=>({...a,name:b.name,service_name:'Consultation',price:a.price_override??b.default_price})))]
  if(sql.startsWith('INSERT INTO billing_records')){const id=state.bills.length+1;state.bills.push({id,appointment_id:p[0],consultation_id:p[1],patient_id:p[2],doctor_id:p[3],branch_id:p[4],original_bill_id:p[5],charge_key:p[6],status:'pending',subtotal:p[7],total_amount:p[8],discount_amount:0,version:1});return [{insertId:id}]}
  if(sql.startsWith('INSERT INTO billing_addon_charges')){const id=state.charges.length+1;state.charges.push({id,branch_id:p[0],original_bill_id:p[1],consultation_id:p[2],service_id:Number(p[3]),addon_id:Number(p[4]),billing_id:p[5],name_snapshot:p[6],price_snapshot:p[7],request_key:p[8]});return [{insertId:id}]}
  if(sql.startsWith('INSERT INTO billing_items')){state.items.push({id:state.items.length+1,billing_id:p[0],item_type:'custom',source_type:'service_addon',source_reference_id:p[1],service_name:p[2],quantity:1,unit_price:p[4],line_total:p[5],details_json:p[6]});return [{insertId:state.items.length}]}
  if(sql.includes('FROM billing_financial_snapshots'))return [state.snapshots.filter(s=>s.billing_id===p[0]&&s.branch_id===p[1]).map(clone)]
  if(sql.startsWith('INSERT INTO billing_financial_snapshots')){state.snapshots.push({billing_id:p[0],branch_id:p[1],policy_json:p[2],calculation_json:null,confirmed_at:null});return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE billing_financial_snapshots SET calculation_json')){state.snapshots.find(s=>s.billing_id===p[1]).calculation_json=p[0];return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE billing_financial_snapshots SET confirmed_at')){state.snapshots.find(s=>s.billing_id===p[0]).confirmed_at='2026-11-19';return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE billing_records SET subtotal=')){Object.assign(state.bills.find(b=>b.id===p[3]),{subtotal:p[0],discount_amount:p[1],total_amount:p[2]});return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE billing_records SET status=')){Object.assign(state.bills.find(b=>b.id===p[1]),{status:p[0],finalized_at:'2026-11-19'});return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE billing_records SET version=')){state.bills.find(b=>b.id===p[0]).version++;return [{affectedRows:1}]}
  if(sql.includes('FROM billing_charge_adjustments'))return [[]]
  if(sql.startsWith('SELECT COUNT(*) AS count FROM billing_payments'))return [[{count:state.payments.filter(pay=>pay.billing_id===p[0]).length}]]
  if(sql.includes('FROM branch_payment_settings'))return [[{is_enabled:1}]]
  if(sql.includes('FROM billing_payments bp JOIN billing_records'))return [state.payments.filter(x=>x.idempotency_key===p[0]).map(x=>({billing_id:x.billing_id,branch_id:2}))]
  if(sql.includes('FROM payment_gateway_attempts'))return [[]]
  if(sql.startsWith('SELECT code FROM clinic_branches'))return [[{code:'TEST'}]]
  if(sql.startsWith('INSERT IGNORE INTO branch_receipt_sequences'))return [{affectedRows:0}]
  if(sql.startsWith('UPDATE branch_receipt_sequences'))return [{insertId:++state.receipts}]
  if(sql.includes('INSERT INTO billing_payments')){state.payments.push({id:state.payments.length+1,billing_id:p[0],amount:p[1],payment_method:p[2],amount_received:p[4],change_amount:p[5],receipt_number:p[6],idempotency_key:p[10],status:'completed',refund_amount:0});return [{insertId:state.payments.length}]}
  if(sql.includes('UPDATE billing_records\n')){state.bills.find(b=>b.id===p[9]).status=p[0];return [{affectedRows:1}]}
  if(sql.startsWith('SELECT a.id AS appointment_id'))return [Number(p[0])===10&&Number(p[1])===40&&Number(p[2])===2?[{appointment_id:10,patient_id:30,doctor_id:40,branch_id:2,status:state.bills[0].status==='draft'?'in-progress':'completed',consultation_date:'2026-11-01',patient_name:'José Test',birthdate:'1995-05-02',sex:'male',address:'Clinic test address',doctor_name:'Dr. Test',prc_license:'123456',specialty:'General Medicine',branch_name:'Test Branch',branch_address:'Test Branch address'}]:[]]
  if(sql.startsWith('SELECT id,diagnosis FROM consultations'))return [[{id:20,diagnosis:'Visit diagnosis'}]]
  if(sql.startsWith('SELECT id,document_json,issued_at FROM medical_certificates'))return [clone(state.certificates)]
  if(sql.startsWith('INSERT INTO medical_certificates')){state.certificates.push({id:1,branch_id:p[0],appointment_id:p[1],consultation_id:p[2],doctor_id:p[3],document_json:p[4],issued_at:'2026-11-19'});return [{insertId:1}]}
  if(sql.startsWith('SELECT id,is_active FROM billing_addons'))return [clone(state.addons.filter(a=>a.id===Number(p[0])&&a.branch_id===p[1]))]
  if(sql.startsWith('SELECT * FROM billing_addons WHERE branch_id='))return [clone(state.addons.filter(a=>a.branch_id===p[0]))]
  if(sql.startsWith('SELECT id FROM billing_addons'))return [clone(state.addons.filter(a=>a.id===Number(p[0])&&a.branch_id===p[1]))]
  if(sql.startsWith('INSERT INTO billing_addons')){const id=6+state.addons.length;state.addons.push({id,branch_id:p[0],name:p[1],default_price:p[2],is_active:p[3]});return [{insertId:id}]}
  if(sql.startsWith('UPDATE billing_addons')){Object.assign(state.addons.find(a=>a.id===p[3]),{name:p[0],default_price:p[1],is_active:p[2]});return [{affectedRows:1}]}
  if(sql.startsWith('DELETE FROM billing_service_addons')){state.attached=state.attached.filter(a=>a.service_id!==p[0]||a.branch_id!==p[1]);return [{affectedRows:1}]}
  if(sql.startsWith('INSERT INTO billing_service_addons')){state.attached.push({branch_id:p[0],service_id:p[1],addon_id:p[2],price_override:p[3]});return [{affectedRows:1}]}
  throw Error('Unexpected SQL: '+sql)
 }
 const db={query,getConnection:async()=>{let release,before;return {query,beginTransaction:async()=>{const previous=lock;lock=new Promise(r=>release=r);await previous;before=clone(state)},commit:async()=>release(),rollback:async()=>{Object.assign(state,before);release()},release(){}}}}
 const audit={writeAuditLog:async entry=>state.audit.push(clone(entry))}
 const billing={...require('../../utils/billing'),getBillingRecordWithItems:readBill}
 const financial=load('utils/billingFinancialSnapshot.js',{'./billing':billing,'./billingTaxPolicy':{...require('../../utils/billingTaxPolicy'),loadTaxPolicy:async()=>require('../../utils/billingTaxPolicy').disabledPolicy()}})
 const addons=load('utils/serviceAddons.js',{'../db/connect':db,'./audit':audit,'./billingFinancialSnapshot':financial,'./billing':billing})
 const certificates=load('controllers/medicalCertificates.controller.js',{'../db/connect':db,'../utils/audit':audit})
 const imports={'../db/connect':db,'../utils/billing':billing,'../utils/payments':require('../../utils/payments'),'../utils/inputValidation':require('../../utils/inputValidation'),'../utils/date':require('../../utils/date'),'./billingCorrections.controller':{assertCashierOpen:async()=>{}},'../utils/clinicalInventoryReservations':{isUnifiedBillingStockOut:()=>false,assertNoUnpostedStockWithFeatureOff:async()=>{}},'../utils/audit':audit,'../utils/sse':{broadcast(){}}}
 const staff=load('controllers/staff.controller.js',new Proxy(imports,{getOwnPropertyDescriptor:()=>({configurable:true,enumerable:true,value:{}}),get:(t,k)=>t[k]||{}}))
 const response=()=>({statusCode:200,status(code){this.statusCode=code;return this},set(){return this},json(body){this.body=body;return this}})
 const call=async(fn,req)=>{const res=response();await fn(req,res,e=>{throw e});return res}
 const charge=body=>call(addons.confirm,{params:{id:1},branchId:2,user:{id:9,role:'staff'},body:{addon_id:6,service_id:5,expected_price:override??price,request_key:'test-charge',...body}})
 const pay=(billId,amount,key)=>call(staff.payBill,{params:{id:billId},branchId:2,user:{id:9,role:'staff'},body:{payment_method:'cash',payment_amount:amount,amount_received:amount,idempotency_key:key}})
 const certReq={params:{appointmentId:10},branchId:2,user:{id:40,role:'doctor'},body:{diagnosis:'Test diagnosis',recommendation:'Rest for two days.',remarks:'Follow up if symptoms persist.'}}
 return {state,db,addons,certificates,certReq,charge,pay,call,readBill}
}

module.exports={fixture,load}

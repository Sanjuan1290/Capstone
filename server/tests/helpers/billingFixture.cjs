const clone=value=>structuredClone(value)
function billingFixture(){
 const state={bill:{id:6,branch_id:1,status:'draft',version:1,subtotal:455,discount_amount:0,total_amount:455,consultation_id:11,payment_count:0},clinical:{status:'finalized'},requests:[],legacy:[],audit:[],logs:[]}
 state.items=[{id:90,billing_id:6,item_type:'service',source_type:'consultation',catalog_service_id:77,service_name:'Wound Dressing',quantity:1,line_total:455,details_json:JSON.stringify({pricing:{consultation_fee:350},materials:[{inventory_id:7,material_name:'Gloves',quantity:1,charge_total:40},{inventory_id:8,material_name:'Saline',quantity:1,charge_total:65}]})}]
 const conn={query:async(sql,args=[])=>{
  state.logs.push(sql)
  if(sql.includes('FROM consultations WHERE'))return [[clone(state.clinical)]]
  if(sql.includes('FROM billing_items bi JOIN'))return [clone(state.items)]
  if(sql.includes('FROM billing_records WHERE'))return [[...(Number(args[0])===state.bill.id&&Number(args[1])===state.bill.branch_id?[clone(state.bill)]:[])]]
  if(sql.includes('COALESCE(SUM(requested_amount),0)'))return [[{amount:state.requests.filter(r=>sql.includes("status IN")?['approved','pending'].includes(r.status):sql.includes("status='pending'")?r.status==='pending':r.status==='approved').reduce((sum,r)=>sum+Number(r.requested_amount),0)}]]
  if(sql.startsWith('SELECT requested_amount'))return [clone(state.requests.filter(r=>r.target_type===args[1]&&Number(r.catalog_service_id)===Number(args[2])&&Number(r.inventory_id||0)===Number(args[3])&&(sql.includes("status IN")?['pending','approved'].includes(r.status):r.status==='approved')))]
  if(sql.startsWith('SELECT * FROM billing_charge_adjustments WHERE id='))return [[...state.requests.filter(r=>r.id===args[0]&&r.billing_id===args[1]&&r.branch_id===args[2]).map(clone)]]
  if(sql.startsWith('SELECT * FROM billing_charge_adjustments WHERE branch_id='))return [clone(state.requests.filter(r=>r.branch_id===args[0]&&r.billing_id===args[1]))]
  if(sql.startsWith('INSERT INTO billing_charge_adjustments')){
   const id=5+state.requests.length
   const literalPending=sql.includes("'pending'")
   state.requests.push({id,branch_id:args[0],billing_id:args[1],bill_version:args[2],target_type:args[3],catalog_service_id:args[4],inventory_id:args[5],requested_amount:args[6],original_charge_snapshot:args[7],reason:args[8],status:literalPending?'pending':args[9],requester_role:args[literalPending?9:10],requester_user_id:args[literalPending?10:11],approved_by_admin_id:args[12],admin_note:args[14]})
   return [{insertId:id,affectedRows:1}]
  }
  if(sql.startsWith('UPDATE billing_records SET discount_amount=')){
   if(state.bill.id!==args[2]||state.bill.branch_id!==args[3]||state.bill.version!==args[4])return [{affectedRows:0}]
   state.bill.discount_amount=args[0];state.bill.total_amount=args[1];state.bill.version++;return [{affectedRows:1}]
  }
  if(sql.startsWith('UPDATE billing_charge_adjustments SET bill_version=')){
   state.requests.filter(r=>r.billing_id===args[1]&&(sql.includes('id<>?')?r.id!==args[2]:r.bill_version===args[2])&&r.status==='pending').forEach(r=>r.bill_version=args[0]);return [{affectedRows:1}]
  }
  if(sql.startsWith('UPDATE billing_adjustment_requests SET bill_version=')){state.legacy.filter(r=>r.billing_id===args[1]&&r.bill_version===args[2]&&['pending','approved'].includes(r.status)).forEach(r=>r.bill_version=args[0]);return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE billing_charge_adjustments SET status=')){
   const entry=state.requests.find(r=>r.id===args[3]&&r.status==='pending')
   if(!entry)return [{affectedRows:0}]
   Object.assign(entry,{status:args[0],approved_by_admin_id:args[1],admin_note:args[2]});return [{affectedRows:1}]
  }
  if(sql.startsWith('SELECT full_name FROM'))return [[{full_name:'Test actor'}]]
  if(sql.startsWith('INSERT INTO audit_logs')){state.audit.push(clone(args));return [{insertId:state.audit.length,affectedRows:1}]}
  throw new Error('Unexpected SQL '+sql)
 }}
 return {conn,state,stored:state}
}
module.exports={billingFixture}

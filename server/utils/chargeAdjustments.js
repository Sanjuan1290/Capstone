// Patient-specific financial concessions. These never change clinical usage or inventory.
const db=require('../db/connect')
const {writeAuditLog}=require('./audit')
const fail=(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code})
const money=n=>Math.round((Number(n)||0)*100)/100
const parse=v=>{try{return typeof v==='string'?JSON.parse(v||'{}'):(v||{})}catch{return {}}}
const isId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0
// Preserve the existing branch API permission flag. Requests still follow the
// normal approval workflow; this does not grant approval to a requester.
const canAdjustDirectly=role=>['admin','superadmin'].includes(String(role||'').toLowerCase())
async function getTargets(conn,billingId,branchId){
  const [lines]=await conn.query(`SELECT bi.*,br.status AS bill_status FROM billing_items bi JOIN billing_records br ON br.id=bi.billing_id WHERE br.id=? AND br.branch_id=? AND bi.source_type IN ('consultation','consultation_extra')`,[billingId,branchId])
  const targets=[]
  for(const line of lines){
    const sid=Number(line.catalog_service_id||0)
    if(!sid)continue
    if(line.item_type==='service'){
      const details=parse(line.details_json)
      const fee=money(details?.pricing?.consultation_fee)
      if(fee>0)targets.push({target_type:'service_fee',catalog_service_id:sid,inventory_id:null,label:`${line.service_name} — Service Fee`,original_charge:money(fee*Number(line.quantity||1))})
      for(const m of Array.isArray(details?.materials)?details.materials:[]){
        if(!m||typeof m!=='object')continue
        const id=Number(m.inventory_id||0),value=money(Number(m.charge_total||0)*Number(line.quantity||1))
        if(id>0&&value>0){
          const existing=targets.find(t=>t.target_type==='consumable'&&t.catalog_service_id===sid&&t.inventory_id===id)
          if(existing)existing.original_charge=money(existing.original_charge+value)
          else targets.push({target_type:'consumable',catalog_service_id:sid,inventory_id:id,label:`${line.service_name} — ${m.material_name}`,original_charge:value})
        }
      }
    } else if (line.item_type==='supply' && line.source_type==='consultation_extra' && line.source_inventory_id){
      const id=Number(line.source_inventory_id),value=money(line.line_total)
      const existing=targets.find(t=>t.target_type==='consumable'&&t.catalog_service_id===sid&&t.inventory_id===id)
      if(existing)existing.original_charge=money(existing.original_charge+value)
      else targets.push({target_type:'consumable',catalog_service_id:sid,inventory_id:id,label:`${line.service_name} — Extra Supply`,original_charge:value})
    }
  }
  return targets
}
async function approvedTotal(conn,billingId){
  const [[r]]=await conn.query(`SELECT COALESCE(SUM(requested_amount),0) AS amount FROM billing_charge_adjustments WHERE billing_id=? AND status='approved'`,[billingId])
  return money(r?.amount)
}
async function list(conn,billingId,branchId){
  const [[bill]]=await conn.query('SELECT id,status,version,subtotal FROM billing_records WHERE id=? AND branch_id=?',[billingId,branchId])
  if(!bill)throw fail(404,'BILL_NOT_FOUND','Bill not found in this branch.')
  const [rows]=await conn.query(`SELECT * FROM billing_charge_adjustments WHERE branch_id=? AND billing_id=? ORDER BY created_at DESC,id DESC`,[branchId,billingId])
  return {bill,targets:await getTargets(conn,billingId,branchId),requests:rows}
}
async function request({billingId,branchId,actorRole,actorId,targetType,serviceId,inventoryId,amount,reason}, conn=db){
  if(!isId(billingId)||!isId(branchId)||!isId(serviceId))throw fail(400,'INVALID_TARGET','Select a valid service.')
  if(!['service_fee','consumable'].includes(targetType))throw fail(400,'INVALID_TARGET','Select a service fee or consumable charge.')
  if(targetType==='consumable'&&!isId(inventoryId))throw fail(400,'INVALID_TARGET','Select a consumable.')
  const requested=money(amount)
  if(!Number.isFinite(Number(amount))||requested<=0||requested>99999999)throw fail(400,'INVALID_DISCOUNT','Enter a discount greater than ₱0.')
  const explanation=String(reason||'').trim()
  if(explanation.length<5||explanation.length>255)throw fail(400,'REASON_REQUIRED','Enter a reason between 5 and 255 characters.')
  const [[bill]]=await conn.query('SELECT id,version,subtotal,status,paid_at,consultation_id FROM billing_records WHERE id=? AND branch_id=? FOR UPDATE',[billingId,branchId])
  if(!bill)throw fail(404,'BILL_NOT_FOUND','Bill not found in this branch.')
  if(bill.paid_at || !['draft','pending'].includes(bill.status))throw fail(409,'BILL_LOCKED','Adjustments are allowed only before bill confirmation or payment.')
  const [[clinical]]=await conn.query('SELECT status FROM consultations WHERE id=? AND branch_id=?',[bill.consultation_id,branchId])
  if(!clinical||clinical.status!=='finalized')throw fail(409,'CONSULTATION_NOT_COMPLETED','Complete the consultation before requesting a charge adjustment.')
  const targets=await getTargets(conn,billingId,branchId)
  const target=targets.find(t=>t.target_type===targetType&&t.catalog_service_id===Number(serviceId)&&Number(t.inventory_id||0)===Number(inventoryId||0))
  if(!target)throw fail(409,'CHARGE_NOT_AVAILABLE','No eligible charge was found. Reload the bill; a historical service may not have itemized prices.')
  const [existing]=await conn.query(`SELECT requested_amount,status FROM billing_charge_adjustments WHERE billing_id=? AND target_type=? AND catalog_service_id=? AND COALESCE(inventory_id,0)=? AND status IN ('approved','pending')`,[billingId,targetType,serviceId,Number(inventoryId||0)])
  const committed=money(existing.reduce((sum,x)=>sum+Number(x.requested_amount),0))
  if(money(committed+requested)>money(target.original_charge))throw fail(400,'DISCOUNT_EXCEEDS_CHARGE','The requested reduction exceeds the remaining eligible charge.')
  const [[totals]]=await conn.query(`SELECT COALESCE(SUM(requested_amount),0) AS amount FROM billing_charge_adjustments WHERE billing_id=? AND status IN ('pending','approved')`,[billingId])
  if(money(Number(totals.amount)+requested)>money(bill.subtotal))throw fail(400,'DISCOUNT_EXCEEDS_SUBTOTAL','Total requested adjustments exceed the bill.')
  const [created]=await conn.query(`INSERT INTO billing_charge_adjustments (branch_id,billing_id,bill_version,target_type,catalog_service_id,inventory_id,requested_amount,original_charge_snapshot,reason,status,requester_role,requester_user_id) VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?)`,[branchId,billingId,bill.version,targetType,serviceId,inventoryId||null,requested,target.original_charge,explanation,actorRole,actorId])
  await writeAuditLog({userId:actorId,userRole:actorRole,branchId,action:'billing.charge_adjustment_requested',entityType:'billing_charge_adjustment',entityId:created.insertId,newValues:{billing_id:billingId,target_type:targetType,catalog_service_id:serviceId,inventory_id:inventoryId||null,requested_amount:requested,reason:explanation}},conn)
  return created.insertId
}
async function resolve({billingId,branchId,requestId,adminId,status,note},conn=db){
  if(!['approved','rejected'].includes(status))throw fail(400,'INVALID_STATUS','Approve or reject the request.')
  const [[bill]]=await conn.query('SELECT id,status,version,subtotal,paid_at,discount_amount,discount_type,discount_label FROM billing_records WHERE id=? AND branch_id=? FOR UPDATE',[billingId,branchId])
  if(!bill)throw fail(404,'BILL_NOT_FOUND','Bill not found in this branch.')
  const [[entry]]=await conn.query('SELECT * FROM billing_charge_adjustments WHERE id=? AND billing_id=? AND branch_id=? FOR UPDATE',[requestId,billingId,branchId])
  if(!entry)throw fail(404,'ADJUSTMENT_NOT_FOUND','Adjustment not found.')
  if(entry.status!=='pending')throw fail(409,'ADJUSTMENT_RESOLVED','Request already resolved.')
  // A requester cannot approve their own request; this applies across admin role aliases.
  if(status==='approved' && ['admin','superadmin'].includes(String(entry.requester_role||'').toLowerCase()) && Number(entry.requester_user_id)===Number(adminId))throw fail(403,'SELF_APPROVAL_DENIED','Another authorized administrator must review this request.')
  if(bill.paid_at||!['draft','pending'].includes(bill.status)||Number(entry.bill_version)!==Number(bill.version))throw fail(409,'ADJUSTMENT_STALE','Bill has changed. Submit a new request.')
  if(status==='rejected'&&!String(note||'').trim())throw fail(400,'REJECTION_REASON_REQUIRED','Enter a rejection reason.')
  if(status==='approved'){
    const targets=await getTargets(conn,billingId,branchId)
    const target=targets.find(t=>t.target_type===entry.target_type&&Number(t.catalog_service_id)===Number(entry.catalog_service_id)&&Number(t.inventory_id||0)===Number(entry.inventory_id||0))
    if(!target||money(target.original_charge)<money(entry.requested_amount))throw fail(409,'CHARGE_CHANGED','The target charge has changed. Request a new adjustment.')
    const previous=await approvedTotal(conn,billingId)
    const total=money(previous+Number(entry.requested_amount))
    const nonCourtesy=money(Math.max(0,Number(bill.discount_amount)-previous))
    if(money(total+nonCourtesy)>money(bill.subtotal))throw fail(409,'DISCOUNT_EXCEEDS_SUBTOTAL','Approved adjustments exceed the current bill.')
    await conn.query(`UPDATE billing_records SET discount_amount=?,total_amount=?,version=version+1,discount_type=IF(discount_type='none','courtesy',discount_type),discount_label=IF(discount_label IS NULL OR discount_label='','Approved charge reduction',IF(INSTR(discount_label,'Approved charge reduction')>0,discount_label,CONCAT(discount_label,' + Approved charge reduction'))) WHERE id=? AND branch_id=? AND version=?`,[money(total+nonCourtesy),money(Number(bill.subtotal)-total-nonCourtesy),billingId,branchId,bill.version])
    // A monetary-only reduction does not invalidate independent pending requests.
    // Rebase their expected version atomically; each decision rechecks the live cap.
    await conn.query(`UPDATE billing_charge_adjustments SET bill_version=? WHERE billing_id=? AND status='pending' AND id<>?`,[Number(bill.version)+1,billingId,requestId])
    await conn.query(`UPDATE billing_adjustment_requests SET bill_version=? WHERE billing_id=? AND status='pending'`,[Number(bill.version)+1,billingId])
  }
  await conn.query(`UPDATE billing_charge_adjustments SET status=?,resolved_at=NOW(),approved_by_admin_id=?,admin_note=? WHERE id=? AND status='pending'`,[status,status==='approved'?adminId:null,String(note||'').trim().slice(0,255)||null,requestId])
  await writeAuditLog({userId:adminId,userRole:'admin',branchId,action:`billing.charge_adjustment_${status}`,entityType:'billing_charge_adjustment',entityId:requestId,oldValues:{status:'pending'},newValues:{status,billing_id:billingId,amount:entry.requested_amount,reason:entry.reason}},conn)
  return {status,discount_amount:status==='approved'?money(Number(bill.discount_amount)+Number(entry.requested_amount)):Number(bill.discount_amount)}
}
// Existing checkout clients send an inclusive amount; updated clients send the
// preset separately. Never count an approved courtesy reduction twice.
const requestedPresetDiscount=(body={},courtesy=0)=>{
  const amount=Object.prototype.hasOwnProperty.call(body,'preset_discount_amount')
    ? Number(body.preset_discount_amount)
    : Number(body.discount_amount||0)-Number(courtesy||0)
  return money(Math.max(0,Number.isFinite(amount)?amount:0))
}
module.exports={getTargets,approvedTotal,list,request,resolve,money,requestedPresetDiscount,canAdjustDirectly}



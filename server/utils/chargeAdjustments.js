// Patient-specific financial concessions. These never change clinical usage or inventory.
const db=require('../db/connect')
const {writeAuditLog}=require('./audit')
const fail=(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code})
const money=n=>Math.round(((Number(n)||0)+Number.EPSILON)*100)/100
const parse=v=>{try{return typeof v==='string'?JSON.parse(v||'{}'):(v||{})}catch{return {}}}
const isId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0
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
      for(const m of details.materials||[]){
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
const canAdjustDirectly = role => ['admin', 'superadmin'].includes(role)
const adminAccount = role => canAdjustDirectly(role) ? 'admin' : role
function assertEditable(bill) {
  if (bill.paid_at || Number(bill.payment_count || 0)>0 || !['draft', 'pending'].includes(bill.status)) throw fail(409, 'BILL_LOCKED', 'Adjustments are allowed only before bill confirmation or payment.')
}
async function applyReduction(conn, bill, entry, branchId) {
  const targets = await getTargets(conn, bill.id, branchId)
  const target = targets.find(t => t.target_type === entry.target_type && Number(t.catalog_service_id) === Number(entry.catalog_service_id) && Number(t.inventory_id || 0) === Number(entry.inventory_id || 0))
  const [approved] = await conn.query(`SELECT requested_amount FROM billing_charge_adjustments WHERE billing_id=? AND target_type=? AND catalog_service_id=? AND COALESCE(inventory_id,0)=? AND status='approved'`, [bill.id, entry.target_type, entry.catalog_service_id, Number(entry.inventory_id || 0)])
  const used = money(approved.reduce((sum, row) => sum + Number(row.requested_amount), 0))
  if (!target || money(used + Number(entry.requested_amount)) > money(target.original_charge)) throw fail(409, 'CHARGE_CHANGED', 'The remaining charge is too small. Review or reject this request.')
  const discount = money(Number(bill.discount_amount || 0) + Number(entry.requested_amount))
  if (discount > money(bill.subtotal)) throw fail(409, 'DISCOUNT_EXCEEDS_SUBTOTAL', 'This reduction exceeds the balance after existing discounts.')
  const [result] = await conn.query(`UPDATE billing_records SET discount_amount=?,total_amount=?,version=version+1,updated_at=NOW(),discount_type=IF(discount_type='none','courtesy',discount_type),discount_label=IF(discount_label IS NULL OR discount_label='','Approved charge reduction',IF(INSTR(discount_label,'Approved charge reduction')>0,discount_label,CONCAT(discount_label,' + Approved charge reduction'))) WHERE id=? AND branch_id=? AND version=?`, [discount, money(Number(bill.subtotal) - discount), bill.id, branchId, bill.version])
  if (Number(result.affectedRows) !== 1) throw fail(409, 'BILL_VERSION_CONFLICT', 'The bill changed. Reload and try again.')
  // Only a reduction changed: charge lines are identical. Carry independent
  // pending requests and preset approvals forward, then revalidate on resolution.
  await conn.query(`UPDATE billing_charge_adjustments SET bill_version=? WHERE billing_id=? AND bill_version=? AND status='pending'`, [Number(bill.version) + 1, bill.id, bill.version])
  await conn.query(`UPDATE billing_adjustment_requests SET bill_version=? WHERE billing_id=? AND bill_version=? AND status IN ('pending','approved')`, [Number(bill.version) + 1, bill.id, bill.version])
  return discount
}
async function request({billingId,branchId,actorRole,actorId,targetType,serviceId,inventoryId,amount,reason,allowDraft=false}, conn=db) {
  if (!['staff','doctor','admin','superadmin'].includes(actorRole) || !isId(actorId)) throw fail(403, 'ADJUSTMENT_FORBIDDEN', 'You cannot adjust this bill.')
  if (!isId(billingId) || !isId(branchId) || !isId(serviceId)) throw fail(400,'INVALID_TARGET','Select a valid service.')
  if (!['service_fee','consumable'].includes(targetType) || (targetType === 'consumable' && !isId(inventoryId))) throw fail(400,'INVALID_TARGET','Select a service fee or consumable charge.')
  const requested = money(amount)
  if (!['number','string'].includes(typeof amount) || !Number.isFinite(Number(amount)) || requested <= 0 || requested > 99999999 || Math.abs(Number(amount)-requested)>0.0000001) throw fail(400,'INVALID_DISCOUNT','Enter a positive reduction with at most two decimal places.')
  const explanation = String(reason || '').trim()
  if (explanation.length < 5 || explanation.length > 255) throw fail(400,'REASON_REQUIRED','Enter a reason between 5 and 255 characters.')
  const [[bill]] = await conn.query('SELECT id,version,subtotal,status,paid_at,consultation_id,discount_amount,(SELECT COUNT(*) FROM billing_payments WHERE billing_id=billing_records.id) AS payment_count FROM billing_records WHERE id=? AND branch_id=? FOR UPDATE',[billingId,branchId])
  if (!bill) throw fail(404,'BILL_NOT_FOUND','Bill not found in this branch.')
  assertEditable(bill)
  const [[clinical]] = await conn.query('SELECT status FROM consultations WHERE id=? AND branch_id=?',[bill.consultation_id,branchId])
  if (!clinical || (clinical.status !== 'finalized' && !(allowDraft && actorRole==='doctor' && clinical.status==='draft'))) throw fail(409,'CONSULTATION_NOT_COMPLETED','Complete the consultation before requesting a charge adjustment.')
  const target = (await getTargets(conn,billingId,branchId)).find(t => t.target_type === targetType && t.catalog_service_id === Number(serviceId) && Number(t.inventory_id || 0) === Number(inventoryId || 0))
  if (!target) throw fail(409,'CHARGE_NOT_AVAILABLE','No eligible charge was found. Reload the bill.')
  const [existing] = await conn.query(`SELECT requested_amount,status FROM billing_charge_adjustments WHERE billing_id=? AND target_type=? AND catalog_service_id=? AND COALESCE(inventory_id,0)=? AND status IN ('approved','pending')`,[billingId,targetType,serviceId,Number(inventoryId || 0)])
  if (money(existing.reduce((sum,x)=>sum+Number(x.requested_amount),0)+requested) > money(target.original_charge)) throw fail(400,'DISCOUNT_EXCEEDS_CHARGE','The requested reduction exceeds the remaining eligible charge.')
  const [[pending]] = await conn.query(`SELECT COALESCE(SUM(requested_amount),0) AS amount FROM billing_charge_adjustments WHERE billing_id=? AND status='pending'`,[billingId])
  if (money(Number(bill.discount_amount || 0)+Number(pending.amount)+requested)>money(bill.subtotal)) throw fail(400,'DISCOUNT_EXCEEDS_SUBTOTAL','Requested reductions exceed the balance after existing discounts.')
  const direct = canAdjustDirectly(actorRole)
  if (direct) await applyReduction(conn, bill, {target_type:targetType,catalog_service_id:serviceId,inventory_id:inventoryId,requested_amount:requested}, branchId)
  const [created] = await conn.query(`INSERT INTO billing_charge_adjustments (branch_id,billing_id,bill_version,target_type,catalog_service_id,inventory_id,requested_amount,original_charge_snapshot,reason,status,requester_role,requester_user_id,approved_by_admin_id,resolved_at,admin_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,IF(?='approved',NOW(),NULL),?)`,[branchId,billingId,Number(bill.version)+(direct?1:0),targetType,serviceId,inventoryId||null,requested,target.original_charge,explanation,direct?'approved':'pending',actorRole,actorId,direct?actorId:null,direct?'approved':'pending',direct?'Authorized direct adjustment':null])
  await writeAuditLog({userId:actorId,userRole:actorRole,branchId,action:direct?'billing.charge_adjustment_direct':'billing.charge_adjustment_requested',entityType:'billing_charge_adjustment',entityId:created.insertId,newValues:{billing_id:billingId,bill_version:bill.version,target_type:targetType,catalog_service_id:serviceId,inventory_id:inventoryId||null,requested_amount:requested,status:direct?'approved':'pending',reason:explanation}},conn)
  return created.insertId
}
async function resolve({billingId,branchId,requestId,adminId,actorRole='admin',status,note},conn=db) {
  if (!canAdjustDirectly(actorRole) || !isId(adminId)) throw fail(403,'ADJUSTMENT_FORBIDDEN','Administrator approval is required.')
  if (!['approved','rejected'].includes(status)) throw fail(400,'INVALID_STATUS','Approve or reject the request.')
  const [[bill]] = await conn.query('SELECT id,status,version,subtotal,consultation_id,paid_at,discount_amount,discount_type,discount_label,(SELECT COUNT(*) FROM billing_payments WHERE billing_id=billing_records.id) AS payment_count FROM billing_records WHERE id=? AND branch_id=? FOR UPDATE',[billingId,branchId])
  if (!bill) throw fail(404,'BILL_NOT_FOUND','Bill not found in this branch.')
  const [[entry]] = await conn.query('SELECT * FROM billing_charge_adjustments WHERE id=? AND billing_id=? AND branch_id=? FOR UPDATE',[requestId,billingId,branchId])
  if (!entry) throw fail(404,'ADJUSTMENT_NOT_FOUND','Adjustment not found.')
  if (entry.status !== 'pending') throw fail(409,'ADJUSTMENT_RESOLVED','Request already resolved.')
  if (status === 'approved' && adminAccount(entry.requester_role) === 'admin' && Number(entry.requester_user_id) === Number(adminId)) throw fail(403,'SELF_APPROVAL_FORBIDDEN','Another administrator must resolve your request.')
  const explanation = String(note || '').trim()
  if (explanation.length > 255 || (status === 'rejected' && !explanation)) throw fail(400,'REJECTION_REASON_REQUIRED','Enter a rejection reason of up to 255 characters.')
  let discount = money(bill.discount_amount)
  if (status === 'approved') {
    assertEditable(bill)
    const [[clinical]]=await conn.query('SELECT status FROM consultations WHERE id=? AND branch_id=?',[bill.consultation_id,branchId])
    if(clinical?.status!=='finalized')throw fail(409,'CONSULTATION_NOT_COMPLETED','Complete the consultation before approving reductions.')
    if (Number(entry.bill_version) !== Number(bill.version)) throw fail(409,'ADJUSTMENT_STALE','Bill charges changed. Reject this request and submit a new one.')
    discount = await applyReduction(conn, bill, entry, branchId)
  }
  const [result] = await conn.query(`UPDATE billing_charge_adjustments SET status=?,resolved_at=NOW(),approved_by_admin_id=?,admin_note=? WHERE id=? AND status='pending'`,[status,adminId,explanation||null,requestId])
  if (Number(result.affectedRows)!==1) throw fail(409,'ADJUSTMENT_RESOLVED','Request already resolved.')
  await writeAuditLog({userId:adminId,userRole:actorRole,branchId,action:`billing.charge_adjustment_${status}`,entityType:'billing_charge_adjustment',entityId:requestId,oldValues:{status:'pending',bill_version:entry.bill_version},newValues:{status,billing_id:billingId,amount:entry.requested_amount,reason:entry.reason}},conn)
  return {status,discount_amount:discount}
}
async function cancel({billingId,branchId,requestId,actorRole,actorId},conn=db){
 const [[bill]]=await conn.query('SELECT id FROM billing_records WHERE id=? AND branch_id=? FOR UPDATE',[billingId,branchId])
 if(!bill)throw fail(404,'BILL_NOT_FOUND','Bill not found in this branch.')
 const [[entry]]=await conn.query('SELECT * FROM billing_charge_adjustments WHERE id=? AND billing_id=? AND branch_id=? FOR UPDATE',[requestId,billingId,branchId])
 if(!entry||adminAccount(entry.requester_role)!==adminAccount(actorRole)||Number(entry.requester_user_id)!==Number(actorId))throw fail(403,'ADJUSTMENT_FORBIDDEN','Only the requester may cancel this request.')
 if(entry.status!=='pending')throw fail(409,'ADJUSTMENT_RESOLVED','Request already resolved.')
 const [result]=await conn.query(`UPDATE billing_charge_adjustments SET status=?,resolved_at=NOW(),approved_by_admin_id=?,admin_note=? WHERE id=? AND status='pending'`,['rejected',null,'Cancelled by requester',requestId])
 if(Number(result.affectedRows)!==1)throw fail(409,'ADJUSTMENT_RESOLVED','Request already resolved.')
 await writeAuditLog({userId:actorId,userRole:actorRole,branchId,action:'billing.charge_adjustment_cancelled',entityType:'billing_charge_adjustment',entityId:requestId,oldValues:{status:'pending'},newValues:{status:'rejected',billing_id:billingId}},conn)
 return {status:'rejected',message:'Request cancelled.'}
}
// Existing checkout clients send an inclusive amount; updated clients send the
// preset separately. Never count an approved courtesy reduction twice.
const requestedPresetDiscount=(body={},courtesy=0,promotion=0)=>{
  const amount=Object.prototype.hasOwnProperty.call(body,'preset_discount_amount')
    ? Number(body.preset_discount_amount)
    : Number(body.discount_amount||0)-Number(courtesy||0)-Number(promotion||0)
  return money(Math.max(0,Number.isFinite(amount)?amount:0))
}
module.exports={getTargets,approvedTotal,list,request,resolve,money,requestedPresetDiscount,canAdjustDirectly,cancel}

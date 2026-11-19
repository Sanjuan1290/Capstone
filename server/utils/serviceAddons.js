const db = require('../db/connect')
const { writeAuditLog } = require('./audit')
const fail = (statusCode, message, code='ADDON_INVALID') => Object.assign(new Error(message), {statusCode,code})
const id = value => ['number','string'].includes(typeof value) && /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value))
const money = value => {
 if(value === '' || value == null || !['number','string'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value)) || Number(value)>99999999.99)throw fail(400,'Enter a peso price from 0 to 99,999,999.99 with at most two decimals.')
 return Number(value)
}
async function saveServiceAddons(conn, branchId, serviceId, addons) {
 if(addons===undefined)return // Older clients retain configured add-ons.
 if(!Array.isArray(addons)||addons.length>100)throw fail(400,'Choose a valid add-on list.')
 const seen=new Set(), rows=[]
 for(const item of addons){
  const addonId=Number(item.addon_id)
  if(!id(addonId)||seen.has(addonId))throw fail(400,'An add-on may be attached only once.')
  seen.add(addonId)
  const [[addon]]=await conn.query('SELECT id,is_active FROM billing_addons WHERE id=? AND branch_id=? FOR UPDATE',[addonId,branchId])
  if(!addon)throw fail(404,'Add-on not found in this branch.')
  const override=item.price_override==null||item.price_override===''?null:money(item.price_override)
  rows.push([branchId,serviceId,addonId,override])
 }
 await conn.query('DELETE FROM billing_service_addons WHERE service_id=? AND branch_id=?',[serviceId,branchId])
 for(const row of rows)await conn.query('INSERT INTO billing_service_addons (branch_id,service_id,addon_id,price_override) VALUES (?,?,?,?)',row)
}
async function serviceAddonRows(serviceIds, conn=db) {
 if(!serviceIds.length)return []
 const [rows]=await conn.query(`SELECT sa.service_id,sa.addon_id,sa.price_override,a.name,a.default_price,a.is_active,
 COALESCE(sa.price_override,a.default_price) AS price FROM billing_service_addons sa
 JOIN billing_addons a ON a.id=sa.addon_id AND a.branch_id=sa.branch_id
 JOIN billing_service_catalog s ON s.id=sa.service_id AND s.branch_id=sa.branch_id
 WHERE sa.service_id IN (${serviceIds.map(()=>'?').join(',')}) ORDER BY a.name`,serviceIds)
 return rows
}
async function ownedBill(conn, billId, branchId, lock=false){
 if(!id(billId)||!id(branchId))throw fail(400,'Invalid bill or branch.')
 const [[bill]]=await conn.query(`SELECT * FROM billing_records WHERE id=? AND branch_id=?${lock?' FOR UPDATE':''}`,[billId,branchId])
 if(!bill)throw fail(404,'Bill not found in this branch.')
 return bill
}
async function available(conn,bill){
 const [rows]=await conn.query(`SELECT DISTINCT sa.service_id,s.service_name,sa.addon_id,a.name,
 COALESCE(sa.price_override,a.default_price) AS price
 FROM billing_items bi JOIN billing_service_catalog s ON s.id=bi.catalog_service_id AND s.branch_id=?
 JOIN billing_service_addons sa ON sa.service_id=s.id AND sa.branch_id=s.branch_id
 JOIN billing_addons a ON a.id=sa.addon_id AND a.branch_id=sa.branch_id AND a.is_active=1
 WHERE bi.billing_id=? AND bi.item_type='service' ORDER BY s.service_name,a.name`,[bill.branch_id,bill.id])
 return rows
}
async function confirmCharge(req,conn){
 const bill=await ownedBill(conn,Number(req.params.id),req.branchId,true)
 if(bill.original_bill_id)throw fail(409,'Create add-on charges from the original visit bill.')
 if(!['draft','pending','ready','paid','partially_paid'].includes(bill.status))throw fail(409,'This bill cannot accept new add-on charges.')
 const {addon_id,service_id,request_key}=req.body||{}
 if(!id(addon_id)||!id(service_id)||typeof request_key!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}$/.test(request_key))throw fail(400,'Select an add-on and supply a valid request key.')
 // Original bill lock serializes retries, including different request keys after reload.
 const [[existing]]=await conn.query('SELECT * FROM billing_addon_charges WHERE original_bill_id=? AND service_id=? AND addon_id=? FOR UPDATE',[bill.id,service_id,addon_id])
 if(existing)return {...existing,replayed:true}
 const [[usedKey]]=await conn.query('SELECT id FROM billing_addon_charges WHERE branch_id=? AND request_key=?',[req.branchId,request_key])
 if(usedKey)throw fail(409,'This submission key already belongs to another charge.','IDEMPOTENCY_KEY_CONFLICT')
 const choices=await available(conn,bill)
 const selected=choices.find(r=>Number(r.addon_id)===Number(addon_id)&&Number(r.service_id)===Number(service_id))
 if(!selected)throw fail(404,'This add-on is not configured for a service on this bill.')
 const price=money(selected.price)
 if(money(req.body.expected_price)!==price)throw fail(409,'The add-on price changed. Review the new price before confirming.','ADDON_PRICE_CHANGED')
 const [[paymentHistory]]=await conn.query('SELECT COUNT(*) AS count FROM billing_payments WHERE billing_id=?',[bill.id])
 const editable=['draft','pending'].includes(bill.status) && !bill.finalized_at && Number(paymentHistory.count)===0
 let targetId=bill.id
 if(!editable){
  const [result]=await conn.query(`INSERT INTO billing_records
   (appointment_id,consultation_id,patient_id,doctor_id,branch_id,original_bill_id,charge_key,status,subtotal,total_amount)
   VALUES (?,?,?,?,?,?,?,'pending',?,?)`,[bill.appointment_id,bill.consultation_id,bill.patient_id,bill.doctor_id,bill.branch_id,bill.id,`addon:${service_id}:${addon_id}`,price,price])
  targetId=result.insertId
 }
 const [charge]=await conn.query(`INSERT INTO billing_addon_charges
  (branch_id,original_bill_id,consultation_id,service_id,addon_id,billing_id,name_snapshot,price_snapshot,request_key)
  VALUES (?,?,?,?,?,?,?,?,?)`,[bill.branch_id,bill.id,bill.consultation_id,service_id,addon_id,targetId,selected.name,price,request_key])
 await conn.query(`INSERT INTO billing_items
  (billing_id,item_type,source_type,source_reference_id,category,service_name,quantity,base_amount,markup_percentage,unit_price,line_total,details_json,notes,sort_order)
  VALUES (?,'custom','service_addon',?,'Add-ons',?,1,?,0,?,?,?, 'Manually confirmed configured add-on',1000)`,
  [targetId,charge.insertId,selected.name,price,price,price,JSON.stringify({addon_id:Number(addon_id),service_id:Number(service_id),original_bill_id:bill.id,price_snapshot:price})])
 await require('./billingFinancialSnapshot').refreshDraftFinancialTotals(targetId,bill.branch_id,conn,{newBill:!editable})
 if(editable){
  await conn.query('UPDATE billing_records SET version=version+1 WHERE id=? AND branch_id=?',[targetId,bill.branch_id])
 }else{
  const target=await require('./billing').getBillingRecordWithItems(targetId,conn)
  await require('./billingFinancialSnapshot').confirmFinancialSnapshot(target,conn)
  await conn.query("UPDATE billing_records SET status=?,finalized_at=NOW() WHERE id=? AND branch_id=?",[price===0?'paid':'ready',targetId,bill.branch_id])
 }
 await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||req.user.role,branchId:bill.branch_id,action:'billing.addon_confirmed',entityType:'billing_record',entityId:targetId,newValues:{original_bill_id:bill.id,addon_id,service_id,price},ipAddress:req.ip},conn)
 return {id:charge.insertId,billing_id:targetId,original_bill_id:bill.id,price_snapshot:price,name_snapshot:selected.name,free:price===0,replayed:false}
}
const handle=fn=>async(req,res,next)=>{try{res.json(await fn(req))}catch(e){if(e.statusCode)return res.status(e.statusCode).json({message:e.message,code:e.code});next(e)}}
const list=handle(async req=>{if(!id(req.branchId))throw fail(403,'Select an authorized branch.');const [rows]=await db.query('SELECT * FROM billing_addons WHERE branch_id=? ORDER BY name',[req.branchId]);return rows})
const save=handle(async req=>{
 if(!id(req.branchId))throw fail(403,'Select an authorized branch.')
 const name=String(req.body?.name||'').trim(),price=money(req.body?.default_price)
 if(!name||name.length>120)throw fail(400,'Enter an add-on name up to 120 characters.')
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const addonId=Number(req.params.addonId||0),active=req.body.is_active===false||Number(req.body.is_active)===0?0:1
  if(addonId){const [[owned]]=await conn.query('SELECT id FROM billing_addons WHERE id=? AND branch_id=? FOR UPDATE',[addonId,req.branchId]);if(!owned)throw fail(404,'Add-on not found in this branch.')}
  const [result]=addonId?await conn.query('UPDATE billing_addons SET name=?,default_price=?,is_active=? WHERE id=? AND branch_id=?',[name,price,active,addonId,req.branchId]):await conn.query('INSERT INTO billing_addons (branch_id,name,default_price,is_active) VALUES (?,?,?,?)',[req.branchId,name,price,active])
  const savedId=addonId||result.insertId
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||req.user.role,branchId:req.branchId,action:'catalog.addon_saved',entityType:'billing_addon',entityId:savedId,newValues:{name,default_price:price,is_active:active},ipAddress:req.ip},conn)
  await conn.commit();return {id:savedId,name,default_price:price,is_active:active}
 }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')throw fail(409,'This add-on name already exists in this branch.');throw e}finally{conn.release()}
})
const options=handle(async req=>{
 const bill=await ownedBill(db,Number(req.params.id),req.branchId)
 const [charges]=await db.query('SELECT * FROM billing_addon_charges WHERE original_bill_id=? AND branch_id=? ORDER BY id',[bill.original_bill_id||bill.id,req.branchId])
 return {options:bill.original_bill_id?[]:await available(db,bill),charges}
})
const confirm=handle(async req=>{
 const conn=await db.getConnection()
 try{await conn.beginTransaction();const result=await confirmCharge(req,conn);await conn.commit();return result}catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')throw fail(409,'This add-on submission already exists. Reload the bill to view it.','ADDON_ALREADY_EXISTS');throw e}finally{conn.release()}
})
module.exports={money,saveServiceAddons,serviceAddonRows,ownedBill,available,confirmCharge,list,save,options,confirm}

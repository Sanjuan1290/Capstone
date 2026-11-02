// System Setup removal: unused reference data is deleted; used data is deactivated.
// Table names and reference queries are intentionally hard-coded; user input is bound.
const db = require('../db/connect')
const {writeAuditLog} = require('./audit')
const positiveId = v => Number.isSafeInteger(Number(v)) && Number(v)>0
const references = {
  visit_reasons: {
    table:'appointment_reason_options', title:'Patient visit reason', entity:'visit_reason',
    usage:(r,b)=>[[`SELECT COUNT(*) AS n FROM appointments WHERE branch_id=? AND LOWER(COALESCE(reason,''))=LOWER(?) AND (clinic_type=? OR ?='all')`,[b,r.label,r.clinic_type,r.clinic_type]],
      // Old booking rows contain free-text reasons, not a stable reason ID. A
      // renamed reason cannot safely be proven unused if bookings occurred later.
      [`SELECT COUNT(*) AS n FROM appointments WHERE branch_id=? AND created_at>=? AND (clinic_type=? OR ?='all')`,[b,r.created_at,r.clinic_type,r.clinic_type]]]
  },
  cancellation_reasons: {
    table:'appointment_cancellation_reasons', title:'Cancellation reason', entity:'cancellation_reason',
    usage:(r,b)=>[[`SELECT COUNT(*) AS n FROM appointments WHERE branch_id=? AND (cancellation_reason_id=? OR LOWER(COALESCE(cancellation_reason_snapshot,''))=LOWER(?))`,[b,r.id,r.label]]]
  },
  service_categories: {
    table:'billing_service_categories', title:'Service category', entity:'billing_service_category',
    usage:(r,b)=>[[`SELECT COUNT(*) AS n FROM billing_service_catalog WHERE branch_id=? AND category_id=?`,[b,r.id]]]
  },
  suppliers: {
    table:'inventory_suppliers', title:'Supplier', entity:'inventory_supplier',
    usage:(r,b)=>[[`SELECT COUNT(*) AS n FROM inventory WHERE branch_id=? AND supplier_id=?`,[b,r.id]],
       [`SELECT COUNT(*) AS n FROM inventory_batches WHERE branch_id=? AND supplier_id=?`,[b,r.id]]]
  },
  location_types: {
    table:'inventory_location_types', title:'Storage location type', entity:'inventory_location_type',
    usage:(r,b)=>[[`SELECT COUNT(*) AS n FROM inventory WHERE branch_id=? AND location_type_id=?`,[b,r.id]],
       [`SELECT COUNT(*) AS n FROM inventory_locations WHERE branch_id=? AND location_type=?`,[b,r.code]]]
  },
  movement_reasons: {
    table:'inventory_movement_reasons', title:'Movement reason', entity:'inventory_movement_reason',
    usage:(r,b)=>[[`SELECT COUNT(*) AS n FROM inventory_logs WHERE branch_id=? AND movement_type=?`,[b,r.code]]]
  }
}
async function removeBranchReference(req,res,kind){
  const config=references[kind],id=Number(req.params.id??req.params.reasonId),branchId=Number(req.branchId)
  if(!config||!positiveId(id)||!positiveId(branchId))return res.status(400).json({message:'Choose a valid System Setup record.'})
  const conn=await db.getConnection()
  try{
    await conn.beginTransaction()
    const [[record]]=await conn.query(`SELECT * FROM ${config.table} WHERE id=? AND branch_id=? FOR UPDATE`,[id,branchId])
    if(!record){await conn.rollback();return res.status(404).json({message:`${config.title} not found in this branch.`})}
    if(kind==='movement_reasons' && (record.branch_id==null||Number(record.is_system)===1)){
      await conn.rollback();return res.status(403).json({code:'SHARED_REASON_PROTECTED',message:'Shared and built-in movement reasons are managed by Super Admin.'})
    }
    let count=0
    for(const [sql,args] of config.usage(record,branchId)){
      const [[value]]=await conn.query(sql,args);count+=Number(value?.n||0)
    }
    if(count){
      if(Number(record.is_active)!==0)await conn.query(`UPDATE ${config.table} SET is_active=0 WHERE id=? AND branch_id=?`,[id,branchId])
      await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action:`system.${kind}.deactivated`,entityType:config.entity,entityId:id,branchId,oldValues:record,newValues:{is_active:0,usage_count:count},ipAddress:req.ip},conn)
      await conn.commit()
      return res.json({deleted:false,deactivated:true,usage_count:count,message:`${config.title} deactivated. Existing records are preserved.`})
    }
    await conn.query(`DELETE FROM ${config.table} WHERE id=? AND branch_id=?`,[id,branchId])
    await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action:`system.${kind}.deleted`,entityType:config.entity,entityId:id,branchId,oldValues:record,newValues:null,ipAddress:req.ip},conn)
    await conn.commit()
    return res.json({deleted:true,deactivated:false,usage_count:0,message:`${config.title} permanently deleted.`})
  }catch(error){
    await conn.rollback().catch(()=>{})
    if(['ER_ROW_IS_REFERENCED_2','ER_ROW_IS_REFERENCED'].includes(error.code))return res.status(409).json({code:'REFERENCE_IN_USE',message:`${config.title} is referenced by another record. Deactivate it instead.`})
    throw error
  }finally{conn.release()}
}
async function removeGlobalReference(req,res,kind){
 const types={
  suppliers:{table:'inventory_suppliers',title:'Supplier',entity:'inventory_supplier',refs:r=>[
    ['SELECT COUNT(*) n FROM inventory WHERE supplier_id=?',[r.id]],
    ['SELECT COUNT(*) n FROM inventory_batches WHERE supplier_id=?',[r.id]]]},
  location_types:{table:'inventory_location_types',title:'Storage location type',entity:'inventory_location_type',refs:r=>[
    ['SELECT COUNT(*) n FROM inventory WHERE location_type_id=?',[r.id]],
    ['SELECT COUNT(*) n FROM inventory_locations WHERE location_type=?',[r.code]]]},
  movement_reasons:{table:'inventory_movement_reasons',title:'Movement reason',entity:'inventory_movement_reason',refs:r=>[
    ['SELECT COUNT(*) n FROM inventory_logs WHERE movement_type=?',[r.code]]]},
  visit_reasons:{table:'appointment_reason_options',title:'Patient visit reason',entity:'visit_reason',refs:r=>[
    [`SELECT COUNT(*) n FROM appointments WHERE created_at>=? AND (clinic_type=? OR ?='all')`,[r.created_at,r.clinic_type,r.clinic_type]]]},
 }
 const config=types[kind],id=Number(req.params.id??req.params.reasonId)
 if(!config||!positiveId(id))return res.status(400).json({message:'Choose a valid System Setup record.'})
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const extra=kind==='movement_reasons'?' AND branch_id IS NULL':''
  const [[record]]=await conn.query(`SELECT * FROM ${config.table} WHERE id=?${extra} FOR UPDATE`,[id])
  if(!record){await conn.rollback();return res.status(404).json({message:`${config.title} not found.`})}
  if(kind==='movement_reasons' && Number(record.is_system)===1){
   await conn.rollback();return res.status(409).json({code:'BUILT_IN_REASON_PROTECTED',message:'Built-in movement reasons cannot be permanently deleted. Keep their stable movement codes.'})
  }
  let usage=0
  for(const [sql,args] of config.refs(record)){const [[found]]=await conn.query(sql,args);usage+=Number(found?.n||0)}
  if(usage){
   if(Number(record.is_active)!==0)await conn.query(`UPDATE ${config.table} SET is_active=0 WHERE id=?${extra}`,[id])
   await writeAuditLog({userId:req.user.id,userRole:'superadmin',action:`system.${kind}.deactivated`,entityType:config.entity,entityId:id,oldValues:record,newValues:{is_active:0,usage_count:usage},ipAddress:req.ip},conn)
   await conn.commit()
   return res.json({deleted:false,deactivated:true,usage_count:usage,message:`${config.title} deactivated; historical records are preserved.`})
  }
  await conn.query(`DELETE FROM ${config.table} WHERE id=?${extra}`,[id])
  await writeAuditLog({userId:req.user.id,userRole:'superadmin',action:`system.${kind}.deleted`,entityType:config.entity,entityId:id,oldValues:record,ipAddress:req.ip},conn)
  await conn.commit()
  return res.json({deleted:true,deactivated:false,usage_count:0,message:`Unused ${config.title.toLowerCase()} permanently deleted.`})
 }catch(error){await conn.rollback().catch(()=>{});if(['ER_ROW_IS_REFERENCED_2','ER_ROW_IS_REFERENCED'].includes(error.code))return res.status(409).json({code:'REFERENCE_IN_USE',message:'Record is still referenced. Deactivate it instead.'});throw error}
 finally{conn.release()}
}
// Global Super Admin Stock Room removal. All ownership and history checks stay
// within the selected location's saved branch. Never clear SET NULL/CASCADE links.
async function removeGlobalStockRoom(req,res){
 const id=Number(req.params.id)
 if(!positiveId(id))return res.status(400).json({message:'Choose a valid Stock Room.'})
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const [[room]]=await conn.query('SELECT * FROM inventory_locations WHERE id=? FOR UPDATE',[id])
  if(!room){await conn.rollback();return res.status(404).json({message:'Stock Room not found.'})}
  if(Number(room.is_main_stockroom)===1){await conn.rollback();return res.status(409).json({code:'MAIN_STOCKROOM_PROTECTED',message:'The Main Stockroom cannot be removed.'})}
  const checks=[
   ['inventory_location_batches','location_id'],['inventory_location_stock','location_id'],
   ['inventory','default_location_id'],['billing_item_batch_usage','source_location_id'],
   ['consultation_inventory_usage_batches','source_location_id'],
   ['supply_requests','destination_location_id'],['supply_request_groups','destination_location_id']
  ]
  let usage=0
  for(const [table,column] of checks){const [[found]]=await conn.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`,[id]);usage+=Number(found?.n||0)}
  const [[transfers]]=await conn.query(`SELECT COUNT(*) AS n FROM inventory_transfers WHERE (from_branch_id=? AND from_location=?) OR (to_branch_id=? AND to_location=?)`,[room.branch_id,room.name,room.branch_id,room.name])
  const [[logs]]=await conn.query(`SELECT COUNT(*) AS n FROM inventory_logs WHERE branch_id=? AND (from_location=? OR to_location=?)`,[room.branch_id,room.name,room.name])
  usage+=Number(transfers?.n||0)+Number(logs?.n||0)
  if(usage){
   if(Number(room.is_active)!==0){
    const [[stock]]=await conn.query('SELECT COALESCE(SUM(quantity),0) AS qty FROM inventory_location_batches WHERE location_id=?',[id])
    const [[stock2]]=await conn.query('SELECT COALESCE(SUM(quantity),0) AS qty FROM inventory_location_stock WHERE location_id=?',[id])
    const [[assigned]]=await conn.query('SELECT COUNT(*) AS n FROM inventory WHERE default_location_id=? AND archived_at IS NULL',[id])
    if(Number(stock?.qty||0)>0||Number(stock2?.qty||0)>0||Number(assigned?.n||0)>0){
     await conn.rollback();return res.status(409).json({code:'LOCATION_HAS_STOCK',message:'Move remaining stock and reassign default inventory rooms before deactivation.'})
    }
    await conn.query('UPDATE inventory_locations SET is_active=0 WHERE id=?',[id])
   }
   await writeAuditLog({userId:req.user.id,userRole:'superadmin',branchId:room.branch_id,action:'inventory.location_deactivated',entityType:'inventory_location',entityId:id,oldValues:room,newValues:{is_active:0,usage_count:usage},ipAddress:req.ip},conn)
   await conn.commit()
   return res.json({deleted:false,deactivated:true,usage_count:usage,message:'Stock Room deactivated; inventory history preserved.'})
  }
  await conn.query('DELETE FROM inventory_locations WHERE id=?',[id])
  await writeAuditLog({userId:req.user.id,userRole:'superadmin',branchId:room.branch_id,action:'inventory.location_deleted',entityType:'inventory_location',entityId:id,oldValues:room,ipAddress:req.ip},conn)
  await conn.commit()
  return res.json({deleted:true,deactivated:false,usage_count:0,message:'Unused Stock Room permanently deleted.'})
 }catch(error){await conn.rollback().catch(()=>{});if(['ER_ROW_IS_REFERENCED_2','ER_ROW_IS_REFERENCED'].includes(error.code))return res.status(409).json({code:'LOCATION_REFERENCED',message:'Stock Room is still referenced; deactivate it instead.'});throw error}
 finally{conn.release()}
}
module.exports={removeBranchReference,removeGlobalReference,removeGlobalStockRoom,references}

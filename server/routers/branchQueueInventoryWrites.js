// High-risk branch-owned operations that have been individually audited.
// Never forward a record mutation to the legacy, unscoped Admin router.
const db=require('../db/connect')
const {writeAuditLog}=require('../utils/audit')
const {applyManualInventoryMovement}=require('../utils/manualInventoryMovement')
const {attachBatchesToInventory}=require('../utils/inventoryBatches')
const {afterSuccessfulMutation}=require('../utils/clinicEvents')
const admin=require('../controllers/admin.controller')
const isId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0
const audit=(req,action,type,id,before,after)=>writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'staff',action,entityType:type,entityId:id,branchId:req.branchId,oldValues:before,newValues:after,ipAddress:req.ip})
const owner=table=>async(req,res,next)=>{
 if(!isId(req.params.id))return res.status(400).json({message:'Invalid record ID.'})
 const [[row]]=await db.query(`SELECT id FROM ${table} WHERE id=? AND branch_id=? LIMIT 1`,[req.params.id,req.branchId])
 if(!row)return res.status(404).json({message:'Record not found in your branch.'})
 next()
}
async function readQueue(req,res){
 const date=String(req.query.date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({message:'Invalid queue date.'})
 const [rows]=await db.query(`SELECT q.*, d.full_name AS doctor_name FROM queue q
 JOIN doctors d ON d.id=q.doctor_id AND d.branch_id=q.branch_id
 WHERE q.branch_id=? AND q.queue_date=? ORDER BY q.queue_number`,[req.branchId,date]);res.json(rows)
}
async function supplier(req,res){
 const name=String(req.body?.name||'').trim(),contact_person=String(req.body?.contact_person||'').trim()||null,
 contact_number=String(req.body?.contact_number||'').trim()||null,address=String(req.body?.address||'').trim()||null
 const category=Array.isArray(req.body?.clinics)?req.body.clinics.join(','):String(req.body?.category||'')
 const categories=[...new Set(category.split(',').map(s=>s.trim()).filter(Boolean))]
 if(!name||name.length>160||contact_person?.length>160||contact_number?.length>80||address?.length>255||!categories.length||categories.some(c=>!['medical','derma'].includes(c)))
  return res.status(400).json({message:'Provide a name (up to 160 characters) and one or both clinics.'})
 const [[existing]]=await db.query('SELECT * FROM inventory_suppliers WHERE name=? AND branch_id=? LIMIT 1',[name,req.branchId])
 if(existing)return res.status(409).json({message:'That supplier already exists in this branch.'})
 try{
  const [r]=await db.query('INSERT INTO inventory_suppliers (name,contact_person,contact_number,address,category,is_active,branch_id) VALUES (?,?,?,?,?,1,?)',[name,contact_person,contact_number,address,categories.join(','),req.branchId]);
  await audit(req,'inventory.supplier_created','inventory_supplier',r.insertId,null,{name,category:categories.join(',')});res.status(201).json({id:r.insertId,name,contact_person,contact_number,address,category:categories.join(','),is_active:1})
 }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'Supplier already exists in this branch.'});throw e}
}
async function createLocation(req,res){
 const name=String(req.body?.name||'').trim(),location_type=String(req.body?.location_type||'storage')
 if(!name||name.length>160||!['stockroom','room','dispensing','storage'].includes(location_type))return res.status(400).json({message:'Enter a valid stockroom name and type.'})
 const clinic_type=null // All new Stock Rooms are shared across clinic specialties.
 try{
  const [r]=await db.query('INSERT INTO inventory_locations (name,location_type,is_active,clinic_type,branch_id) VALUES (?,?,1,?,?)',[name,location_type,clinic_type,req.branchId])
  await audit(req,'inventory.location_created','inventory_location',r.insertId,null,{name,location_type,clinic_type});res.status(201).json({id:r.insertId,name,location_type,clinic_type,is_active:1,is_main_stockroom:0})
 }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'That location exists in your branch.'});throw e}
}
async function updateLocation(req,res){
 const name=String(req.body?.name||'').trim(),location_type=String(req.body?.location_type||'storage')
 const id=Number(req.params.id),isActive=req.body?.is_active===false||Number(req.body?.is_active)===0?0:1
 if(!isId(id)||!name||name.length>160||!['stockroom','room','dispensing','storage'].includes(location_type))
   return res.status(400).json({message:'Enter a valid stock room name and type.'})
 // Early ownership check avoids unnecessary transactions for foreign branches;
 // the same ownership is rechecked under FOR UPDATE before mutation.
 const [[exists]]=await db.query('SELECT id FROM inventory_locations WHERE id=? AND branch_id=?',[req.params.id,req.branchId])
 if(!exists)return res.status(404).json({message:'Stock Room not found in your branch.'})
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const [[prior]]=await conn.query('SELECT * FROM inventory_locations WHERE id=? AND branch_id=? FOR UPDATE',[id,req.branchId])
  if(!prior){await conn.rollback();return res.status(404).json({message:'Stock Room not found in your branch.'})}
  if(Number(prior.is_main_stockroom||0)===1 && (location_type!=='stockroom'||!isActive)){
    await conn.rollback();return res.status(409).json({code:'MAIN_STOCKROOM_PROTECTED',message:'Main Stockroom cannot be deactivated or changed to a different room type.'})
  }
  if(!isActive){
    const [[batch]]=await conn.query('SELECT COALESCE(SUM(quantity),0) AS qty FROM inventory_location_batches WHERE location_id=? AND quantity>0',[id])
    const [[location]]=await conn.query('SELECT COALESCE(SUM(quantity),0) AS qty FROM inventory_location_stock WHERE location_id=? AND quantity>0',[id])
    const [[defaultItems]]=await conn.query('SELECT COUNT(*) AS n FROM inventory WHERE default_location_id=? AND branch_id=? AND archived_at IS NULL',[id,req.branchId])
    if(Number(batch?.qty||0)>0||Number(location?.qty||0)>0||Number(defaultItems?.n||0)>0){
      await conn.rollback();return res.status(409).json({code:'LOCATION_IN_USE',message:'Move stock and reassign inventory default rooms before deactivating this Stock Room.'})
    }
  }
  // Existing specialty-linked allocation remains as historical compatibility.
  // New rooms are shared and have no clinic_type assignment.
  const clinicType=location_type==='room'?(prior.clinic_type||null):null
  await conn.query('UPDATE inventory_locations SET name=?,location_type=?,clinic_type=?,is_active=? WHERE id=? AND branch_id=?',[name,location_type,clinicType,isActive,id,req.branchId])
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'staff',action:'inventory.location_updated',entityType:'inventory_location',entityId:id,branchId:req.branchId,oldValues:prior,newValues:{name,location_type,clinic_type:clinicType,is_active:isActive},ipAddress:req.ip},conn)
  await conn.commit()
  return res.json({...prior,name,location_type,clinic_type:clinicType,is_active:isActive})
 }catch(e){await conn.rollback().catch(()=>{});if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'That Stock Room name already exists in this branch.'});throw e}
 finally{conn.release()}
}
async function deleteLocation(req,res){
 const connection=await db.getConnection()
 try{
  await connection.beginTransaction()
  const [[prior]]=await connection.query('SELECT * FROM inventory_locations WHERE id=? AND branch_id=? FOR UPDATE',[req.params.id,req.branchId])
  if(!prior){await connection.rollback();return res.status(404).json({message:'Location not found in your branch.'})}
  if(Number(prior.is_main_stockroom)){await connection.rollback();return res.status(409).json({message:'The main stockroom cannot be removed.'})}
  const [[occupied]]=await connection.query('SELECT COUNT(*) AS count FROM inventory_location_batches WHERE location_id=? AND quantity>0',[prior.id])
  if(Number(occupied.count)>0){await connection.rollback();return res.status(409).json({message:'Move or use up all stock in this location before deactivating it.'})}
  await connection.query('UPDATE inventory_locations SET is_active=0 WHERE id=? AND branch_id=?',[prior.id,req.branchId])
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'staff',action:'inventory.location_deactivated',entityType:'inventory_location',entityId:prior.id,branchId:req.branchId,oldValues:prior,newValues:{is_active:0},ipAddress:req.ip},connection)
  await connection.commit();res.json({message:'Location deactivated.'})
 }catch(e){await connection.rollback();throw e}finally{connection.release()}
}
async function updateStock(req,res){
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const [[item]]=await conn.query('SELECT id FROM inventory WHERE id=? AND branch_id=? AND archived_at IS NULL FOR UPDATE',[req.params.id,req.branchId])
  if(!item){await conn.rollback();return res.status(404).json({message:'Item not found in your branch.'})}
  await applyManualInventoryMovement({branchId:req.branchId,inventoryId:item.id,body:req.body,actorRole:'admin',actorId:req.user.id,ipAddress:req.ip,executor:conn})
  await conn.commit()
  const [rows]=await db.query('SELECT * FROM inventory WHERE id=? AND branch_id=?',[item.id,req.branchId]);const inventory=await attachBatchesToInventory(rows,db);res.json(inventory[0])
 }catch(e){await conn.rollback();if(e.statusCode)return res.status(e.statusCode).json({message:e.message,code:e.code});throw e}finally{conn.release()}
}
const safeLegacy=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
function registerBranchQueueInventoryWrites(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const reg=(method,route,permission,handler,...guards)=>router[method](`${prefix}${route}`,...middle,requirePermission(permission),...guards,handler)
  reg('get','/queue','appointments',readQueue)
  reg('get','/queue/precheck/:patientId','appointments',safeLegacy(admin.getQueuePrecheck))
  reg('post','/queue','appointments',safeLegacy(admin.addToQueue))
  reg('patch','/queue/:id/status','appointments',safeLegacy(admin.updateQueueStatus),owner('queue'))
  reg('post','/patients/walk-in','appointments',safeLegacy(admin.createWalkInPatient))
  reg('get','/appointments/:id/inventory-readiness','appointments',safeLegacy(admin.getAppointmentInventoryReadinessForPortal))
  reg('post','/inventory/suppliers','inventory',supplier)
  reg('post','/inventory/locations','inventory',createLocation)
  reg('put','/inventory/locations/:id','inventory',updateLocation)
  reg('delete','/inventory/locations/:id','inventory',deleteLocation)
  reg('patch','/inventory/:id/stock','inventory',updateStock,afterSuccessfulMutation('inventory.updated'))
 }
}
module.exports={registerBranchQueueInventoryWrites,readQueue,createLocation,updateLocation,deleteLocation,supplier,updateStock}

// Moving stock between two locations is NOT a receipt or a stock-out.
// Lock and prove the parent item first; the batch engine proves both locations
// and the exact batch belong to that same item and branch in this transaction.
async function moveStockLocation(req,res){
 const p=req.body||{}, inventoryId=Number(req.params.id),batchId=Number(p.batch_id),from=Number(p.from_location_id),to=Number(p.to_location_id),qty=Number(p.quantity)
 if(![inventoryId,batchId,from,to].every(isId)||!Number.isInteger(qty)||qty<=0||from===to)return res.status(400).json({message:'Select an item, batch, distinct locations and a whole-number quantity.'})
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const [[item]]=await conn.query('SELECT id,name,archived_at FROM inventory WHERE id=? AND branch_id=? FOR UPDATE',[inventoryId,req.branchId])
  if(!item){await conn.rollback();return res.status(404).json({message:'Inventory item not found in this branch.'})}
  if(item.archived_at){await conn.rollback();return res.status(409).json({message:'Archived items cannot be moved.'})}
  const {moveBatchBetweenLocations}=require('../utils/inventoryBatches')
  const moved=await moveBatchBetweenLocations(item.id,batchId,from,to,qty,conn)
  const note=String(p.note||'').trim().slice(0,255)||null
  await conn.query(`INSERT INTO inventory_transfers (inventory_id,from_location,to_location,quantity,transferred_by_role,transferred_by_user_id,notes,from_branch_id,to_branch_id)
    VALUES (?,?,?,?,'admin',?,?,?,?)`,[item.id,moved.from.name,moved.to.name,qty,req.user.id,note,req.branchId,req.branchId])
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'staff',action:'inventory.location_transfer',entityType:'inventory_item',entityId:item.id,branchId:req.branchId,newValues:{batch_id:batchId,from_location_id:from,to_location_id:to,quantity:qty,note},ipAddress:req.ip},conn)
  await conn.commit()
  return res.json({message:'Batch stock moved between locations.',batch_id:batchId,quantity:qty,from_location:moved.from.name,to_location:moved.to.name})
 }catch(e){await conn.rollback().catch(()=>{});if(e.statusCode)return res.status(e.statusCode).json({code:e.code,message:e.message});throw e}
 finally{conn.release()}
}
function registerBranchMoveStock(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]])
  router.post(`${prefix}/inventory/:id/move-location`,...middle,requirePermission('inventory'),afterSuccessfulMutation('inventory.updated'),moveStockLocation)
}
module.exports.moveStockLocation=moveStockLocation
module.exports.registerBranchMoveStock=registerBranchMoveStock




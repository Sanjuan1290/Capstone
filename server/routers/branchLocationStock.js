'use strict'
// Staging-only batch-free item/location operations. NOT a production cutover.
// Staff, consultation, billing, return and transfer-request writers must be
// converted and verified before CARAIT_INVENTORY_LOCATION_MODE can be enabled.
const db=require('../db/connect')
const {writeAuditLog}=require('../utils/audit')
const {applyLocationMovement,assertLocationModeRequested,requiredMode}=require('../utils/inventoryLocationStock')
const {afterSuccessfulMutation}=require('../utils/clinicEvents')
const goodId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0
async function list(req,res){
 try{
  assertLocationModeRequested()
  const conn=await db.getConnection()
  try{
   await conn.beginTransaction()
   await requiredMode(conn)
   const [rows]=await conn.query(`SELECT i.id,i.name,i.barcode,i.category,i.item_type,i.stock,i.stock_base,
      i.expiration_date,i.threshold,i.archived_at,l.id AS location_id,l.name AS location_name,
      l.location_type,ls.quantity AS location_quantity,
      COALESCE(e.eligibility,'blocked') AS medicine_eligibility,e.verified_expiry
      FROM inventory i
      LEFT JOIN inventory_location_stock ls ON ls.inventory_id=i.id
      LEFT JOIN inventory_locations l ON l.id=ls.location_id AND l.branch_id=i.branch_id
      LEFT JOIN inventory_stock_eligibility e ON e.inventory_id=i.id AND e.location_id=l.id
      WHERE i.branch_id=? AND i.archived_at IS NULL ORDER BY i.name,l.name`,[req.branchId])
   await conn.commit()
   return res.json(rows)
  }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
 }catch(e){if(e.statusCode)return res.status(e.statusCode).json({code:e.code,message:e.message});throw e}
}
async function move(req,res){
 if(!goodId(req.params.id))return res.status(400).json({code:'INVALID_ITEM',message:'Choose a valid item.'})
 const body=req.body||{}
 if(!['in','out','move'].includes(body.action))return res.status(400).json({code:'INVALID_ACTION',message:'Choose Stock In, Stock Out or Move Stock.'})
 const type={in:'receipt',out:'issue',move:'transfer'}[body.action]
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const result=await applyLocationMovement({executor:conn,branchId:req.branchId,inventoryId:req.params.id,
    type,quantity:body.quantity,sourceLocationId:body.source_location_id,destinationLocationId:body.destination_location_id,
    reason:body.reason,referenceType:'manual',referenceId:body.reference_id?String(body.reference_id).slice(0,120):null,
    actorRole:req.adminContext.account_role==='superadmin'?'superadmin':'admin',actorId:req.user.id,
    idempotencyKey:body.idempotency_key,notes:body.notes})
  if(!result.replayed){
   await writeAuditLog({userId:req.user.id,userRole:req.adminContext.account_role,action:'inventory.location_movement',
    entityType:'inventory_item',entityId:req.params.id,branchId:req.branchId,
    newValues:{movement_id:result.id,operation:type,quantity:result.quantity,source:result.source,destination:result.destination},
    ipAddress:req.ip},conn)
  }
  await conn.commit()
  return res.status(result.replayed?200:201).json(result)
 }catch(e){await conn.rollback().catch(()=>{});if(e.statusCode)return res.status(e.statusCode).json({code:e.code,message:e.message});throw e}
 finally{conn.release()}
}
function registerBranchLocationStock(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  router.get(`${prefix}/inventory/location-stock`,...middle,requirePermission('inventory'),list)
  router.post(`${prefix}/inventory/:id/location-movement`,...middle,requirePermission('inventory'),afterSuccessfulMutation('inventory.updated'),move)
 }
}
module.exports={registerBranchLocationStock,list,move}

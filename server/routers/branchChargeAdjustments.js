// Branch-scoped charge adjustment approvals. Never writes to inventory.
const db=require('../db/connect')
const finance=require('../utils/chargeAdjustments')
const {broadcast}=require('../utils/sse')
const safe=(fn)=>async(req,res,next)=>{let conn;try{conn=await db.getConnection();await conn.beginTransaction();const payload=await fn(req,conn);await conn.commit();return res.json(payload)}catch(e){if(conn)await conn.rollback().catch(()=>{});if(e.statusCode)return res.status(e.statusCode).json({code:e.code,message:e.message});next(e)}finally{conn?.release()}}
const list=safe(async(req,conn)=>finance.list(conn,Number(req.params.id),req.branchId))
const request=safe(async(req,conn)=>({id:await finance.request({billingId:Number(req.params.id),branchId:req.branchId,actorRole:req.adminContext?.account_role||'admin',actorId:req.user.id,targetType:req.body?.target_type,serviceId:Number(req.body?.catalog_service_id),inventoryId:Number(req.body?.inventory_id||0),amount:req.body?.amount,reason:req.body?.reason},conn),message:'Charge adjustment requested. Admin approval is required.'}))
const resolve=safe(async(req,conn)=>finance.resolve({billingId:Number(req.params.id),branchId:req.branchId,requestId:Number(req.params.requestId),adminId:req.user.id,status:req.body?.status,note:req.body?.note},conn))
function registerBranchChargeAdjustments(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  router.get(`${prefix}/billing/:id/charge-adjustments`,...middle,requirePermission('billing'),list)
  router.post(`${prefix}/billing/:id/charge-adjustments`,...middle,requirePermission('billing'),request)
  router.patch(`${prefix}/billing/:id/charge-adjustments/:requestId`,...middle,requirePermission('billing'),resolve)
 }
}
module.exports={registerBranchChargeAdjustments}

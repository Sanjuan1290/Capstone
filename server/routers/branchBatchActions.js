'use strict'
// Admin batch verification now binds OTP payload to the batch's physical branch,
// locks the same-branch batch, checks stock location ownership and logs changes.
const admin=require('../controllers/admin.controller')
const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
function registerBranchBatchActions(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('inventory')]
  router.post(`${prefix}/inventory/batches/:batchId/action/request-code`,...guard,handle(admin.requestInventoryBatchActionCode))
  router.post(`${prefix}/inventory/batches/:batchId/action/confirm`,...guard,handle(admin.confirmInventoryBatchAction))
 }
}
module.exports={registerBranchBatchActions}



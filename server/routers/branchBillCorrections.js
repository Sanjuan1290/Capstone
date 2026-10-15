'use strict'
// The matching controller functions require (bill id, req.branchId) inside the
// transaction and additionally verify that stock returns belong to that branch.
const ctrl=require('../controllers/billingCorrections.controller')
const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
function registerBranchBillCorrections(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('billing')]
  router.post(`${prefix}/billing/:id/void`,...guard,handle(ctrl.voidBill))
  router.post(`${prefix}/billing/:id/reopen`,...guard,handle(ctrl.reopenBill))
  router.post(`${prefix}/billing/:id/consumables/:usageBatchId/return`,...guard,handle(ctrl.returnConsultationConsumable))
 }
}
module.exports={registerBranchBillCorrections}

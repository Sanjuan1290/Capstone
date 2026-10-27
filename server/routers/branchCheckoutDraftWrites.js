'use strict'
// These three existing checkout transitions lock the parent record by
// (id, branch_id) in their OWN transactions and operate only on children of
// that locked bill. Payment acceptance remains blocked pending cashier isolation.
const staff=require('../controllers/staff.controller')
const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
function registerBranchCheckoutDraftWrites(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('billing')]
  router.put(`${prefix}/billing/:id`,...guard,handle(staff.updateBill))
  router.post(`${prefix}/billing/:id/finalize`,...guard,handle(staff.finalizeBill))
  router.post(`${prefix}/billing/:id/reopen-for-editing`,...guard,handle(staff.reopenBillForEditing))
 }
}
module.exports={registerBranchCheckoutDraftWrites}


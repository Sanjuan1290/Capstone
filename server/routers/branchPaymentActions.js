'use strict'
// The payment controller has been updated to verify payment/bill branch inside
// its own SELECT ... FOR UPDATE and to bind verification codes to that branch.
// A route-level check is deliberately not the sole ownership protection.
const admin=require('../controllers/admin.controller')
const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
function registerBranchPaymentActions(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('billing')]
  router.post(`${prefix}/billing/payments/:paymentId/void`,...guard,handle(admin.voidBillingPayment))
  router.post(`${prefix}/billing/payments/:paymentId/refund`,...guard,handle(admin.refundBillingPayment))
  router.post(`${prefix}/billing/payments/:paymentId/action/confirm`,...guard,handle(admin.confirmBillingPaymentAction))
 }
}
module.exports={registerBranchPaymentActions}



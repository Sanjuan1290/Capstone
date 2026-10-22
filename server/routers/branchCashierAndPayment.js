'use strict'
// Cashier drawer lookup, receipt allocation and payment acceptance use the
// verified request branch and the branch-owned cash closing unique constraint.
const staff=require('../controllers/staff.controller')
const cashier=require('../controllers/billingCorrections.controller')
const handle=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
function registerBranchCashierAndPayment(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('billing')]
  router.post(`${prefix}/billing/:id/pay`,...guard,handle(staff.payBill))
  router.post(`${prefix}/billing/cashier-closing`,...guard,handle(cashier.closeMyCashier))
  router.post(`${prefix}/billing/cashier-closings/:closingId/reopen`,...guard,handle(cashier.reopenCashierClosing))
 }
}
module.exports={registerBranchCashierAndPayment}



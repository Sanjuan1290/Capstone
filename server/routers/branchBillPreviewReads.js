const db=require('../db/connect')
const staff=require('../controllers/staff.controller')
const {forBill: readAvailableBillingServices} = require('../utils/billingPromotionEndpoints')
const safeId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0
const ownsBill=async(req,res,next)=>{
 if(!safeId(req.params.id))return res.status(400).json({message:'Invalid bill ID.'})
 const [[row]]=await db.query('SELECT id FROM billing_records WHERE id=? AND branch_id=? LIMIT 1',[req.params.id,req.branchId])
 if(!row)return res.status(404).json({message:'Bill not found in this branch.'})
 return next()
}
const safeLegacy=handler=>(req,res,next)=>Promise.resolve(handler(req,res)).catch(next)
async function adjustments(req,res){
 const [rows]=await db.query(`SELECT ar.*,dp.label AS discount_label FROM billing_adjustment_requests ar
 JOIN billing_records bill ON bill.id=ar.billing_id AND bill.branch_id=?
 LEFT JOIN discount_presets dp ON dp.id=ar.discount_preset_id AND dp.branch_id=bill.branch_id
 WHERE ar.billing_id=? ORDER BY ar.created_at DESC`,[req.branchId,req.params.id])
 res.json(rows)
}
function registerBranchBillPreviewReads(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  // Checkout loads its service-charge catalog and eligible promotions from this endpoint.
  // Both branch Admin and Super Admin workspace URLs must expose the same
  // branch-scoped route as the original Admin/Staff portals.
  router.get(`${prefix}/billing/:id/available-promotions`,...middle,requirePermission('billing'),ownsBill,safeLegacy(readAvailableBillingServices))
  router.get(`${prefix}/billing/:id/finalize-preview`,...middle,requirePermission('billing'),ownsBill,safeLegacy(staff.getFinalizePreview))
  router.get(`${prefix}/billing/:id/adjustment-requests`,...middle,requirePermission('billing'),ownsBill,adjustments)
 }
}
module.exports={registerBranchBillPreviewReads,ownsBill,adjustments}


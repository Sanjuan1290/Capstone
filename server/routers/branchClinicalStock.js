// Admin-only closure for used items when the patient leaves without full payment.
// This records physical stock use but does NOT record a payment or mark the bill paid.
const db = require('../db/connect')
const { isUnifiedBillingStockOut, postClinicalReservations } = require('../utils/clinicalInventoryReservations')
const { writeAuditLog } = require('../utils/audit')
const { broadcast } = require('../utils/sse')

const closeUnpaidStock = async (req, res, next) => {
  const billingId = Number(req.params.id)
  const branchId = Number(req.branchId)
  const reason = String(req.body?.reason || '').trim()
  if (!isUnifiedBillingStockOut()) return res.status(409).json({code:'UNIFIED_STOCKOUT_DISABLED',message:'Unified billing stock-out is not enabled.'})
  if (!Number.isSafeInteger(billingId) || billingId < 1) return res.status(400).json({message:'Choose a valid bill.'})
  if (reason.length < 5 || reason.length > 255) return res.status(400).json({message:'Explain why the used items must be closed without full payment (5–255 characters).'})
  const role = String(req.adminContext?.account_role || '')
  if (!['admin','superadmin'].includes(role)) return res.status(403).json({message:'An administrator must approve this action.'})
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[bill]] = await conn.query('SELECT id,status,paid_at,consultation_id FROM billing_records WHERE id=? AND branch_id=? FOR UPDATE',[billingId,branchId])
    if (!bill) { await conn.rollback(); return res.status(404).json({message:'Bill not found in this clinic.'}) }
    if (bill.status === 'paid' || bill.paid_at) { await conn.rollback(); return res.status(409).json({message:'This bill is paid. Use the normal stock and refund history.'}) }
    const [pending] = await conn.query("SELECT id FROM clinical_inventory_reservations WHERE billing_id=? AND status='pending' LIMIT 1 FOR UPDATE",[billingId])
    if (!pending.length) { await conn.rollback(); return res.status(409).json({message:'There are no pending used items on this bill.'}) }
    const count = await postClinicalReservations({billId:billingId,branchId,actorRole:'admin',actorId:req.user.id,executor:conn,status:'unpaid_posted'})
    await writeAuditLog({userId:req.user.id,userRole:role,action:'inventory.clinical_use_closed_unpaid',entityType:'billing_record',entityId:billingId,branchId,
      newValues:{count,reason,bill_status:bill.status},ipAddress:req.ip||null},conn)
    await conn.commit()
    broadcast(['admin','staff'],'inventory_updated',{billingId},{branchId})
    return res.json({message:'Used items were removed from recorded stock. The bill remains unpaid.',count})
  } catch(error) { await conn.rollback().catch(()=>{}); return next(error) }
  finally { conn.release() }
}

function registerBranchClinicalStock(router,{requireSuper,branchContext,requirePermission}) {
  for (const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]) {
    router.post(`${prefix}/billing/:id/clinical-stock/close-unpaid`,...middle,requirePermission('billing'),closeUnpaidStock)
  }
}
module.exports={registerBranchClinicalStock}

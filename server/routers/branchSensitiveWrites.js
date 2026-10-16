'use strict'
// Sensitive operations are NOT delegated to the unscoped legacy controllers.
// Ownership is checked with a join and the parent bill/archived rows are locked
// inside the same transaction as the mutation.
const validId = v => Number.isSafeInteger(Number(v)) && Number(v) > 0
const error = (status, code, message) => Object.assign(new Error(message), {statusCode:status, code})

function createHandlers({db, writeAuditLog, broadcast}) {
  const audit = (req, conn, action, entityType, entityId, oldValues, newValues) => writeAuditLog({
    userId:req.user.id, userRole:req.adminContext?.account_role || 'admin', branchId:req.branchId,
    action, entityType, entityId, oldValues, newValues, ipAddress:req.ip || null
  }, conn)
  const transact = async (req,res, fn) => {
    let conn
    try {
      conn=await db.getConnection()
      await conn.beginTransaction()
      const result=await fn(conn)
      await conn.commit()
      conn.release();conn=null
      if(result?.broadcast)broadcast(['admin','staff'], result.broadcast.name, result.broadcast.data, {branchId:req.branchId})
      return res.status(result?.status||200).json(result?.body||{})
    } catch (e) {
      if(conn){await conn.rollback().catch(()=>{});conn.release()}
      if(e.statusCode)return res.status(e.statusCode).json({code:e.code,message:e.message})
      throw e
    }
  }

  async function resolveAdjustment(req,res) {
    const id=Number(req.params.id),body=req.body||{},status=String(body.status||'').trim()
    if(!validId(id))return res.status(400).json({message:'Invalid adjustment request ID.'})
    if(!['approved','rejected'].includes(status))return res.status(400).json({message:'Status must be approved or rejected.'})
    const note=String(body.admin_note||'').trim().slice(0,1000)||null
    if(status==='rejected'&&!note)return res.status(400).json({code:'REJECTION_REASON_REQUIRED',message:'A rejection reason is required.'})
    return transact(req,res,async conn=>{
      // Lock the parent first to serialize with checkout finalization and bill edits.
      const [[parent]]=await conn.query(`SELECT br.id,br.status,br.version FROM billing_records br
        JOIN billing_adjustment_requests ar ON ar.billing_id=br.id
        WHERE ar.id=? AND br.branch_id=? FOR UPDATE`,[id,req.branchId])
      if(!parent)throw error(404,'ADJUSTMENT_NOT_FOUND','Adjustment request not found in this branch.')
      const [[request]]=await conn.query(`SELECT ar.* FROM billing_adjustment_requests ar
        JOIN billing_records br ON br.id=ar.billing_id AND br.branch_id=?
        WHERE ar.id=? AND br.id=? FOR UPDATE`,[req.branchId,id,parent.id])
      if(!request)throw error(404,'ADJUSTMENT_NOT_FOUND','Adjustment request not found in this branch.')
      if(request.status!=='pending')throw error(409,'ALREADY_RESOLVED','This adjustment request was already resolved.')
      if(!['draft','pending'].includes(String(parent.status)) || Number(request.bill_version||1)!==Number(parent.version||1)) {
        // Preserve the legacy explicit expiration behavior, but make the failure
        // atomic and auditable in the correct physical branch.
        await conn.query(`UPDATE billing_adjustment_requests ar
          JOIN billing_records br ON br.id=ar.billing_id AND br.branch_id=?
          SET ar.status='expired',ar.resolved_at=NOW(),ar.admin_note=COALESCE(ar.admin_note,'Bill changed or is no longer editable.')
          WHERE ar.id=? AND ar.status='pending'`,[req.branchId,id])
        await audit(req,conn,'billing.adjustment_expired','billing_adjustment_request',id,{status:'pending'},{status:'expired',billing_id:parent.id})
        return {status:409,body:{code:'ADJUSTMENT_EXPIRED',message:'The bill changed or is no longer editable. Request a new adjustment.'}}
      }
      const [updated]=await conn.query(`UPDATE billing_adjustment_requests ar
        JOIN billing_records br ON br.id=ar.billing_id AND br.branch_id=?
        SET ar.status=?,ar.resolved_by_admin_id=?,ar.resolved_at=NOW(),ar.admin_note=?
        WHERE ar.id=? AND ar.status='pending'`,[req.branchId,status,req.user.id,note,id])
      if(updated.affectedRows!==1)throw error(409,'CONFLICT','The request changed; refresh and try again.')
      await audit(req,conn,`billing.adjustment_${status}`,'billing_adjustment_request',id,{status:'pending'},{status,admin_note:note,bill_version:parent.version,billing_id:parent.id})
      const [[result]]=await conn.query(`SELECT ar.* FROM billing_adjustment_requests ar
        JOIN billing_records br ON br.id=ar.billing_id AND br.branch_id=? WHERE ar.id=?`,[req.branchId,id])
      return {body:result,broadcast:{name:'billing_adjustment_resolved',data:{requestId:id,status}}}
    })
  }

  async function deleteArchive(req,res) {
    const id=Number(req.params.archiveId),body=req.body||{},reason=String(body.reason||'').trim()
    if(!validId(id))return res.status(400).json({message:'Invalid archive ID.'})
    if(body.confirmation!=='DELETE')return res.status(400).json({message:'Type DELETE to confirm permanent archive deletion.'})
    if(reason.length<5||reason.length>500)return res.status(400).json({message:'Provide a deletion reason between 5 and 500 characters.'})
    return transact(req,res,async conn=>{
      const [[archive]]=await conn.query('SELECT * FROM audit_log_archives WHERE id=? FOR UPDATE',[id])
      if(!archive)throw error(404,'ARCHIVE_NOT_FOUND','Archive not found.')
      // Existing archive records are global, so a mixed/legacy archive cannot
      // safely be deleted from a branch workspace. Never delete its other logs.
      const [[counts]]=await conn.query(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN branch_id=? THEN 1 ELSE 0 END) AS owned
        FROM audit_logs WHERE archive_id=?`,[req.branchId,id])
      const total=Number(counts.total||0)
      if(total===0 || Number(counts.owned||0)!==total)throw error(409,'MIXED_BRANCH_ARCHIVE',
        'This archive contains logs from other branches or logs without a verified branch. It cannot be deleted from this branch workspace.')
      const [deleted]=await conn.query('DELETE FROM audit_logs WHERE archive_id=? AND branch_id=?',[id,req.branchId])
      if(deleted.affectedRows!==total)throw error(409,'ARCHIVE_CHANGED','Archive contents changed. Retry after refreshing.')
      const [removed]=await conn.query('DELETE FROM audit_log_archives WHERE id=?',[id])
      if(removed.affectedRows!==1)throw error(409,'ARCHIVE_CHANGED','Archive changed. Retry after refreshing.')
      await audit(req,conn,'audit.archive_deleted','audit_archive',id,{archive_code:archive.archive_code,log_count:total},{reason,branch_id:req.branchId})
      return {body:{message:'Archive permanently deleted. The deletion has been audited.'}}
    })
  }
  return {resolveAdjustment,deleteArchive}
}
function registerBranchSensitiveWrites(router,{requireSuper,branchContext,requirePermission}){
 const deps={db:require('../db/connect'),writeAuditLog:require('../utils/audit').writeAuditLog,broadcast:require('../utils/sse').broadcast}
 const handlers=createHandlers(deps)
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]) {
  router.patch(`${prefix}/billing/adjustment-requests/:id`,...middle,requirePermission('billing'),handlers.resolveAdjustment)
  router.delete(`${prefix}/audit-logs/archive/:archiveId`,...middle,requirePermission('audit_logs'),handlers.deleteArchive)
 }
}
module.exports={createHandlers,registerBranchSensitiveWrites}


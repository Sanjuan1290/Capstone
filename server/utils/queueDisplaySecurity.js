const crypto = require('crypto')
const db = require('../db/connect')
const {writeAuditLog}=require('./audit')

const branchPin = async (branchId,executor=db) => {
  try {
    const [[row]]=await executor.query('SELECT pin_hash,pin_version,updated_at,updated_by_admin_id FROM branch_queue_display_security WHERE branch_id=? LIMIT 1',[branchId])
    return row || null
  } catch(error){
    // During rollout, existing queue displays can use the old .env PIN
    // until the new table has been migrated and each branch configured.
    if (error.code==='ER_NO_SUCH_TABLE' || error.code==='ER_TABLE_NOT_EXISTS_ERROR') return null
    throw error
  }
}
const comparePin=(pin,stored)=>{
  if (!/^\d{8}$/.test(String(pin||''))) return false
  const [salt,expected]=String(stored||'').split(':')
  if(!salt||!expected||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(expected))return false
  const candidate=crypto.scryptSync(String(pin),Buffer.from(salt,'hex'),32)
  const reference=Buffer.from(expected,'hex')
  return reference.length===candidate.length&&crypto.timingSafeEqual(candidate,reference)
}
const generateBranchPin=async (req,res)=>{
  const branchId=Number(req.branchId)
  const pin=String(crypto.randomInt(10000000,100000000))
  const salt=crypto.randomBytes(16)
  const hash=`${salt.toString('hex')}:${crypto.scryptSync(pin,salt,32).toString('hex')}`
  const conn=await db.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(`INSERT INTO branch_queue_display_security
      (branch_id,pin_hash,pin_version,updated_by_admin_id,updated_at)
      VALUES (?,?,1,?,NOW()) ON DUPLICATE KEY UPDATE pin_hash=VALUES(pin_hash),pin_version=pin_version+1,updated_by_admin_id=VALUES(updated_by_admin_id),updated_at=NOW()`,
      [branchId,hash,req.user.id])
    await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action:'queue.display_pin_rotated',entityType:'clinic_branch',entityId:branchId,branchId,newValues:{rotated:true},ipAddress:req.ip||null},conn)
    await conn.commit()
    res.setHeader('Cache-Control','no-store')
    return res.json({pin,message:'New queue display PIN generated. Copy it now. Existing display sessions have been invalidated.'})
  }catch(error){await conn.rollback().catch(()=>{});return res.status(500).json({message:'Could not generate the PIN. No changes were saved.'})}
  finally{conn.release()}
}
const getBranchPinStatus=async(req,res)=>{
  const row=await branchPin(Number(req.branchId))
  res.setHeader('Cache-Control','no-store')
  res.json({configured:Boolean(row),updated_at:row?.updated_at||null,updated_by_admin_id:row?.updated_by_admin_id||null})
}
module.exports={branchPin,comparePin,generateBranchPin,getBranchPinStatus}

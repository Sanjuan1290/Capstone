// Walk-in acceptance is per doctor AND branch; scheduled appointment slots are separate.
const db = require('../db/connect')
const { broadcastClinicChange } = require('./clinicEvents')
const { writeAuditLog } = require('./audit')
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0

async function getWalkInAcceptance(doctorId, branchId, executor=db) {
  if (!validId(doctorId) || !validId(branchId)) return null
  const [rows] = await executor.query(
    `SELECT accepting_walk_ins FROM doctor_branch_assignments
      WHERE doctor_id=? AND branch_id=? AND is_active=1 LIMIT 1`, [doctorId, branchId])
  return rows.length ? {doctor_id:Number(doctorId),branch_id:Number(branchId),accepting_walk_ins:Boolean(Number(rows[0].accepting_walk_ins))} : null
}

async function setWalkInAcceptance({doctorId,branchId,actorRole,actorId,ipAddress,accepting}, executor=db) {
  if (!validId(doctorId) || !validId(branchId)) {const e=new Error('Valid branch and doctor required.');e.statusCode=400;throw e}
  if (typeof accepting !== 'boolean') {const e=new Error('Accepting walk-ins must be true or false.');e.statusCode=400;throw e}
  const previous = await getWalkInAcceptance(doctorId,branchId,executor)
  if (!previous) {const e=new Error('Doctor is not actively assigned to this branch.');e.statusCode=404;throw e}
  if (previous.accepting_walk_ins !== accepting) {
    await executor.query('UPDATE doctor_branch_assignments SET accepting_walk_ins=? WHERE doctor_id=? AND branch_id=? AND is_active=1', [accepting?1:0,doctorId,branchId])
    await writeAuditLog({userId:actorId,userRole:actorRole,action:'doctor.walk_in_acceptance_changed',entityType:'doctor',entityId:doctorId,branchId:Number(branchId),newValues:{branch_id:Number(branchId),accepting_walk_ins:accepting},ipAddress:ipAddress||null}).catch(()=>{})
    broadcastClinicChange('schedule.updated',{branchId,id:doctorId})
  }
  return {doctor_id:Number(doctorId),branch_id:Number(branchId),accepting_walk_ins:accepting}
}

const handler = ({editable=false,ownDoctor=false}={}) => async (req,res,next) => {
  try {
    const doctorId = ownDoctor ? req.user.id : req.params.id
    const branchId = req.branchId
    const data = editable
      ? await setWalkInAcceptance({doctorId,branchId,actorId:req.user.id,actorRole:req.user.role,ipAddress:req.ip,accepting:req.body?.accepting_walk_ins})
      : await getWalkInAcceptance(doctorId,branchId)
    if (!data) return res.status(404).json({message:'Doctor is not assigned to this branch.'})
    return res.json(data)
  } catch(err) {if(err.statusCode)return res.status(err.statusCode).json({message:err.message});return next(err)}
}
module.exports={getWalkInAcceptance,setWalkInAcceptance,handler}

'use strict'
const jwt = require('jsonwebtoken')
const db = require('../db/connect')
const COOKIE = 'doctor_active_branch'
const TTL_SECONDS = 12 * 60 * 60
const cookieOptions = () => ({httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV==='production', path:'/'})
const getAssignments = async (doctorId, executor=db) => {
  const [rows]=await executor.query(`SELECT b.id,b.name,b.address
    FROM doctor_branch_assignments a
    JOIN clinic_branches b ON b.id=a.branch_id AND b.is_active=1
    WHERE a.doctor_id=? AND a.is_active=1 ORDER BY b.name,b.id`,[doctorId])
  return rows.map(r=>({id:Number(r.id),name:r.name,address:r.address}))
}
const readSelectedBranch = (req, doctorId, branches) => {
  if (!branches?.length) return null
  const token=req.cookies?.[COOKIE]
  if (!token) return branches.length===1?branches[0]:null
  try {
    const claims=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256']})
    if(claims.role!=='doctor_branch'||Number(claims.doctor_id)!==Number(doctorId))return null
    return branches.find(b=>b.id===Number(claims.branch_id))||null
  }catch{return null}
}
const setSelectedBranch = (res,doctorId,branchId) => {
  const token=jwt.sign({role:'doctor_branch',doctor_id:Number(doctorId),branch_id:Number(branchId)},process.env.JWT_SECRET,{expiresIn:TTL_SECONDS,algorithm:'HS256'})
  res.cookie(COOKIE,token,{...cookieOptions(),maxAge:TTL_SECONDS*1000})
}
const clearSelectedBranch = res => res.clearCookie(COOKIE,cookieOptions())
module.exports = {getAssignments,readSelectedBranch,setSelectedBranch,clearSelectedBranch}

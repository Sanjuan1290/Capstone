const {getSettings,putSettings,sendManual,loadAppointment}=require('../utils/appointmentReminders')
const db=require('../db/connect')
const ensureBranch=async(req,res,next)=>{
 try{
  const id=req.branchId||req.adminContext?.branch_id||req.user?.branch_id
  if(!Number.isSafeInteger(Number(id))||Number(id)<=0)return res.status(403).json({message:'No clinic branch assigned.'})
  req.reminderBranchId=Number(id)
  next()
 }catch(err){next(err)}
}
const get=async(req,res)=>res.json(await getSettings(req.reminderBranchId))
const put=async(req,res)=>res.json(await putSettings(req.reminderBranchId,req.body||{}))
const manual=async(req,res)=>{
 const id=Number(req.params.id)
 if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({message:'Select a valid appointment.'})
 const appointment=await loadAppointment(id,req.reminderBranchId)
 if(!appointment)return res.status(404).json({message:'Appointment not found.'})
 const results=await sendManual({appointmentId:id,branchId:req.reminderBranchId,actor:{id:req.user.id,role:req.user.role||req.adminContext?.account_role||'admin'},channels:req.body?.channels})
 res.json({results})
}
module.exports={ensureBranch,get,put,manual}

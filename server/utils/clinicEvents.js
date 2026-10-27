// Minimal, branch-scoped cache invalidation signals. Never embed personal/financial data.
const {broadcast}=require('./sse')
const EVENTS=new Set(['promotion.updated','service.updated','inventory.updated','schedule.updated','appointment.updated','settings.updated','queue.updated','billing.updated','accounts.updated'])
const validId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0
const broadcastClinicChange=(name,{branchId,id}={})=>{
 if(!EVENTS.has(name)||!validId(branchId))return 0
 // SSE rejects unscoped branch role broadcasts. Patient portals revalidate
 // public offers/schedules on focus and a bounded interval, not a cross-patient stream.
 try{return broadcast(['admin','staff','doctor'],name,{branch_id:Number(branchId),...(validId(id)?{id:Number(id)}:{})},{branchId})}catch(error){console.error('[clinic-events] broadcast failed:',error.message);return 0}
}
// Attach before handler. A rejected validation/permission/SQL error never produces an update.
const afterSuccessfulMutation=(name)=> (req,res,next)=>{
 res.once('finish',()=>{if(res.statusCode>=200&&res.statusCode<300)broadcastClinicChange(name,{branchId:req.branchId,id:req.params?.id||req.params?.serviceId})})
 next()
}
module.exports={EVENTS,broadcastClinicChange,afterSuccessfulMutation}


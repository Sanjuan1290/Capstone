const db=require('../db/connect'),{writeAuditLog}=require('../utils/audit')
const {normalizeTaxSettings,loadTaxSettings}=require('../utils/billingTaxPolicy')
const {afterSuccessfulMutation}=require('../utils/clinicEvents')
const fail=(code,message)=>Object.assign(new Error(message),{statusCode:code,code:'BILLING_SETTINGS_INVALID'})
const authorized=req=>['admin','superadmin'].includes(req.adminContext?.account_role||req.user?.role)
async function read(req,res){
 if(!authorized(req))return res.status(403).json({message:'Only an authorized Admin can manage tax configuration.'})
 res.json(await loadTaxSettings(req.branchId,db))
}
async function save(req,res){
 if(!authorized(req))return res.status(403).json({message:'Only an authorized Admin can manage tax configuration.'})
 const conn=await db.getConnection()
 try{
  const settings=normalizeTaxSettings(req.body)
  if(!Number.isSafeInteger(req.body.expected_version)||req.body.expected_version<0)throw fail(400,'Reload configuration before saving.')
  await conn.beginTransaction()
  // Lock the physical branch so the first settings insert is serialized too.
  const [[branch]]=await conn.query('SELECT id FROM clinic_branches WHERE id=? FOR UPDATE',[req.branchId]);if(!branch)throw fail(404,'Branch not found.')
  const before=await loadTaxSettings(req.branchId,conn)
  if(before.version!==req.body.expected_version)throw fail(409,'Configuration changed. Reload it before saving.')
  const version=before.version+1
  await conn.query('INSERT INTO branch_billing_settings (branch_id,policy_json,version,updated_by_admin_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE policy_json=VALUES(policy_json),version=VALUES(version),updated_by_admin_id=VALUES(updated_by_admin_id),updated_at=CURRENT_TIMESTAMP',[req.branchId,JSON.stringify(settings),version,req.user.id])
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',branchId:req.branchId,action:'billing.tax_configuration_updated',entityType:'branch_billing_settings',entityId:req.branchId,oldValues:before,newValues:{...settings,version},ipAddress:req.ip},conn)
  await conn.commit();res.json({...settings,version})
 }catch(e){await conn.rollback();if(e.statusCode)return res.status(e.statusCode).json({code:e.code,message:e.message});throw e}finally{conn.release()}
}
async function report(req,res){
 if(!authorized(req))return res.status(403).json({message:'Financial allocations require an authorized administrator.'})
 try{res.json(await require('../utils/financialAllocationReport').financialAllocationReport(db,{from:req.query.from,to:req.query.to,branchId:req.branchId}))}catch(e){if(e.statusCode)return res.status(e.statusCode).json({message:e.message});throw e}
}
function registerBranchBillingSettings(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  router.get(`${prefix}/billing/financial-report`,...middle,requirePermission('reports'),requirePermission('billing'),report)
  router.get(`${prefix}/billing/settings`,...middle,requirePermission('system_setup'),read)
  router.put(`${prefix}/billing/settings`,...middle,requirePermission('system_setup'),afterSuccessfulMutation('settings.updated'),save)
 }
}
module.exports={registerBranchBillingSettings,read,save,report}

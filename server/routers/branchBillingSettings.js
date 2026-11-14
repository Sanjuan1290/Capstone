const db=require('../db/connect'),{writeAuditLog}=require('../utils/audit')
const {normalizePolicy,loadTaxPolicy}=require('../utils/billingTaxPolicy')
const {afterSuccessfulMutation}=require('../utils/clinicEvents')
const fail=(code,message)=>Object.assign(new Error(message),{statusCode:code,code:'BILLING_SETTINGS_INVALID'})
const authorized=req=>['admin','superadmin'].includes(req.adminContext?.account_role||req.user?.role)
async function read(req,res){
 if(!authorized(req))return res.status(403).json({message:'Only an authorized Admin can manage tax configuration.'})
 const [services]=await db.query('SELECT id,service_name AS name FROM billing_service_catalog WHERE branch_id=? ORDER BY service_name',[req.branchId])
 const [inventory]=await db.query('SELECT id,name FROM inventory WHERE branch_id=? AND archived_at IS NULL ORDER BY name',[req.branchId])
 const [discounts]=await db.query('SELECT id,label,discount_type,value,requires_reference,requires_admin_approval,is_active FROM discount_presets WHERE branch_id=? ORDER BY label',[req.branchId])
 res.json({policy:await loadTaxPolicy(req.branchId,db),services,inventory,discounts})
}
async function save(req,res){
 if(!authorized(req))return res.status(403).json({message:'Only an authorized Admin can manage tax configuration.'})
 const conn=await db.getConnection()
 try{
  const policy=normalizePolicy(req.body.policy)
  if(!Number.isSafeInteger(req.body.expected_version)||req.body.expected_version<0)throw fail(400,'Reload configuration before saving.')
  await conn.beginTransaction()
  // Lock the physical branch so the first settings insert is serialized too.
  const [[branch]]=await conn.query('SELECT id FROM clinic_branches WHERE id=? FOR UPDATE',[req.branchId]);if(!branch)throw fail(404,'Branch not found.')
  const before=await loadTaxPolicy(req.branchId,conn)
  if(before.version!==req.body.expected_version)throw fail(409,'Configuration changed. Reload it before saving.')
  for(const kind of ['service_fee','inventory']){
   const ids=policy.rules.filter(row=>row.kind===kind).map(row=>row.id)
   if(!ids.length)continue
   const table=kind==='service_fee'?'billing_service_catalog':'inventory'
   const [owned]=await conn.query(`SELECT id FROM ${table} WHERE branch_id=? AND id IN (${ids.map(()=>'?').join(',')})`,[req.branchId,...ids])
   if(owned.length!==ids.length)throw fail(404,'A selected charge does not belong to this branch.')
  }
  for(const [id,category] of Object.entries(policy.discount_categories)){
   const [[preset]]=await conn.query('SELECT id,discount_type,value FROM discount_presets WHERE id=? AND branch_id=?',[id,req.branchId])
   if(!preset)throw fail(404,'A discount does not belong to this branch.')
   if(['senior','pwd'].includes(category)&&(preset.discount_type!=='percentage'||Number(preset.value)!==20))throw fail(400,'Statutory Senior Citizen and PWD presets must be configured as 20% discounts.')
  }
  const version=before.version+1
  await conn.query('INSERT INTO branch_billing_settings (branch_id,policy_json,version,updated_by_admin_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE policy_json=VALUES(policy_json),version=VALUES(version),updated_by_admin_id=VALUES(updated_by_admin_id),updated_at=CURRENT_TIMESTAMP',[req.branchId,JSON.stringify(policy),version,req.user.id])
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',branchId:req.branchId,action:'billing.tax_configuration_updated',entityType:'branch_billing_settings',entityId:req.branchId,oldValues:before,newValues:{...policy,version},ipAddress:req.ip},conn)
  await conn.commit();res.json({policy:{...policy,version}})
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

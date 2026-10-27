// Branch-specific payment configuration. No money movement occurs here.
// Uploaded QR security tokens are restricted to the user's branch + provider.
const express=require('express')
const db=require('../db/connect')
const admin=require('../controllers/admin.controller')
const {verifyUploadSecurityToken}=require('../utils/cloudinarySecurity')
const {writeAuditLog}=require('../utils/audit')
const {normalizeOptionalImageUrl}=require('../utils/settingsValidation')
const safe=handler=>(req,res,next)=>Promise.resolve(handler(req,res)).catch(next)
const fail=(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code})
const enabled=value=>value===true||value===1||value==='1'?1:0
const text=(value,max)=>String(value||'').trim().slice(0,max)||null
const scope=(req,provider)=>`${req.branchId}:${provider}`
const secureImageUrl=(raw,label)=>{
 const value=String(raw||'').trim()
 const normalized=normalizeOptionalImageUrl(value)
 if(value&&(!normalized||!(/^(https:\/\/|\/(?!\/))/i.test(normalized))))throw fail(400,'INVALID_IMAGE_URL',`${label} must use HTTPS or an app-relative path.`)
 return normalized
}
const read=async(req,res)=>{
 const [[settings]]=await db.query('SELECT * FROM branch_payment_settings WHERE branch_id=?',[req.branchId])
 res.json(settings||{branch_id:req.branchId,cash_enabled:1,gcash_enabled:0,maya_enabled:0,bank_transfer_enabled:0})
}
async function save(req,res){
 let conn
 try{
  const b=req.body||{}
  const p={cash_enabled:enabled(b.cash_enabled),gcash_enabled:enabled(b.gcash_enabled),maya_enabled:enabled(b.maya_enabled),bank_transfer_enabled:enabled(b.bank_transfer_enabled),
   gcash_qr_url:secureImageUrl(b.gcash_qr_url,'GCash QR'),maya_qr_url:secureImageUrl(b.maya_qr_url,'Maya QR'),
   gcash_qr_mode:b.gcash_qr_mode==='external'?'external':'uploaded',maya_qr_mode:b.maya_qr_mode==='external'?'external':'uploaded',
   bank_name:text(b.bank_name,120),bank_account_name:text(b.bank_account_name,180),bank_account_number:text(b.bank_account_number,120)}
  if(![p.cash_enabled,p.gcash_enabled,p.maya_enabled,p.bank_transfer_enabled].some(Boolean))throw fail(400,'PAYMENT_METHOD_REQUIRED','At least one payment method must remain enabled.')
  if(p.bank_transfer_enabled&&(!p.bank_name||!p.bank_account_name||!p.bank_account_number))throw fail(400,'BANK_DETAILS_REQUIRED','Complete bank details before enabling transfers.')
  for(const provider of ['gcash','maya'])if(p[`${provider}_enabled`]&&p[`${provider}_qr_mode`]==='uploaded'&&!p[`${provider}_qr_url`])throw fail(400,'QR_REQUIRED',`Upload or configure the ${provider.toUpperCase()} QR before enabling it.`)
  conn=await db.getConnection();await conn.beginTransaction()
  const [[prior]]=await conn.query('SELECT * FROM branch_payment_settings WHERE branch_id=? FOR UPDATE',[req.branchId])
  const changes={...p}
  for(const provider of ['gcash','maya']){
   const key=`${provider}_qr_url`,statusKey=`${provider}_qr_scan_status`
   if(changes[`${provider}_qr_mode`]==='external')changes[statusKey]=changes[key]&&changes[key]===prior?.[key]?prior[statusKey]||'legacy':'legacy'
   else if(!changes[key])changes[statusKey]='legacy'
   else if(changes[key]===prior?.[key]){
    if(!['approved','bypassed','legacy'].includes(String(prior[statusKey]||'').toLowerCase()))throw fail(409,'QR_STATUS_INVALID','The existing QR is not approved for use.')
    changes[statusKey]=prior[statusKey]||'legacy'
   }else{
    const verified=verifyUploadSecurityToken(b[`${provider}_qr_security_token`],{stage:'accepted',role:'admin',user_id:req.user.id,context_type:'payment_qr',context_id:scope(req,provider),url:changes[key]})
    if(!['approved','bypassed'].includes(String(verified.scan_status)))throw fail(400,'QR_SCAN_REQUIRED','The new QR has not passed security verification.')
    changes[statusKey]=verified.scan_status
   }
  }
  const cols=['cash_enabled','gcash_enabled','maya_enabled','bank_transfer_enabled','gcash_qr_url','maya_qr_url','gcash_qr_mode','maya_qr_mode','gcash_qr_scan_status','maya_qr_scan_status','bank_name','bank_account_name','bank_account_number']
  await conn.query(`INSERT INTO branch_payment_settings (branch_id,${cols.join(',')},updated_by_admin_id) VALUES (${Array(cols.length+2).fill('?').join(',')}) ON DUPLICATE KEY UPDATE ${cols.map(k=>`${k}=VALUES(${k})`).join(',')},updated_by_admin_id=VALUES(updated_by_admin_id)`,[req.branchId,...cols.map(k=>changes[k]),req.user.id])
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action:'billing.payment_settings_updated',entityType:'branch_payment_settings',entityId:req.branchId,branchId:req.branchId,oldValues:prior||null,newValues:changes,ipAddress:req.ip},conn)
  await conn.commit();conn.release();conn=null
  return read(req,res)
 }catch(e){if(conn){await conn.rollback().catch(()=>{});conn.release()}
  if(e.statusCode)return res.status(e.statusCode).json({code:e.code,message:e.message})
  throw e
 }
}
const branchBillForProof=async(req,res,next)=>{
 const id=Number(req.query?.billing_id||req.body?.billing_id)
 if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({message:'Choose a valid bill for the discount proof.'})
 const [[bill]]=await db.query('SELECT id FROM billing_records WHERE id=? AND branch_id=?',[id,req.branchId])
 if(!bill)return res.status(404).json({message:'Billing record not found in this branch.'})
 next()
}
function registerBranchPaymentSettingsWrites(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('billing')]
  router.put(`${prefix}/billing/payment-settings`,...guard,save)
  router.post(`${prefix}/billing/payment-settings/upload`,...guard,express.raw({type:['image/png','image/jpeg','image/webp'],limit:'5mb'}),safe(admin.uploadPaymentQrImageAdmin))
  router.post(`${prefix}/billing/payment-settings/upload-status`,...guard,safe(admin.getPaymentQrUploadScanStatusAdmin))
  router.post(`${prefix}/billing/discount-proof/upload`,...guard,branchBillForProof,express.raw({type:['image/png','image/jpeg'],limit:'5mb'}),safe(admin.uploadDiscountProofImageAdmin))
  router.post(`${prefix}/billing/discount-proof/upload-status`,...guard,branchBillForProof,safe(admin.getDiscountProofUploadScanStatusAdmin))
 }
}
module.exports={registerBranchPaymentSettingsWrites,save,branchBillForProof,secureImageUrl}



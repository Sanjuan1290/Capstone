const {afterSuccessfulMutation}=require('../utils/clinicEvents')
// Branch-local reference-data mutations used by the ORIGINAL Admin System Setup.
// Record ownership is checked server-side for every update.
const db=require('../db/connect')
const { writeAuditLog }=require('../utils/audit')
const TYPES=new Set(['medical','derma','all'])
const safeId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0
const active=(value,fallback=1)=>value===undefined?fallback:(value===false||Number(value)===0?0:1)
const writeAudit=async(req,action,kind,id,before,after)=>writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action,entityType:kind,entityId:id,branchId:req.branchId,oldValues:before,newValues:after,ipAddress:req.ip}).catch(()=>{})

async function saveVisitReason(req,res){
 const id=Number(req.params.reasonId||0),label=String(req.body?.label||'').trim(),type=String(req.body?.clinic_type||'all').trim()
 if(!label||label.length>120||label.toLowerCase()==='other'||!TYPES.has(type))return res.status(400).json({message:'Enter a valid reason and clinic type; Other is built in.'})
 const sort=Number(req.body?.sort_order??0)
 if(!Number.isInteger(sort)||sort<0||sort>999999)return res.status(400).json({message:'Invalid display order.'})
 let old=null
 if(id){[[old]]=await db.query('SELECT id,label,clinic_type,is_active,sort_order FROM appointment_reason_options WHERE id=? AND branch_id=?',[id,req.branchId]);if(!old)return res.status(404).json({message:'Visit reason not found in your branch.'})}
 const isActive=active(req.body?.is_active,old?.is_active??1)
 if(id){await db.query('UPDATE appointment_reason_options SET label=?,clinic_type=?,is_active=?,sort_order=? WHERE id=? AND branch_id=?',[label,type,isActive,sort,id,req.branchId]);await writeAudit(req,'visit_reason.updated','visit_reason',id,old,{label,clinic_type:type,is_active:isActive})}
 else{const [r]=await db.query('INSERT INTO appointment_reason_options (label,clinic_type,is_active,sort_order,branch_id) VALUES (?,?,?,?,?)',[label,type,isActive,sort,req.branchId]);await writeAudit(req,'visit_reason.created','visit_reason',r.insertId,null,{label,clinic_type:type});return res.status(201).json({id:r.insertId,label,clinic_type:type,is_active:isActive})}
 res.json({id,label,clinic_type:type,is_active:isActive,sort_order:sort})
}
async function deactivateVisitReason(req,res){
 const [[record]]=await db.query('SELECT id,label FROM appointment_reason_options WHERE id=? AND branch_id=?',[req.params.reasonId,req.branchId]);if(!record)return res.status(404).json({message:'Visit reason not found in your branch.'})
 await db.query('UPDATE appointment_reason_options SET is_active=0 WHERE id=? AND branch_id=?',[record.id,req.branchId]);await writeAudit(req,'visit_reason.deactivated','visit_reason',record.id,record,{is_active:0});res.json({message:'Visit reason deactivated. Existing appointments are preserved.'})
}
async function saveCancellation(req,res){
 const id=Number(req.params.id||0),label=String(req.body?.label||'').trim()
 if(!label||label.length>120||label.toLowerCase()==='other')return res.status(400).json({message:'Enter a valid cancellation reason. Other is built in.'})
 let prior=null
 if(id){[[prior]]=await db.query('SELECT id,label,is_active FROM appointment_cancellation_reasons WHERE id=? AND branch_id=?',[id,req.branchId]);if(!prior)return res.status(404).json({message:'Reason not found in your branch.'})}
 const isActive=active(req.body?.is_active,prior?.is_active??1)
 if(id){await db.query('UPDATE appointment_cancellation_reasons SET label=?,is_active=? WHERE id=? AND branch_id=?',[label,isActive,id,req.branchId]);await writeAudit(req,'cancellation_reason.updated','cancellation_reason',id,prior,{label,is_active:isActive});return res.json({id,label,is_active:isActive})}
 const [insert]=await db.query('INSERT INTO appointment_cancellation_reasons (label,is_active,branch_id) VALUES (?,?,?)',[label,isActive,req.branchId]);await writeAudit(req,'cancellation_reason.created','cancellation_reason',insert.insertId,null,{label});res.status(201).json({id:insert.insertId,label,is_active:isActive})
}
async function deactivateCancellation(req,res){
 const [[prior]]=await db.query('SELECT id,label FROM appointment_cancellation_reasons WHERE id=? AND branch_id=?',[req.params.id,req.branchId]);if(!prior)return res.status(404).json({message:'Reason not found in your branch.'})
 await db.query('UPDATE appointment_cancellation_reasons SET is_active=0 WHERE id=? AND branch_id=?',[prior.id,req.branchId]);await writeAudit(req,'cancellation_reason.deactivated','cancellation_reason',prior.id,prior,{is_active:0});res.json({message:'Reason deactivated. Existing cancellation history is preserved.'})
}
async function saveCategory(req,res){
 const id=Number(req.params.id||0),name=String(req.body?.name||'').trim(),type=String(req.body?.clinic_type||'')
 if(!name||name.length>120||!['medical','derma'].includes(type))return res.status(400).json({message:'Enter a category name and clinic type.'})
 let old=null
 if(id){[[old]]=await db.query('SELECT id,name,clinic_type,is_active FROM billing_service_categories WHERE id=? AND branch_id=?',[id,req.branchId]);if(!old)return res.status(404).json({message:'Category not found in your branch.'})}
 const isActive=active(req.body?.is_active,old?.is_active??1)
 if(id){await db.query('UPDATE billing_service_categories SET name=?,clinic_type=?,is_active=? WHERE id=? AND branch_id=?',[name,type,isActive,id,req.branchId]);await writeAudit(req,'category.updated','billing_service_category',id,old,{name,clinic_type:type,is_active:isActive});return res.json({id,name,clinic_type:type,is_active:isActive})}
 const [insert]=await db.query('INSERT INTO billing_service_categories (name,clinic_type,is_active,branch_id) VALUES (?,?,?,?)',[name,type,isActive,req.branchId]);await writeAudit(req,'category.created','billing_service_category',insert.insertId,null,{name,clinic_type:type});res.status(201).json({id:insert.insertId,name,clinic_type:type,is_active:isActive})
}
async function deactivateCategory(req,res){
 const [[old]]=await db.query('SELECT id,name FROM billing_service_categories WHERE id=? AND branch_id=?',[req.params.id,req.branchId]);if(!old)return res.status(404).json({message:'Category not found in your branch.'})
 await db.query('UPDATE billing_service_categories SET is_active=0 WHERE id=? AND branch_id=?',[old.id,req.branchId]);await writeAudit(req,'category.deactivated','billing_service_category',old.id,old,{is_active:0});res.json({message:'Category deactivated. Existing services retain their category history.'})
}

const registerBranchSystemWrites=(router,{requireSuper,branchContext,requirePermission})=>{
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const withSetup=(path,method,handler)=>router[method](`${prefix}${path}`,...middle,requirePermission('system_setup'),handler)
  // The original booking editor uses the appointment-reasons path, while
  // System Setup uses /system-setup/cancellation-reasons and service-categories.
  withSetup('/appointment-reasons','post',saveVisitReason)
  withSetup('/appointment-reasons/:reasonId','put',saveVisitReason)
  withSetup('/appointment-reasons/:reasonId','delete',deactivateVisitReason)
  withSetup('/system-setup/cancellation-reasons','post',saveCancellation)
  withSetup('/system-setup/cancellation-reasons/:id','put',saveCancellation)
  withSetup('/system-setup/cancellation-reasons/:id','delete',deactivateCancellation)
  withSetup('/system-setup/service-categories','post',saveCategory)
  withSetup('/system-setup/service-categories/:id','put',saveCategory)
  withSetup('/system-setup/service-categories/:id','delete',deactivateCategory)
 }
}
module.exports={registerBranchSystemWrites,saveVisitReason,deactivateVisitReason,saveCancellation,deactivateCancellation,saveCategory,deactivateCategory}


// Branch-owned suppliers and location types. UOMs and movement reasons are
// global policy tables; they must not be silently changed by a Branch Admin.
const safeText=(v,max)=>String(v??'').trim().slice(0,max)
const systemAudit=(req,action,type,id,before,after)=>writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action,entityType:type,entityId:id,oldValues:before,newValues:after,branchId:req.branchId,ipAddress:req.ip})
const duplicateError=(e,res)=>{
 if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'This entry already exists in your branch.'})
 throw e
}
async function saveBranchSupplier(req,res){
 const id=req.params.id?Number(req.params.id):0
 if(id&&!safeId(id))return res.status(400).json({message:'Invalid supplier ID.'})
 const name=safeText(req.body?.name,160),contact_person=safeText(req.body?.contact_person,160)||null,
 contact_number=safeText(req.body?.contact_number,80)||null,address=safeText(req.body?.address,255)||null
 const clinics=Array.isArray(req.body.clinics)?req.body.clinics:String(req.body.category||'').split(',')
 const cats=[...new Set(clinics.map(v=>String(v).trim()).filter(Boolean))]
 if(!name||cats.length===0||cats.some(v=>!['medical','derma'].includes(v)))return res.status(400).json({message:'Supplier name and at least one clinic are required.'})
 let prior=null
 if(id){[[prior]]=await db.query('SELECT * FROM inventory_suppliers WHERE id=? AND branch_id=?',[id,req.branchId]);if(!prior)return res.status(404).json({message:'Supplier not found in this branch.'})}
 const is_active=active(req.body?.is_active,prior?.is_active??1)
 if(prior){
  for(const clinic of ['medical','derma'])if(prior.category.split(',').includes(clinic)&&!cats.includes(clinic)){
   const [[used]]=await db.query('SELECT COUNT(*) AS n FROM inventory WHERE supplier_id=? AND category=? AND branch_id=?',[id,clinic,req.branchId])
   if(Number(used.n)>0)return res.status(409).json({message:`This supplier is still assigned to ${clinic} inventory items.`})
  }
 }
 let targetId=id
 try{
  if(id)await db.query('UPDATE inventory_suppliers SET name=?,contact_person=?,contact_number=?,address=?,category=?,is_active=? WHERE id=? AND branch_id=?',[name,contact_person,contact_number,address,cats.join(','),is_active,id,req.branchId])
  else{const [r]=await db.query('INSERT INTO inventory_suppliers (branch_id,name,contact_person,contact_number,address,category,is_active) VALUES (?,?,?,?,?,?,?)',[req.branchId,name,contact_person,contact_number,address,cats.join(','),is_active]);targetId=r.insertId}
 }catch(e){return duplicateError(e,res)}
 const [[row]]=await db.query('SELECT * FROM inventory_suppliers WHERE id=? AND branch_id=?',[targetId,req.branchId])
 await systemAudit(req,id?'system.supplier_updated':'system.supplier_created','inventory_supplier',targetId,prior,row)
 res.status(id?200:201).json(row)
}
async function saveBranchLocationType(req,res){
 const id=req.params.id?Number(req.params.id):0
 if(id&&!safeId(id))return res.status(400).json({message:'Invalid location type ID.'})
 const name=safeText(req.body?.name,80),sort_order=Number(req.body?.sort_order||0)
 if(!name||!Number.isInteger(sort_order)||Math.abs(sort_order)>999999)return res.status(400).json({message:'Valid location name and display order required.'})
 let prior=null
 if(id){[[prior]]=await db.query('SELECT * FROM inventory_location_types WHERE id=? AND branch_id=?',[id,req.branchId]);if(!prior)return res.status(404).json({message:'Location type not found in this branch.'})}
 const is_active=active(req.body?.is_active,prior?.is_active??1)
 if(id&&!is_active){const [[used]]=await db.query('SELECT COUNT(*) AS n FROM inventory WHERE location_type_id=? AND branch_id=?',[id,req.branchId]);if(Number(used.n)>0)return res.status(409).json({message:'Reassign inventory items before deactivating this type.'})}
 let targetId=id
 try{
  if(id)await db.query('UPDATE inventory_location_types SET name=?,is_active=?,sort_order=? WHERE id=? AND branch_id=?',[name,is_active,sort_order,id,req.branchId])
  else{
   const code=name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
   if(!code)return res.status(400).json({message:'Invalid location type name.'})
   const [r]=await db.query('INSERT INTO inventory_location_types (branch_id,name,code,is_active,sort_order) VALUES (?,?,?,?,?)',[req.branchId,name,code,is_active,sort_order]);targetId=r.insertId
  }
 }catch(e){return duplicateError(e,res)}
 const [[row]]=await db.query('SELECT * FROM inventory_location_types WHERE id=? AND branch_id=?',[targetId,req.branchId])
 await systemAudit(req,id?'system.location_type_updated':'system.location_type_created','inventory_location_type',targetId,prior,row)
 res.status(id?200:201).json(row)
}
async function updateBranchClinicSettings(req,res){
 const name=safeText(req.body?.clinic_name,180)||req.branch.name
 const address=safeText(req.body?.address,255)||null,phone=safeText(req.body?.phone,80)||null,email=safeText(req.body?.email,160)||null
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({message:'Invalid clinic email address.'})
 // Global clinic_settings branding, report and receipt footer belongs to Super Admin.
 // Do not accept or accidentally write those cross-branch fields here.
 const globals=['report_footer','receipt_title','receipt_footer','id','updated_by_admin_id']
 if(globals.some(k=>Object.hasOwn(req.body||{},k)))return res.status(403).json({code:'GLOBAL_SETTINGS_MANAGED_CENTRALLY',message:'Receipt and brand settings are managed by Super Admin.'})
 await db.query('UPDATE clinic_branches SET name=?,address=?,phone=?,email=? WHERE id=? AND is_active=1',[name,address,phone,email,req.branchId])
 await systemAudit(req,'branch.clinic_settings_updated','clinic_branch',req.branchId,req.branch,{name,address,phone,email})
 const [[global]]=await db.query('SELECT * FROM clinic_settings WHERE id=1')
 res.json({...global,clinic_name:name,address,phone,email})
}
function registerBranchExtraSetup(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guard=[...middle,requirePermission('system_setup')]
  router.post(`${prefix}/system-setup/suppliers`,...guard,afterSuccessfulMutation('settings.updated'),saveBranchSupplier)
  router.put(`${prefix}/system-setup/suppliers/:id`,...guard,afterSuccessfulMutation('settings.updated'),saveBranchSupplier)
  router.post(`${prefix}/system-setup/location-types`,...guard,afterSuccessfulMutation('settings.updated'),saveBranchLocationType)
  router.put(`${prefix}/system-setup/location-types/:id`,...guard,afterSuccessfulMutation('settings.updated'),saveBranchLocationType)
  router.put(`${prefix}/clinic-settings`,...guard,afterSuccessfulMutation('settings.updated'),updateBranchClinicSettings)
 }
}
module.exports.registerBranchExtraSetup=registerBranchExtraSetup
module.exports.saveBranchSupplier=saveBranchSupplier
module.exports.saveBranchLocationType=saveBranchLocationType
module.exports.updateBranchClinicSettings=updateBranchClinicSettings

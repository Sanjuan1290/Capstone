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
module.exports={registerBranchSystemWrites,saveVisitReason,saveCancellation,saveCategory}

// Physical-branch management. Unlike the legacy admin controller, every data
// query here contains an explicit authorized physical-branch predicate.
const express = require('express')
const bcrypt = require('bcrypt')
const db = require('../db/connect')
const authenticate = require('../middlewares/auth.middleware')
const { writeAuditLog } = require('../utils/audit')
const { makeTemporaryPassword } = require('../utils/securityCrypto')
const { sendTempPassword } = require('../utils/emailService')
const { validateBookingSettings } = require('../utils/bookingPolicy')
const router = express.Router()
const PERMISSIONS = ['dashboard','appointments','patient_records','doctor_schedules','billing','inventory','stock_transfers','accounts','system_setup','reports','audit_logs']
const forbidden = (res) => res.status(403).json({ code: 'BRANCH_ACCESS_DENIED', message: 'You do not have access to this branch or feature.' })
const validId = (v) => Number.isSafeInteger(Number(v)) && Number(v) > 0
const permissionsFromBody = (value) => {
  if (value == null) return [...PERMISSIONS]
  if (!Array.isArray(value) || value.some(p => !PERMISSIONS.includes(p))) throw Object.assign(new Error('Invalid permissions.'),{statusCode:400})
  return [...new Set(value)]
}
const audit = async (req, action, kind, id, before, after, branchId) => {
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role || 'admin',action,entityType:kind,entityId:id,oldValues:before,newValues:{...after,branch_id:branchId},branchId,ipAddress:req.ip}).catch(()=>{})
}
router.use(authenticate('admin_token'))
router.use(async (req, res, next) => {
  try {
    const [[admin]] = await db.query('SELECT id,account_role,branch_id,is_active FROM admins WHERE id=? LIMIT 1',[req.user.id])
    if (!admin || !Number(admin.is_active)) return forbidden(res)
    req.adminContext=admin
    if (admin.account_role === 'superadmin') {req.adminPermissions=PERMISSIONS;return next()}
    if (admin.account_role !== 'admin' || !validId(admin.branch_id)) return forbidden(res)
    const [rows]=await db.query('SELECT permission_key FROM admin_branch_permissions WHERE admin_id=? AND granted=1',[admin.id])
    req.adminPermissions=rows.map(r=>r.permission_key)
    return next()
  } catch(e) {next(e)}
})
const requireSuper = (req,res,next) => req.adminContext.account_role==='superadmin'?next():forbidden(res)
const requirePermission = (key) => (req,res,next) => req.adminContext.account_role==='superadmin' || req.adminPermissions.includes(key)?next():forbidden(res)
const branchContext = async (req,res,next) => {
  try {
    const branchId=req.params.branchId?Number(req.params.branchId):Number(req.adminContext.branch_id)
    if(!validId(branchId)) return res.status(400).json({message:'Select a valid branch.'})
    if(req.adminContext.account_role!=='superadmin' && branchId!==Number(req.adminContext.branch_id)) return forbidden(res)
    const [[branch]]=await db.query('SELECT * FROM clinic_branches WHERE id=? LIMIT 1',[branchId])
    if(!branch) return res.status(404).json({message:'Branch not found.'})
    req.branch=branch;req.branchId=branchId;next()
  }catch(e){next(e)}
}
router.get('/', requireSuper, async(req,res)=>{
  const [rows]=await db.query(`SELECT b.*, (SELECT COUNT(*) FROM admins a WHERE a.branch_id=b.id AND a.account_role='admin' AND a.is_active=1) AS admins, (SELECT COUNT(*) FROM doctors d WHERE d.branch_id=b.id AND d.is_active=1) AS doctors, (SELECT COUNT(*) FROM staff s WHERE s.branch_id=b.id AND s.status='active') AS staff FROM clinic_branches b ORDER BY b.created_at ASC,b.id ASC`)
  res.json(rows)
})
router.post('/',requireSuper,async(req,res)=>{
  const name=String(req.body?.name||'').trim(),code=String(req.body?.code||'').trim().toUpperCase()
  if(!name||name.length>180||!/^[A-Z0-9_-]{2,32}$/.test(code)) return res.status(400).json({message:'Provide a branch name and code (2–32 letters, numbers, hyphens or underscores).'})
  const [result]=await db.query('INSERT INTO clinic_branches (name,code,address,phone,email,offers_medical,offers_derma) VALUES (?,?,?,?,?,?,?)',[name,code,String(req.body.address||'').slice(0,255)||null,String(req.body.phone||'').slice(0,80)||null,String(req.body.email||'').slice(0,160)||null,req.body.offers_medical===false?0:1,req.body.offers_derma===false?0:1])
  await db.query('INSERT INTO branch_booking_settings (branch_id) VALUES (?)',[result.insertId])
  await audit(req,'branch.created','clinic_branch',result.insertId,null,{name,code},result.insertId)
  res.status(201).json({id:result.insertId,name,code})
})
router.put('/:branchId',requireSuper,branchContext,async(req,res)=>{
  const current=req.branch
  const name=String(req.body?.name??current.name).trim(),code=String(req.body?.code??current.code).trim().toUpperCase()
  if(!name||name.length>180||!/^[A-Z0-9_-]{2,32}$/.test(code)) return res.status(400).json({message:'Invalid branch name or code.'})
  const next={name,code,address:String(req.body.address??current.address??'').trim().slice(0,255)||null,phone:String(req.body.phone??current.phone??'').trim().slice(0,80)||null,email:String(req.body.email??current.email??'').trim().slice(0,160)||null,offers_medical:req.body.offers_medical===undefined?Number(current.offers_medical):Number(Boolean(req.body.offers_medical)),offers_derma:req.body.offers_derma===undefined?Number(current.offers_derma):Number(Boolean(req.body.offers_derma)),is_active:req.body.is_active===undefined?Number(current.is_active):Number(Boolean(req.body.is_active))}
  await db.query('UPDATE clinic_branches SET name=?,code=?,address=?,phone=?,email=?,offers_medical=?,offers_derma=?,is_active=? WHERE id=?',[...Object.values(next),req.branchId])
  await audit(req,'branch.updated','clinic_branch',req.branchId,current,next,req.branchId)
  res.json({id:req.branchId,...next})
})
router.delete('/:branchId',requireSuper,branchContext,async(req,res)=>{
  // Archive, never destroy historic medical/billing/stock records.
  await db.query('UPDATE clinic_branches SET is_active=0 WHERE id=?',[req.branchId])
  await audit(req,'branch.deactivated','clinic_branch',req.branchId,{is_active:req.branch.is_active},{is_active:0},req.branchId)
  res.json({message:'Branch deactivated. Historical records have been retained.'})
})
router.get('/accounts/admins',requireSuper,async(req,res)=>{
  const [rows]=await db.query(`SELECT a.id,a.full_name,a.email,a.account_role,a.branch_id,a.is_active,a.created_at,b.name AS branch_name FROM admins a LEFT JOIN clinic_branches b ON b.id=a.branch_id WHERE a.account_role='admin' ORDER BY a.created_at DESC,a.id DESC`)
  const [perms]=await db.query('SELECT admin_id,permission_key FROM admin_branch_permissions WHERE granted=1')
  res.json(rows.map(a=>({...a,permissions:perms.filter(p=>p.admin_id===a.id).map(p=>p.permission_key)})))
})
router.post('/accounts/admins',requireSuper,async(req,res)=>{
  const full_name=String(req.body?.full_name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),branchId=Number(req.body?.branch_id)
  if(!full_name||full_name.length>150||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!validId(branchId))return res.status(400).json({message:'Full name, valid email and one branch are required.'})
  const [[branch]]=await db.query('SELECT id FROM clinic_branches WHERE id=? AND is_active=1',[branchId]);if(!branch)return res.status(400).json({message:'The selected branch is not active.'})
  const permissions=permissionsFromBody(req.body.permissions)
  const temporaryPassword=makeTemporaryPassword()
  const password=await bcrypt.hash(temporaryPassword,12)
  const connection=await db.getConnection()
  let id
  try{
    await connection.beginTransaction()
    const [result]=await connection.query('INSERT INTO admins (full_name,email,password,account_role,branch_id,is_active) VALUES (?,?,?,\'admin\',?,1)',[full_name,email,password,branchId])
    id=result.insertId
    for(const p of permissions)await connection.query('INSERT INTO admin_branch_permissions (admin_id,permission_key,granted) VALUES (?,?,1)',[id,p])
    await connection.commit()
  }catch(e){await connection.rollback();throw e}finally{connection.release()}
  let invitationSent=true
  try {await sendTempPassword(email,full_name,'Branch Admin',temporaryPassword,`${process.env.CLIENT_URL||''}/admin/login`)} catch(e){invitationSent=false;console.error('[branches] Admin invitation email failed',e.message)}
  await audit(req,'branch_admin.created','admin',id,null,{full_name,email,permissions,invitationSent},branchId)
  res.status(201).json({id,full_name,email,branch_id:branchId,permissions,invitation_sent:invitationSent,message:invitationSent?'Admin created and login email sent.':'Admin created but invitation email failed. Resend the invitation securely.'})
})
router.put('/accounts/admins/:adminId',requireSuper,async(req,res)=>{
  const id=Number(req.params.adminId)
  const [[prior]]=await db.query("SELECT id,account_role,branch_id,is_active,full_name,email FROM admins WHERE id=? AND account_role='admin'",[id])
  if(!prior)return res.status(404).json({message:'Branch Admin not found.'})
  const branchId=Number(req.body.branch_id??prior.branch_id),permissions=permissionsFromBody(req.body.permissions)
  const [[branch]]=await db.query('SELECT id FROM clinic_branches WHERE id=? AND is_active=1',[branchId]);if(!branch)return res.status(400).json({message:'Select an active branch.'})
  const active=req.body.is_active===undefined?Number(prior.is_active):Number(Boolean(req.body.is_active))
  const full_name=String(req.body.full_name??prior.full_name).trim()
  const connection=await db.getConnection()
  try {await connection.beginTransaction();await connection.query('UPDATE admins SET full_name=?,branch_id=?,is_active=?,session_version=session_version+1 WHERE id=?',[full_name,branchId,active,id]);await connection.query('DELETE FROM admin_branch_permissions WHERE admin_id=?',[id]);for(const p of permissions)await connection.query('INSERT INTO admin_branch_permissions (admin_id,permission_key,granted) VALUES (?,?,1)',[id,p]);await connection.commit()}catch(e){await connection.rollback();throw e}finally{connection.release()}
  await audit(req,'branch_admin.updated','admin',id,prior,{branch_id:branchId,full_name,is_active:active,permissions},branchId)
  res.json({id,branch_id:branchId,is_active:active,full_name,permissions})
})
router.get('/me',async(req,res)=>{
  res.json({id:req.adminContext.id,role:req.adminContext.account_role,branch_id:req.adminContext.branch_id,branch_name:(await db.query('SELECT name FROM clinic_branches WHERE id=?',[req.adminContext.branch_id]))[0]?.[0]?.name||null,permissions:req.adminPermissions})
})
const branchDashboard = async(req,res)=>{
 const id=req.branchId
 const [[a]]=await db.query('SELECT COUNT(*) AS total, SUM(status=\'pending\') AS pending, SUM(appointment_date=CURRENT_DATE()) AS today FROM appointments WHERE branch_id=?',[id])
 const [[d]]=await db.query('SELECT COUNT(*) AS total FROM doctors WHERE branch_id=? AND is_active=1',[id])
 const [[s]]=await db.query('SELECT COUNT(*) AS total FROM staff WHERE branch_id=? AND status=\'active\'',[id])
 const [[b]]=await db.query("SELECT COALESCE(SUM(total_amount),0) AS billed FROM billing_records WHERE branch_id=? AND status<>'voided'",[id])
 const [[i]]=await db.query('SELECT COUNT(*) AS total FROM inventory WHERE branch_id=?',[id])
 res.json({branch:req.branch,appointments:Number(a.total||0),pending:Number(a.pending||0),today:Number(a.today||0),doctors:Number(d.total||0),staff:Number(s.total||0),billed:Number(b.billed||0),inventory_items:Number(i.total||0)})
}
const listResource = (resource,permission) => [requirePermission(permission),async(req,res)=>{
  const names={appointments:`SELECT a.id,a.patient_id,a.doctor_id,a.appointment_date,a.appointment_time,a.status,a.clinic_type,p.full_name AS patient_name,d.full_name AS doctor_name FROM appointments a LEFT JOIN patients p ON p.id=a.patient_id LEFT JOIN doctors d ON d.id=a.doctor_id WHERE a.branch_id=? ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 250`,inventory:`SELECT id,barcode,name,category,item_type,stock,threshold,selling_price FROM inventory WHERE branch_id=? ORDER BY name LIMIT 250`,services:`SELECT id,service_name,clinic_type,category_id,default_price,average_duration_minutes,is_active FROM billing_service_catalog WHERE branch_id=? ORDER BY created_at ASC,id ASC LIMIT 250`,doctors:`SELECT id,full_name,specialty,clinic_type,is_active FROM doctors WHERE branch_id=? ORDER BY full_name LIMIT 250`,staff:`SELECT id,full_name,email,role,status FROM staff WHERE branch_id=? ORDER BY full_name LIMIT 250`,patients:`SELECT DISTINCT p.id,p.full_name,p.email,p.phone FROM patients p JOIN appointments a ON a.patient_id=p.id WHERE a.branch_id=? ORDER BY p.full_name LIMIT 250`,billing:`SELECT b.id,b.appointment_id,b.status,b.total_amount,b.created_at,p.full_name AS patient_name FROM billing_records b JOIN patients p ON p.id=b.patient_id WHERE b.branch_id=? ORDER BY b.created_at DESC LIMIT 250`,transfers:`SELECT id,inventory_id,from_location,to_location,quantity,transferred_at FROM inventory_transfers WHERE from_branch_id=? ORDER BY transferred_at DESC LIMIT 250`,audits:`SELECT id,user_role,action,entity_type,entity_id,old_values,new_values,created_at FROM audit_logs WHERE branch_id=? ORDER BY created_at DESC,id DESC LIMIT 250`}
  const [rows]=await db.query(names[resource],[req.branchId]);res.json(rows)
}]
const getBookingPolicy = async(req,res)=>{
 const [[p]]=await db.query('SELECT * FROM branch_booking_settings WHERE branch_id=?',[req.branchId]);res.json(p || {branch_id:req.branchId,online_min_lead_minutes:720,pending_confirmation_cutoff_minutes:60,booking_start_interval_minutes:30,no_show_grace_minutes:15})
}
const saveBookingPolicy = async(req,res)=>{
 const input=validateBookingSettings(req.body)
 const grace=Number(req.body.no_show_grace_minutes??15)
 if(!Number.isInteger(grace)||grace<0||grace>240||grace%5!==0)return res.status(400).json({message:'No-show grace must be 0 to 240 minutes in 5-minute increments.'})
 await db.query(`INSERT INTO branch_booking_settings (branch_id,online_min_lead_minutes,pending_confirmation_cutoff_minutes,booking_start_interval_minutes,no_show_grace_minutes,updated_by_admin_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE online_min_lead_minutes=VALUES(online_min_lead_minutes),pending_confirmation_cutoff_minutes=VALUES(pending_confirmation_cutoff_minutes),booking_start_interval_minutes=30,no_show_grace_minutes=VALUES(no_show_grace_minutes),updated_by_admin_id=VALUES(updated_by_admin_id)`,[req.branchId,input.online_min_lead_minutes,input.pending_confirmation_cutoff_minutes,30,grace,req.user.id]);
 await audit(req,'booking_policy.updated','branch_booking_policy',req.branchId,null,{...input,no_show_grace_minutes:grace},req.branchId);await getBookingPolicy(req,res)
}
const installBranchEndpoints = (prefix, context) => {
 router.get(`${prefix}/dashboard`,context,requirePermission('dashboard'),branchDashboard)
 for(const [resource,permission] of Object.entries({appointments:'appointments',inventory:'inventory',services:'system_setup',doctors:'doctor_schedules',staff:'accounts',patients:'patient_records',billing:'billing',transfers:'stock_transfers',audits:'audit_logs'})) router.get(`${prefix}/${resource}`,context,...listResource(resource,permission))
 router.get(`${prefix}/booking-policy`,context,requirePermission('system_setup'),getBookingPolicy)
 router.put(`${prefix}/booking-policy`,context,requirePermission('system_setup'),saveBookingPolicy)
}
installBranchEndpoints('/my',branchContext)
// Actual Super Admin branch-scoped endpoints with a branch lookup.
for (const [resource,permission] of Object.entries({dashboard:'dashboard',appointments:'appointments',inventory:'inventory',services:'system_setup',doctors:'doctor_schedules',staff:'accounts',patients:'patient_records',billing:'billing',transfers:'stock_transfers',audits:'audit_logs'})) {
 const handler=resource==='dashboard'?branchDashboard:listResource(resource,permission).at(-1)
 router.get(`/workspace/:branchId/${resource}`,requireSuper,branchContext,requirePermission(permission),handler)
}
router.get('/workspace/:branchId/booking-policy',requireSuper,branchContext,requirePermission('system_setup'),getBookingPolicy)
router.put('/workspace/:branchId/booking-policy',requireSuper,branchContext,requirePermission('system_setup'),saveBookingPolicy)


const serviceBody = async (req,res,branchId) => {
 const name=String(req.body?.service_name||'').trim(),type=String(req.body?.clinic_type||''),price=Number(req.body?.default_price),duration=Number(req.body?.average_duration_minutes||60),categoryId=Number(req.body?.category_id||0)
 if(!name||name.length>180||!['medical','derma'].includes(type)||!Number.isFinite(price)||price<0||price>10000000||!Number.isInteger(duration)||duration<15||duration>480||duration%15!==0){res.status(400).json({message:'Enter a valid service name, clinic type, price and 15–480 minute duration.'});return null}
 let category='Other Services'
 if(categoryId){const [[cat]]=await db.query('SELECT name FROM billing_service_categories WHERE id=? AND branch_id=? AND clinic_type=?',[categoryId,branchId,type]);if(!cat){res.status(400).json({message:'Choose a category from this branch.'});return null}category=cat.name}
 return {name,type,price,duration,categoryId:categoryId||null,category,isActive:req.body?.is_active===false || Number(req.body?.is_active)===0?0:1}
}
const addService=async(req,res)=>{
 const v=await serviceBody(req,res,req.branchId);if(!v)return
 const [result]=await db.query(`INSERT INTO billing_service_catalog (category_id,category,service_name,clinic_type,default_price,consultation_fee,average_duration_minutes,profit_percentage,is_active,branch_id) VALUES (?,?,?,?,?,?,?,0,?,?)`,[v.categoryId,v.category,v.name,v.type,v.price,v.price,v.duration,v.isActive,req.branchId])
 await audit(req,'service.created','billing_service',result.insertId,null,{service_name:v.name,default_price:v.price},req.branchId)
 res.status(201).json({id:result.insertId,branch_id:req.branchId,...v})
}
const editService=async(req,res)=>{
 const [[old]]=await db.query('SELECT * FROM billing_service_catalog WHERE id=? AND branch_id=?',[req.params.serviceId,req.branchId]);if(!old)return res.status(404).json({message:'Service not found in your branch.'})
 const v=await serviceBody({body:{...old,...req.body}},res,req.branchId);if(!v)return
 await db.query(`UPDATE billing_service_catalog SET category_id=?,category=?,service_name=?,clinic_type=?,default_price=?,consultation_fee=?,average_duration_minutes=?,is_active=? WHERE id=? AND branch_id=?`,[v.categoryId,v.category,v.name,v.type,v.price,v.price,v.duration,v.isActive,old.id,req.branchId])
 await audit(req,'service.updated','billing_service',old.id,old,{service_name:v.name,default_price:v.price,is_active:v.isActive},req.branchId)
 res.json({id:old.id,branch_id:req.branchId,...v})
}
for(const [prefix,context] of [['/my',branchContext],['/workspace/:branchId',requireSuper]]){
 const middle=prefix==='/my'?[context]:[context,branchContext]
 router.get(`${prefix}/categories`,...middle,requirePermission('system_setup'),async(req,res)=>{const [rows]=await db.query('SELECT id,name,clinic_type,is_active FROM billing_service_categories WHERE branch_id=? ORDER BY name',[req.branchId]);res.json(rows)})
 router.post(`${prefix}/categories`,...middle,requirePermission('system_setup'),async(req,res)=>{
  const name=String(req.body.name||'').trim(),type=String(req.body.clinic_type||'')
  if(!name||name.length>120||!['medical','derma'].includes(type))return res.status(400).json({message:'Enter category name and clinic type.'})
  const [result]=await db.query('INSERT INTO billing_service_categories (name,clinic_type,branch_id,is_active) VALUES (?,?,?,1)',[name,type,req.branchId]);await audit(req,'service_category.created','billing_service_category',result.insertId,null,{name,clinic_type:type},req.branchId);res.status(201).json({id:result.insertId,name,clinic_type:type})
 })
 router.post(`${prefix}/services`,...middle,requirePermission('system_setup'),addService)
 router.put(`${prefix}/services/:serviceId`,...middle,requirePermission('system_setup'),editService)
}

// Cancellation reasons belong to the same physical branch as the appointment.
// Sorting uses creation date, then ID. "Other" remains the existing built-in fallback.
for (const [prefix,context] of [['/my',branchContext],['/workspace/:branchId',requireSuper]]) {
 const middleware=prefix==='/my'?[context]:[context,branchContext]
 router.get(`${prefix}/cancellation-reasons`,...middleware,requirePermission('system_setup'),async(req,res)=>{
   const [rows]=await db.query('SELECT id,label,is_active,created_at FROM appointment_cancellation_reasons WHERE branch_id=? ORDER BY created_at ASC,id ASC',[req.branchId])
   res.json(rows)
 })
 router.post(`${prefix}/cancellation-reasons`,...middleware,requirePermission('system_setup'),async(req,res)=>{
   const label=String(req.body?.label||'').trim()
   if(!label||label.length>120||label.toLowerCase()==='other')return res.status(400).json({message:'Enter a reason up to 120 characters. Other is a built-in choice.'})
   const [result]=await db.query('INSERT INTO appointment_cancellation_reasons (label,is_active,branch_id) VALUES (?,?,?)',[label,req.body.is_active===false?0:1,req.branchId])
   await audit(req,'cancellation_reason.created','cancellation_reason',result.insertId,null,{label},req.branchId)
   res.status(201).json({id:result.insertId,label})
 })
 router.put(`${prefix}/cancellation-reasons/:id`,...middleware,requirePermission('system_setup'),async(req,res)=>{
   const [[prior]]=await db.query('SELECT * FROM appointment_cancellation_reasons WHERE id=? AND branch_id=?',[req.params.id,req.branchId]);if(!prior)return res.status(404).json({message:'Reason not found in this branch.'})
   const label=String(req.body.label??prior.label).trim(),isActive=req.body.is_active===undefined?Number(prior.is_active):Number(Boolean(req.body.is_active))
   if(!label||label.length>120||label.toLowerCase()==='other')return res.status(400).json({message:'Invalid reason name.'})
   await db.query('UPDATE appointment_cancellation_reasons SET label=?,is_active=? WHERE id=? AND branch_id=?',[label,isActive,prior.id,req.branchId])
   await audit(req,'cancellation_reason.updated','cancellation_reason',prior.id,{label:prior.label,is_active:prior.is_active},{label,is_active:isActive},req.branchId)
   res.json({id:prior.id,label,is_active:isActive})
 })
 router.delete(`${prefix}/cancellation-reasons/:id`,...middleware,requirePermission('system_setup'),async(req,res)=>{
   const [[reason]]=await db.query('SELECT id,label FROM appointment_cancellation_reasons WHERE id=? AND branch_id=?',[req.params.id,req.branchId]);if(!reason)return res.status(404).json({message:'Reason not found.'})
   // Deactivate rather than deleting an option referenced by historical appointments.
   await db.query('UPDATE appointment_cancellation_reasons SET is_active=0 WHERE id=? AND branch_id=?',[reason.id,req.branchId])
   await audit(req,'cancellation_reason.deactivated','cancellation_reason',reason.id,reason,{is_active:0},req.branchId)
   res.json({message:'Reason deactivated. Historical appointments retain their reason.'})
 })
}

// Existing robust appointment state machine is reused, but only AFTER validating
// ownership. A forged ID from another branch never reaches the legacy controller.
const oldAdmin = require('../controllers/admin.controller')
const ownedAppointmentAction = (controller) => [requirePermission('appointments'),async(req,res,next)=>{
 const id=Number(req.params.appointmentId)
 if(!validId(id))return res.status(400).json({message:'Invalid appointment.'})
 const [[record]]=await db.query('SELECT branch_id FROM appointments WHERE id=?',[id])
 if(!record || Number(record.branch_id)!==req.branchId)return res.status(404).json({message:'Appointment not found in your branch.'})
 req.params.id=String(id)
 return Promise.resolve(controller(req,res)).catch(next)
}]
for(const [action,controller] of Object.entries({confirm:oldAdmin.confirmAppointment,cancel:oldAdmin.cancelAppointment,'no-show':oldAdmin.markAppointmentNoShow,reschedule:oldAdmin.rescheduleAppointment})) {
 router.patch(`/my/appointments/:appointmentId/${action}`,branchContext,...ownedAppointmentAction(controller))
 router.patch(`/workspace/:branchId/appointments/:appointmentId/${action}`,requireSuper,branchContext,...ownedAppointmentAction(controller))
}

router.get('/analytics/all',requireSuper,async(req,res)=>{
 const [rows]=await db.query(`SELECT b.id,b.name,b.code,(SELECT COUNT(*) FROM appointments a WHERE a.branch_id=b.id) AS appointments,(SELECT COUNT(*) FROM appointments a WHERE a.branch_id=b.id AND a.status='pending') AS pending,(SELECT COUNT(*) FROM doctors d WHERE d.branch_id=b.id AND d.is_active=1) AS doctors,(SELECT COALESCE(SUM(total_amount),0) FROM billing_records r WHERE r.branch_id=b.id AND r.status<>'voided') AS billed FROM clinic_branches b ORDER BY b.created_at,b.id`)
 res.json(rows)
})
router.get('/audit/all',requireSuper,async(req,res)=>{
 const requested=Number(req.query.branch_id||0)
 const [rows]=requested?await db.query('SELECT * FROM audit_logs WHERE branch_id=? ORDER BY created_at DESC,id DESC LIMIT 250',[requested]):await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT 250')
 res.json(rows)
})
module.exports={router,PERMISSIONS,forbidden}

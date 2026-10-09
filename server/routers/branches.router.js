// Physical-branch management. Unlike the legacy admin controller, every data
// query here contains an explicit authorized physical-branch predicate.
const express = require('express')
const bcrypt = require('bcrypt')
const {randomBytes} = require('crypto')
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
// /my uses only the Branch Admin cookie. Central and workspace endpoints use
// the Super Admin cookie. A second sign-in in another tab cannot switch identity.
router.use((req,res,next) => authenticate.adminContext(!req.path.startsWith('/my'))(req,res,next))
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
const allowAnyPermission = (...keys) => (req,res,next) => req.adminContext.account_role==='superadmin' || keys.some(k=>req.adminPermissions.includes(k))?next():forbidden(res)
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
  const name=String(req.body?.name||'').trim(),code=`BR-${randomBytes(8).toString('hex').toUpperCase()}`
  if(!name||name.length>180) return res.status(400).json({message:'Enter a branch name (up to 180 characters).'})
  const [result]=await db.query('INSERT INTO clinic_branches (name,code,address,phone,email,offers_medical,offers_derma,is_active) VALUES (?,?,?,?,?,?,?,?)',[name,code,String(req.body.address||'').slice(0,255)||null,String(req.body.phone||'').slice(0,80)||null,String(req.body.email||'').slice(0,160)||null,req.body.offers_medical===false?0:1,req.body.offers_derma===false?0:1,req.body.is_active===false?0:1])
  await db.query('INSERT INTO branch_booking_settings (branch_id) VALUES (?)',[result.insertId])
  await audit(req,'branch.created','clinic_branch',result.insertId,null,{name,code},result.insertId)
  res.status(201).json({id:result.insertId,name,code})
})
router.put('/:branchId',requireSuper,branchContext,async(req,res)=>{
  const current=req.branch
  const name=String(req.body?.name??current.name).trim(),code=current.code
  if(!name||name.length>180) return res.status(400).json({message:'Enter a valid branch name.'})
  const next={name,code,address:String(req.body.address??current.address??'').trim().slice(0,255)||null,phone:String(req.body.phone??current.phone??'').trim().slice(0,80)||null,email:String(req.body.email??current.email??'').trim().slice(0,160)||null,offers_medical:req.body.offers_medical===undefined?Number(current.offers_medical):Number(Boolean(req.body.offers_medical)),offers_derma:req.body.offers_derma===undefined?Number(current.offers_derma):Number(Boolean(req.body.offers_derma)),is_active:req.body.is_active===undefined?Number(current.is_active):Number(Boolean(req.body.is_active))}
  if(Number(current.is_active)===1 && next.is_active===0){const [[pending]]=await db.query("SELECT COUNT(*) AS total FROM appointments WHERE branch_id=? AND appointment_date>=CURRENT_DATE() AND status IN ('pending','confirmed','rescheduled','in-progress')",[req.branchId]);if(Number(pending.total)>0)return res.status(409).json({message:`This branch has ${pending.total} active or upcoming appointments. Resolve them before deactivation.`})}
  await db.query('UPDATE clinic_branches SET name=?,code=?,address=?,phone=?,email=?,offers_medical=?,offers_derma=?,is_active=? WHERE id=?',[...Object.values(next),req.branchId])
  await audit(req,'branch.updated','clinic_branch',req.branchId,current,next,req.branchId)
  res.json({id:req.branchId,...next})
})
router.delete('/:branchId',requireSuper,branchContext,async(req,res)=>{
  // Do not deactivate a branch while it has live future patient bookings.
  const [[pending]]=await db.query("SELECT COUNT(*) AS total FROM appointments WHERE branch_id=? AND appointment_date>=CURRENT_DATE() AND status IN ('pending','confirmed','rescheduled','in-progress')",[req.branchId])
  if(Number(pending.total)>0)return res.status(409).json({message:`This branch has ${pending.total} upcoming or active appointment(s). Resolve or transfer these appointments before deactivation.`})
  // Archive, never destroy historic medical/billing/stock records.
  await db.query('UPDATE clinic_branches SET is_active=0 WHERE id=?',[req.branchId])
  await audit(req,'branch.deactivated','clinic_branch',req.branchId,{is_active:req.branch.is_active},{is_active:0},req.branchId)
  res.json({message:'Branch deactivated. Historical records have been retained.'})
})
router.get('/accounts/admins',requireSuper,async(req,res)=>{
  const [rows]=await db.query(`SELECT a.id,a.full_name,a.email,a.phone,a.account_role,a.branch_id,a.is_active,a.created_at,b.name AS branch_name FROM admins a LEFT JOIN clinic_branches b ON b.id=a.branch_id WHERE a.account_role='admin' ORDER BY a.created_at DESC,a.id DESC`)
  const [perms]=await db.query('SELECT admin_id,permission_key FROM admin_branch_permissions WHERE granted=1')
  res.json(rows.map(a=>({...a,permissions:perms.filter(p=>p.admin_id===a.id).map(p=>p.permission_key)})))
})
router.post('/accounts/admins',requireSuper,async(req,res)=>{
  const full_name=String(req.body?.full_name||'').trim(),email=String(req.body?.email||'').trim().toLowerCase(),branchId=Number(req.body?.branch_id),phone=String(req.body?.phone||'').trim()
  if(!full_name||full_name.length>150||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!validId(branchId)||!/^\+?[0-9 ()-]{7,24}$/.test(phone))return res.status(400).json({message:'Full name, valid email, contact number and one branch are required.'})
  const [[branch]]=await db.query('SELECT id FROM clinic_branches WHERE id=? AND is_active=1',[branchId]);if(!branch)return res.status(400).json({message:'The selected branch is not active.'})
  const permissions=permissionsFromBody(req.body.permissions)
  const temporaryPassword=makeTemporaryPassword()
  const password=await bcrypt.hash(temporaryPassword,12)
  const connection=await db.getConnection()
  let id
  try{
    await connection.beginTransaction()
    const [result]=await connection.query('INSERT INTO admins (full_name,email,phone,password,account_role,branch_id,is_active) VALUES (?,?,?,?,\'admin\',?,1)',[full_name,email,phone,password,branchId])
    id=result.insertId
    for(const p of permissions)await connection.query('INSERT INTO admin_branch_permissions (admin_id,permission_key,granted) VALUES (?,?,1)',[id,p])
    await connection.commit()
  }catch(e){await connection.rollback();throw e}finally{connection.release()}
  let invitationSent=true
  try {await sendTempPassword(email,full_name,'Branch Admin',temporaryPassword,`${process.env.CLIENT_URL||''}/admin/login`)} catch(e){invitationSent=false;console.error('[branches] Admin invitation email failed',e.message)}
  await audit(req,'branch_admin.created','admin',id,null,{full_name,email,phone,permissions,invitationSent},branchId)
  res.status(201).json({id,full_name,email,phone,branch_id:branchId,permissions,invitation_sent:invitationSent,message:invitationSent?'Admin created and login email sent.':'Admin created but invitation email failed. Resend the invitation securely.'})
})
router.put('/accounts/admins/:adminId',requireSuper,async(req,res)=>{
  const id=Number(req.params.adminId)
  const [[prior]]=await db.query("SELECT id,account_role,branch_id,is_active,full_name,email,phone FROM admins WHERE id=? AND account_role='admin'",[id])
  if(!prior)return res.status(404).json({message:'Branch Admin not found.'})
  const branchId=Number(req.body.branch_id??prior.branch_id),permissions=permissionsFromBody(req.body.permissions)
  const [[branch]]=await db.query('SELECT id FROM clinic_branches WHERE id=? AND is_active=1',[branchId]);if(!branch)return res.status(400).json({message:'Select an active branch.'})
  const active=req.body.is_active===undefined?Number(prior.is_active):Number(Boolean(req.body.is_active))
  const full_name=String(req.body.full_name??prior.full_name).trim(),phone=String(req.body.phone??prior.phone??'').trim()
  if(!/^\+?[0-9 ()-]{7,24}$/.test(phone))return res.status(400).json({message:'Enter a valid contact number.'})
  const connection=await db.getConnection()
  try {await connection.beginTransaction();await connection.query('UPDATE admins SET full_name=?,phone=?,branch_id=?,is_active=?,session_version=session_version+1 WHERE id=?',[full_name,phone,branchId,active,id]);await connection.query('DELETE FROM admin_branch_permissions WHERE admin_id=?',[id]);for(const p of permissions)await connection.query('INSERT INTO admin_branch_permissions (admin_id,permission_key,granted) VALUES (?,?,1)',[id,p]);await connection.commit()}catch(e){await connection.rollback();throw e}finally{connection.release()}
  await audit(req,'branch_admin.updated','admin',id,prior,{branch_id:branchId,full_name,phone,is_active:active,permissions},branchId)
  res.json({id,branch_id:branchId,is_active:active,full_name,phone,permissions})
})
// Branch Admin notifications must never include global or another branch's events.
router.get('/my/notifications',branchContext,async(req,res)=>{
  const [rows]=await db.query(`SELECT id,type,title,message,reference_type,reference_id,link,is_read,created_at
    FROM notifications WHERE branch_id=? AND target_role='admin' AND (target_user_id IS NULL OR target_user_id=?)
    ORDER BY created_at DESC,id DESC LIMIT 50`,[req.branchId,req.user.id])
  res.json({items:rows,unread:rows.filter(row=>!row.is_read).length})
})
router.patch('/my/notifications/read-all',branchContext,async(req,res)=>{
  await db.query(`UPDATE notifications SET is_read=1 WHERE branch_id=? AND target_role='admin' AND (target_user_id IS NULL OR target_user_id=?)`,[req.branchId,req.user.id])
  res.json({success:true})
})
router.patch('/my/notifications/:notificationId/read',branchContext,async(req,res)=>{
  await db.query(`UPDATE notifications SET is_read=1 WHERE id=? AND branch_id=? AND target_role='admin' AND (target_user_id IS NULL OR target_user_id=?)`,[req.params.notificationId,req.branchId,req.user.id])
  res.json({message:'Notification marked as read.'})
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

// Date-scoped consolidated reporting. Existing financial amounts are not silently
// treated as cash collections: billed and net collected are separate measures.
const reportRange = (req) => {
 const iso = /^\d{4}-\d{2}-\d{2}$/
 const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 const days = Number(req.query.days || 30)
 const fallback = Number.isInteger(days) && days >= 1 && days <= 366 ? days : 30
 const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate()-fallback+1)
 const from = req.query.from || d.toISOString().slice(0,10), to = req.query.to || today
 if(!iso.test(from)||!iso.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||new Date(from).toISOString().slice(0,10)!==from||new Date(to).toISOString().slice(0,10)!==to||from>to||(Date.parse(to)-Date.parse(from))/86400000>366) {
  const err=new Error('Select a valid date range of no more than 366 days.');err.statusCode=400;throw err
 }
 return {from,to}
}
router.get('/analytics/all',requireSuper,async(req,res)=>{
 const {from,to}=reportRange(req)
 const [rows]=await db.query(`SELECT b.id,b.name,b.code,b.is_active,
  (SELECT COUNT(*) FROM appointments a WHERE a.branch_id=b.id AND a.appointment_date BETWEEN ? AND ?) AS appointments,
  (SELECT COUNT(*) FROM appointments a WHERE a.branch_id=b.id AND a.appointment_date BETWEEN ? AND ? AND a.status='pending') AS pending,
  (SELECT COUNT(*) FROM appointments a WHERE a.branch_id=b.id AND a.appointment_date BETWEEN ? AND ? AND a.status='completed') AS completed,
  (SELECT COUNT(*) FROM appointments a WHERE a.branch_id=b.id AND a.appointment_date BETWEEN ? AND ? AND a.status='no_show') AS no_shows,
  (SELECT COUNT(*) FROM doctors d WHERE d.branch_id=b.id AND d.is_active=1) AS doctors,
  (SELECT COALESCE(SUM(r.total_amount),0) FROM billing_records r WHERE r.branch_id=b.id AND r.status<>'voided' AND DATE(r.created_at) BETWEEN ? AND ?) AS billed,
  (SELECT COALESCE(SUM(GREATEST(p.amount-COALESCE(p.refund_amount,0),0)),0)
   FROM billing_payments p JOIN billing_records br ON br.id=p.billing_id
   WHERE br.branch_id=b.id AND p.status='completed' AND p.voided_at IS NULL AND DATE(p.paid_at) BETWEEN ? AND ?) AS collected
  FROM clinic_branches b ORDER BY b.created_at,b.id`,[from,to,from,to,from,to,from,to,from,to,from,to])
 res.json(rows)
})
router.get('/analytics/trends',requireSuper,async(req,res)=>{
 const {from,to}=reportRange(req)
 const branchId=Number(req.query.branch_id||0)
 if(branchId && !validId(branchId))return res.status(400).json({message:'Invalid branch selection.'})
 const args=[from,to];let clause=''
 if(branchId){clause=' AND branch_id=?';args.push(branchId)}
 const [appointments]=await db.query(`SELECT DATE_FORMAT(appointment_date,'%Y-%m-%d') AS date,COUNT(*) AS appointments,SUM(status='completed') AS completed FROM appointments WHERE appointment_date BETWEEN ? AND ? ${clause} GROUP BY appointment_date ORDER BY appointment_date`,args)
 res.json({from,to,appointments})
})
router.get('/analytics/readiness',requireSuper,async(req,res)=>{
 const [rows]=await db.query(`SELECT b.id,b.name,b.is_active,b.offers_medical,b.offers_derma,
  (SELECT COUNT(*) FROM admins a WHERE a.branch_id=b.id AND a.account_role='admin' AND a.is_active=1) AS admins,
  (SELECT COUNT(*) FROM doctors d WHERE d.branch_id=b.id AND d.is_active=1) AS doctors,
  (SELECT COUNT(*) FROM doctors d JOIN doctor_schedules ds ON ds.doctor_id=d.id WHERE d.branch_id=b.id AND d.is_active=1 AND ds.is_active=1) AS schedules,
  (SELECT COUNT(*) FROM billing_service_catalog sc WHERE sc.branch_id=b.id AND sc.is_active=1) AS services,
  EXISTS(SELECT 1 FROM branch_booking_settings bs WHERE bs.branch_id=b.id) AS policy
  FROM clinic_branches b ORDER BY b.id`)
 res.json(rows.map(r=>({...r,ready:Boolean(r.is_active && Number(r.doctors)>0 && Number(r.schedules)>0 && Number(r.services)>0 && Number(r.policy)>0),missing:[...(Number(r.admins)?[]:['Assign a Branch Admin']),...(Number(r.doctors)?[]:['Assign an active doctor']),...(Number(r.schedules)?[]:['Configure an active doctor schedule']),...(Number(r.services)?[]:['Enable a bookable service']),...(Number(r.policy)?[]:['Configure booking policy'])]})))
})
router.get('/audit/all',requireSuper,async(req,res)=>{
 const requested=Number(req.query.branch_id||0)
 if(requested && !validId(requested))return res.status(400).json({message:'Invalid branch.'})
 const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page,10)||1)),limit=Math.min(100,Math.max(10,Number.parseInt(req.query.limit,10)||25))
 const allowedActions=['create','update','delete','auth','branch','service','booking','account','appointment']
 const action=String(req.query.action||'').trim()
 if(action && !allowedActions.includes(action))return res.status(400).json({message:'Invalid activity filter.'})
 const search=String(req.query.search||'').trim().slice(0,100)
 const where=[],params=[]
 if(requested){where.push('a.branch_id=?');params.push(requested)}
 if(action){where.push('a.action LIKE ?');params.push(`%${action}%`)}
 if(search){where.push('(a.action LIKE ? OR a.entity_type LIKE ? OR a.entity_id LIKE ?)');params.push(...Array(3).fill(`%${search}%`))}
 const from=String(req.query.from||''),to=String(req.query.to||'')
 if(from||to){if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)return res.status(400).json({message:'Enter valid start and end dates.'});where.push('DATE(a.created_at) BETWEEN ? AND ?');params.push(from,to)}
 const sqlWhere=where.length?`WHERE ${where.join(' AND ')}`:''
 const [[count]]=await db.query(`SELECT COUNT(*) AS total FROM audit_logs a ${sqlWhere}`,params)
 const [rows]=await db.query(`SELECT a.*,b.name AS branch_name,CASE WHEN a.user_role IN ('admin','superadmin') THEN aa.full_name WHEN a.user_role='staff' THEN ss.full_name WHEN a.user_role='doctor' THEN dd.full_name WHEN a.user_role='patient' THEN pp.full_name ELSE NULL END AS actor_name FROM audit_logs a LEFT JOIN clinic_branches b ON b.id=a.branch_id LEFT JOIN admins aa ON a.user_role IN ('admin','superadmin') AND aa.id=a.user_id LEFT JOIN staff ss ON a.user_role='staff' AND ss.id=a.user_id LEFT JOIN doctors dd ON a.user_role='doctor' AND dd.id=a.user_id LEFT JOIN patients pp ON a.user_role='patient' AND pp.id=a.user_id ${sqlWhere} ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`,[...params,limit,(page-1)*limit])
 // Keep the legacy array response only for legacy callers; new UI opts into pagination.
 if(req.query.paginated==='1')return res.json({rows,total:Number(count.total),page,limit,pages:Math.max(1,Math.ceil(Number(count.total)/limit))})
 res.json(rows)
})

// Compatibility responses for the ORIGINAL Admin Portal. Unlike the legacy
// /api/admin controllers, every query is scoped to an authenticated branch.
// Unsupported legacy mutations deliberately return 404 instead of falling
// through to an unscoped controller. Restore each workflow only after auditing it.
const bridgeDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
const originalDashboard = async(req,res) => {
  const id=req.branchId
  const [[pending]]=await db.query(`SELECT COUNT(*) AS pendingApprovals FROM appointments WHERE branch_id=? AND status='pending'`,[id])
  const [[patients]]=await db.query(`SELECT COUNT(DISTINCT patient_id) AS totalPatients FROM appointments WHERE branch_id=?`,[id])
  const [[lowStock]]=await db.query('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE branch_id=? AND stock<=threshold',[id])
  const [doctors]=await db.query(`SELECT d.id,d.full_name,d.clinic_type,CASE WHEN d.is_active=1 THEN 'available' ELSE 'inactive' END AS status FROM doctors d WHERE d.branch_id=? ORDER BY d.full_name`,[id])
  const {getOnlineBookingReadiness}=require('../utils/bookingReadiness')
  const bookingReadiness=await getOnlineBookingReadiness(db,id)
  res.json({pendingApprovals:Number(pending.pendingApprovals||0),totalPatients:Number(patients.totalPatients||0),lowStockCount:Number(lowStock.lowStockCount||0),doctorStatus:doctors,bookingReadiness})
}
const originalAppointments = async(req,res) => {
  const date=bridgeDate(req.query.date)
  if(req.query.date && !date)return res.status(400).json({message:'Invalid date.'})
  const [rows]=await db.query(`SELECT a.*,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,
    a.appointment_time AS time,a.clinic_type AS type,
    p.full_name AS patient_name,p.full_name AS patient_full_name,
    d.full_name AS doctor_name,d.full_name AS doctor,d.specialty
    FROM appointments a JOIN patients p ON p.id=a.patient_id
    JOIN doctors d ON d.id=a.doctor_id
    WHERE a.branch_id=? ${date?'AND a.appointment_date=?':''}
    ORDER BY a.appointment_date DESC,a.appointment_time ASC LIMIT 500`,date?[req.branchId,date]:[req.branchId])
  res.json(rows)
}
const originalPatients = async(req,res)=>{
  const [rows]=await db.query(`SELECT p.id,p.full_name,p.birthdate,p.gender,p.sex,p.civil_status,p.phone,p.address,p.email,p.created_at,p.profile_image_url,p.is_walk_in FROM patients p WHERE EXISTS
    (SELECT 1 FROM appointments a WHERE a.patient_id=p.id AND a.branch_id=?)
    ORDER BY p.full_name LIMIT 500`,[req.branchId]);res.json(rows)
}
const originalPatientDetails=async(req,res)=>{
  const patientId=Number(req.params.id)
  if(!validId(patientId))return res.status(400).json({message:'Invalid patient.'})
  const [[patient]]=await db.query(`SELECT p.id,p.full_name,p.birthdate,p.gender,p.sex,p.civil_status,p.phone,p.address,p.email,p.created_at,p.profile_image_url,p.is_walk_in FROM patients p WHERE p.id=? AND EXISTS
    (SELECT 1 FROM appointments a WHERE a.patient_id=p.id AND a.branch_id=?)`,[patientId,req.branchId])
  if(!patient)return res.status(404).json({message:'Patient not found in this branch.'})
  const [history]=await db.query(`SELECT a.*,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,
      d.full_name AS doctor_name,c.diagnosis,c.prescription,c.notes AS consultation_notes
      FROM appointments a JOIN doctors d ON d.id=a.doctor_id
      LEFT JOIN consultations c ON c.appointment_id=a.id AND c.branch_id=a.branch_id
      WHERE a.patient_id=? AND a.branch_id=? ORDER BY a.appointment_date DESC LIMIT 500`,[patientId,req.branchId])
  res.json({patient,history})
}
const originalDoctors=async(req,res)=>{
  const [rows]=await db.query('SELECT id,full_name,full_name AS name,email,phone,specialty,clinic_type,clinic_type AS type,prc_license,is_active,created_at FROM doctors WHERE branch_id=? ORDER BY full_name',[req.branchId]);res.json(rows)
}
const originalStaff=async(req,res)=>{
  const [rows]=await db.query('SELECT id,full_name,email,phone,role,status,created_at FROM staff WHERE branch_id=? ORDER BY full_name',[req.branchId]);
  const [permissions]=await db.query(`SELECT sp.staff_id,sp.permission_key FROM staff_permissions sp JOIN staff s ON s.id=sp.staff_id WHERE s.branch_id=? AND sp.granted=1`,[req.branchId]);
  res.json(rows.map(row=>({...row,permissions:permissions.filter(p=>Number(p.staff_id)===Number(row.id)).map(p=>p.permission_key)})))
}
const originalDoctorSchedules=async(req,res)=>{
  const doctorId=Number(req.params.id)
  if(!validId(doctorId))return res.status(400).json({message:'Invalid doctor.'})
  const [[doctor]]=await db.query('SELECT id FROM doctors WHERE id=? AND branch_id=?',[doctorId,req.branchId])
  if(!doctor)return res.status(404).json({message:'Doctor not found in this branch.'})
  const [rows]=await db.query('SELECT * FROM doctor_schedules WHERE doctor_id=? ORDER BY day_of_week',[doctorId]);res.json(rows)
}
const originalServices=async(req,res)=>{
  const [rows]=await db.query(`SELECT * FROM billing_service_catalog WHERE branch_id=? ORDER BY created_at,id LIMIT 500`,[req.branchId]);res.json(rows)
}
const originalInventory=async(req,res)=>{
  const [rows]=await db.query('SELECT * FROM inventory WHERE branch_id=? ORDER BY name LIMIT 500',[req.branchId]);res.json(rows)
}
for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  router.get(`${prefix}/dashboard`,...middle,requirePermission('dashboard'),originalDashboard)
  router.get(`${prefix}/appointments`,...middle,requirePermission('appointments'),originalAppointments)
  router.get(`${prefix}/patients`,...middle,allowAnyPermission('patient_records','appointments'),originalPatients)
  router.get(`${prefix}/patients/:id`,...middle,requirePermission('patient_records'),originalPatientDetails)
  router.get(`${prefix}/doctors`,...middle,allowAnyPermission('doctor_schedules','accounts','appointments'),originalDoctors)
  router.get(`${prefix}/doctors/:id/schedules`,...middle,requirePermission('doctor_schedules'),originalDoctorSchedules)
  router.get(`${prefix}/staff`,...middle,requirePermission('accounts'),originalStaff)
  const validateDelegation=(req,res,next)=>{
    if(req.adminContext.account_role==='superadmin')return next()
    if(!Object.prototype.hasOwnProperty.call(req.body||{},'permissions'))return next()
    const allowed=new Set(req.adminPermissions)
    if(allowed.has('billing'))allowed.add('checkout')
    // Branch administrators cannot delegate global website management.
    if(!Array.isArray(req.body.permissions) || req.body.permissions.some(p=>p==='landing_page'||!allowed.has(p)))
      return res.status(403).json({message:'You cannot grant staff permissions beyond your assigned branch access.'})
    next()
  }
  const ownedPerson=(table,permission,controller)=>[...middle,requirePermission(permission),async(req,res,next)=>{
    const id=Number(req.params.id)
    if(!validId(id))return res.status(400).json({message:'Invalid account.'})
    const [[person]]=await db.query(`SELECT id FROM ${table} WHERE id=? AND branch_id=?`,[id,req.branchId])
    if(!person)return res.status(404).json({message:'Account not found in your branch.'})
    return Promise.resolve(controller(req,res)).catch(next)
  }]
  router.post(`${prefix}/staff`,...middle,requirePermission('accounts'),validateDelegation,(req,res,next)=>Promise.resolve(oldAdmin.createStaff(req,res)).catch(next))
  router.put(`${prefix}/staff/:id`,validateDelegation,...ownedPerson('staff','accounts',oldAdmin.updateStaff))
  router.patch(`${prefix}/staff/:id/toggle`,...ownedPerson('staff','accounts',oldAdmin.toggleStaff))
  router.post(`${prefix}/doctors`,...middle,requirePermission('accounts'),(req,res,next)=>Promise.resolve(oldAdmin.createDoctor(req,res)).catch(next))
  router.put(`${prefix}/doctors/:id`,...ownedPerson('doctors','accounts',oldAdmin.updateDoctor))
  router.patch(`${prefix}/doctors/:id/toggle`,...ownedPerson('doctors','accounts',oldAdmin.toggleDoctor))
  router.put(`${prefix}/doctors/:id/schedules`,...ownedPerson('doctors','doctor_schedules',oldAdmin.saveDaySchedule))
  router.get(`${prefix}/doctors/:id/unavailable-dates`,...ownedPerson('doctors','doctor_schedules',oldAdmin.getDoctorUnavailableDatesAdmin))
  router.get(`${prefix}/doctors/:id/available-slots`,...ownedPerson('doctors','doctor_schedules',oldAdmin.getAppointmentAvailableSlotsAdmin))
  router.put(`${prefix}/doctors/:id/unavailable-dates`,...ownedPerson('doctors','doctor_schedules',oldAdmin.saveDoctorUnavailableDateAdmin))
  router.delete(`${prefix}/doctors/:id/unavailable-dates/:date`,...ownedPerson('doctors','doctor_schedules',oldAdmin.deleteDoctorUnavailableDateAdmin))
  router.get(`${prefix}/appointment-reasons`,...middle,requirePermission('appointments'),async(req,res)=>{
    const [rows]=await db.query(`SELECT id,label,clinic_type,is_active,created_at FROM appointment_reason_options WHERE branch_id=? ORDER BY label`,[req.branchId]);res.json(rows)
  })
  router.get(`${prefix}/appointment-cancellation-reasons`,...middle,requirePermission('appointments'),async(req,res)=>{
    const [rows]=await db.query(`SELECT id,label,is_active,created_at FROM appointment_cancellation_reasons WHERE branch_id=? ORDER BY created_at,id`,[req.branchId]);res.json(rows)
  })

  router.get(`${prefix}/billing/catalog`,...middle,allowAnyPermission('system_setup','appointments','billing'),originalServices)
  router.get(`${prefix}/inventory`,...middle,allowAnyPermission('inventory','billing'),originalInventory)
  router.get(`${prefix}/system-setup/booking-policy`,...middle,requirePermission('system_setup'),getBookingPolicy)
  router.put(`${prefix}/system-setup/booking-policy`,...middle,requirePermission('system_setup'),saveBookingPolicy)
  // Existing appointment transitions retain their original payload and status codes.
  for(const [action,controller] of Object.entries({confirm:oldAdmin.confirmAppointment,cancel:oldAdmin.cancelAppointment,'no-show':oldAdmin.markAppointmentNoShow,reschedule:oldAdmin.rescheduleAppointment})){
   router.patch(`${prefix}/appointments/:appointmentId/${action}`,...middle,...ownedAppointmentAction(controller))
  }
}

// Branch-scoped read handlers preserve the original Admin UI response shapes.
require('./branchOperationalReads').registerBranchOperationalReads(router,{requireSuper,branchContext,requirePermission,allowAnyPermission})
require('./branchReports').registerBranchReports(router,{requireSuper,branchContext,requirePermission})
require('./branchAudit').registerBranchAudit(router,{requireSuper,branchContext,requirePermission})
require('./branchPromotions').registerBranchPromotions(router,{requireSuper,branchContext,requirePermission})

require('./branchSystemWrites').registerBranchSystemWrites(router,{requireSuper,branchContext,requirePermission})

// Always return JSON for unsupported branch operations. Vite must never disguise
// an unimplemented API as an HTML page and a confusing JSON parse failure.
router.all('/my/legacy/*',branchContext,(req,res)=>res.status(501).json({
  code:'BRANCH_OPERATION_NOT_READY',
  message:'This action requires branch-safe transaction integration and is not available yet. No changes were made.'
}))
router.all('/workspace/:branchId/legacy/*',requireSuper,branchContext,(req,res)=>res.status(501).json({
  code:'BRANCH_OPERATION_NOT_READY',
  message:'This action requires branch-safe transaction integration and is not available yet. No changes were made.'
}))

module.exports={router,PERMISSIONS,forbidden}

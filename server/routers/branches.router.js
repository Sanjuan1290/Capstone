const {afterSuccessfulMutation}=require('../utils/clinicEvents')
const {attachBatchesToInventory}=require('../utils/inventoryBatches')
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
const { validateBookingSettings, normalizeBookingSettings, withBookingTestingCapability } = require('../utils/bookingPolicy')
const { provisionBranch } = require('../utils/branchProvisioning')
const router = express.Router()
const PERMISSIONS = ['dashboard','appointments','patient_records','doctor_schedules','billing','inventory','accounts','system_setup','reports','audit_logs']
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
// /me is shared: the Branch Admin layout (admin cookie) and the Super Admin branch
// portal (sends X-Admin-Portal: superadmin) both read it.
const usesBranchAdminCookie = req => req.path.startsWith('/my') || (req.path === '/me' && req.get('x-admin-portal') !== 'superadmin')
router.use((req,res,next) => authenticate.adminContext(!usesBranchAdminCookie(req))(req,res,next))
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
    if(!Number(branch.is_active))return res.status(403).json({code:'BRANCH_INACTIVE',message:'This clinic branch is inactive.'})
    req.branch=branch;req.branchId=branchId;next()
  }catch(e){next(e)}
}
router.get('/', requireSuper, async(req,res)=>{
  const [rows]=await db.query(`SELECT b.*, (SELECT COUNT(*) FROM admins a WHERE a.branch_id=b.id AND a.account_role='admin' AND a.is_active=1) AS admins, (SELECT COUNT(*) FROM doctors d WHERE d.branch_id=b.id AND d.is_active=1) AS doctors, (SELECT COUNT(*) FROM staff s WHERE s.branch_id=b.id AND s.status='active') AS staff FROM clinic_branches b ORDER BY b.created_at ASC,b.id ASC`)
  res.json(rows)
})
router.post('/',requireSuper,async(req,res)=>{
  const name=String(req.body?.name||'').trim(),code=`BR-${randomBytes(8).toString('hex').toUpperCase()}`
  if(!name||name.length>180)return res.status(400).json({message:'Enter a branch name (up to 180 characters).'})
  const rawCopyFrom=req.body?.copy_setup_from_branch_id
  const requestedMode=String(req.body?.setup_mode || (rawCopyFrom ? 'copy' : 'standard'))
  if(!['blank','standard','copy'].includes(requestedMode))return res.status(400).json({code:'INVALID_SETUP_MODE',message:'Select a valid branch setup mode.'})
  const copyFrom=rawCopyFrom==null||String(rawCopyFrom).trim()===''?null:Number(rawCopyFrom)
  if(requestedMode==='copy' && copyFrom===null)return res.status(400).json({code:'SOURCE_BRANCH_REQUIRED',message:'Select a source branch to copy setup.'})
  if(requestedMode!=='copy' && copyFrom!==null)return res.status(400).json({code:'UNEXPECTED_SOURCE_BRANCH',message:'Only Copy Setup can use a source branch.'})
  if(copyFrom!==null){
    if(!validId(copyFrom))return res.status(400).json({message:'Select a valid source branch.'})
    const [[source]]=await db.query('SELECT id FROM clinic_branches WHERE id=? AND is_active=1',[copyFrom])
    if(!source)return res.status(400).json({message:'The source branch must be active.'})
  }
  const conn=await db.getConnection()
  let id
  try {
    await conn.beginTransaction()
    const [result]=await conn.query('INSERT INTO clinic_branches (name,code,address,phone,email,offers_medical,offers_derma,is_active) VALUES (?,?,?,?,?,?,?,?)',[name,code,String(req.body.address||'').slice(0,255)||null,String(req.body.phone||'').slice(0,80)||null,String(req.body.email||'').slice(0,160)||null,req.body.offers_medical===false?0:1,req.body.offers_derma===false?0:1,req.body.is_active===false?0:1])
    id=result.insertId
    await provisionBranch(conn,id,copyFrom,requestedMode)
    await conn.commit()
  }catch(e){await conn.rollback();throw e}finally{conn.release()}
  await audit(req,'branch.created','clinic_branch',id,null,{name,code,setup_mode:requestedMode,copy_setup_from_branch_id:copyFrom},id)
  res.status(201).json({id,name,code,setup_mode:requestedMode})
})

// Independent Superadmin-only state transition: inactive branches must be
// reactivatable even though normal branch operations are intentionally blocked.
// Never pass through branchContext here, because it denies inactive branches.
router.patch('/:branchId/status', requireSuper, async (req, res) => {
  const branchId = Number(req.params.branchId)
  if (!validId(branchId)) return res.status(400).json({code:'INVALID_BRANCH_ID',message:'Select a valid branch.'})
  if (typeof req.body?.is_active !== 'boolean') return res.status(400).json({code:'INVALID_BRANCH_STATUS',message:'Provide is_active as true or false.'})
  const requested = Number(req.body.is_active)
  const connection = await db.getConnection()
  let previous
  let changed = false
  try {
    await connection.beginTransaction()
    const [[branch]] = await connection.query('SELECT id,name,is_active FROM clinic_branches WHERE id=? FOR UPDATE',[branchId])
    if (!branch) {
      await connection.rollback()
      return res.status(404).json({code:'BRANCH_NOT_FOUND',message:'Branch not found.'})
    }
    previous = Number(branch.is_active)
    if (previous !== requested) {
      if (requested === 0) {
        const [[pending]] = await connection.query("SELECT COUNT(*) AS total FROM appointments WHERE branch_id=? AND appointment_date>=CURRENT_DATE() AND status IN ('pending','confirmed','rescheduled','in-progress')",[branchId])
        if (Number(pending?.total || 0) > 0) {
          await connection.rollback()
          return res.status(409).json({code:'BRANCH_HAS_ACTIVE_APPOINTMENTS',message:`This branch has ${pending.total} upcoming or active appointment(s). Resolve or transfer them before deactivation.`})
        }
      }
      await connection.query('UPDATE clinic_branches SET is_active=? WHERE id=?',[requested,branchId])
      changed = true
    }
    await connection.commit()
  } catch (error) {
    try {await connection.rollback()} catch (_) { /* Preserve the original failure. */ }
    throw error
  } finally {
    connection.release()
  }
  if (changed) await audit(req,requested?'branch.reactivated':'branch.deactivated','clinic_branch',branchId,{is_active:previous},{is_active:requested},branchId)
  res.json({id:branchId,is_active:requested,changed,message:requested?'Branch is active.':'Branch is inactive.'})
})

// Independent Superadmin-only state transition: inactive branches must be
// reactivatable even though normal branch operations are intentionally blocked.
// Never pass through branchContext here, because it denies inactive branches.
router.patch('/:branchId/status', requireSuper, async (req, res) => {
  const branchId = Number(req.params.branchId)
  if (!validId(branchId)) return res.status(400).json({code:'INVALID_BRANCH_ID',message:'Select a valid branch.'})
  if (typeof req.body?.is_active !== 'boolean') return res.status(400).json({code:'INVALID_BRANCH_STATUS',message:'Provide is_active as true or false.'})
  const requested = Number(req.body.is_active)
  const connection = await db.getConnection()
  let previous
  let changed = false
  try {
    await connection.beginTransaction()
    const [[branch]] = await connection.query('SELECT id,name,is_active FROM clinic_branches WHERE id=? FOR UPDATE',[branchId])
    if (!branch) {
      await connection.rollback()
      return res.status(404).json({code:'BRANCH_NOT_FOUND',message:'Branch not found.'})
    }
    previous = Number(branch.is_active)
    if (previous !== requested) {
      if (requested === 0) {
        const [[pending]] = await connection.query("SELECT COUNT(*) AS total FROM appointments WHERE branch_id=? AND appointment_date>=CURRENT_DATE() AND status IN ('pending','confirmed','rescheduled','in-progress')",[branchId])
        if (Number(pending?.total || 0) > 0) {
          await connection.rollback()
          return res.status(409).json({code:'BRANCH_HAS_ACTIVE_APPOINTMENTS',message:`This branch has ${pending.total} upcoming or active appointment(s). Resolve or transfer them before deactivation.`})
        }
      }
      await connection.query('UPDATE clinic_branches SET is_active=? WHERE id=?',[requested,branchId])
      changed = true
    }
    await connection.commit()
  } catch (error) {
    try {await connection.rollback()} catch (_) { /* Preserve the original failure. */ }
    throw error
  } finally {
    connection.release()
  }
  if (changed) await audit(req,requested?'branch.reactivated':'branch.deactivated','clinic_branch',branchId,{is_active:previous},{is_active:requested},branchId)
  res.json({id:branchId,is_active:requested,changed,message:requested?'Branch is active.':'Branch is inactive.'})
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
// A branch-admin invitation can fail independently of account creation. Do not
// turn an email transport error into a 500 or roll back a successfully created account.
router.post('/accounts/admins',requireSuper,async(req,res)=>{
  const full_name=String(req.body?.full_name||'').trim()
  const email=String(req.body?.email||'').trim().toLowerCase()
  const phone=String(req.body?.phone||'').trim()
  const branchId=Number(req.body?.branch_id)
  if(!full_name||full_name.length>150||email.length>150||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!validId(branchId)||!/^\+?[0-9 ()-]{7,24}$/.test(phone))
    return res.status(400).json({code:'INVALID_ADMIN_DETAILS',message:'Enter a valid full name, email, contact number and branch.'})
  const permissions=permissionsFromBody(req.body?.permissions)
  const [[branch]]=await db.query('SELECT id FROM clinic_branches WHERE id=? AND is_active=1',[branchId])
  if(!branch)return res.status(400).json({code:'BRANCH_NOT_ACTIVE',message:'The selected branch is not active.'})
  // Friendly early duplicate check, plus unique-index handling for concurrent requests.
  const [[existing]]=await db.query('SELECT id FROM admins WHERE email=? LIMIT 1',[email])
  if(existing)return res.status(409).json({code:'ADMIN_EMAIL_IN_USE',message:'An administrator account already uses this email address. Choose a different email or edit the existing account.'})

  const temporaryPassword=makeTemporaryPassword()
  const password=await bcrypt.hash(temporaryPassword,12)
  const connection=await db.getConnection()
  let id
  try{
    await connection.beginTransaction()
    const [result]=await connection.query("INSERT INTO admins (full_name,email,phone,password,account_role,branch_id,is_active,must_change_password) VALUES (?,?,?,?,'admin',?,1,1)",[full_name,email,phone,password,branchId])
    id=result.insertId
    for(const permission of permissions){
      await connection.query('INSERT INTO admin_branch_permissions (admin_id,permission_key,granted) VALUES (?,?,1)',[id,permission])
    }
    await connection.commit()
  }catch(err){
    await connection.rollback().catch(rollbackError=>console.error('[branches] Admin creation rollback failed:',rollbackError.code||rollbackError.message))
    if(err.code==='ER_DUP_ENTRY')return res.status(409).json({code:'ADMIN_EMAIL_IN_USE',message:'An administrator with this email already exists. Refresh the list before trying again.'})
    if(err.code==='ER_NO_REFERENCED_ROW_2')return res.status(409).json({code:'BRANCH_CHANGED',message:'The selected branch changed while saving. Refresh the branch list and try again.'})
    throw err
  }finally{connection.release()}

  let invitationSent=true
  try{
    await sendTempPassword(email,full_name,'Branch Admin',temporaryPassword,`${process.env.CLIENT_URL||''}/admin/login`)
  }catch(err){
    invitationSent=false
    console.error('[branches] Admin invitation email failed',{adminId:id,code:err.code||'EMAIL_SEND_FAILED'})
  }
  await audit(req,'branch_admin.created','admin',id,null,{full_name,email,phone,permissions,invitationSent},branchId)
  return res.status(201).json({
    id,full_name,email,phone,branch_id:branchId,permissions,invitation_sent:invitationSent,
    message:invitationSent?'Administrator created; invitation email sent.':'Administrator created, but the invitation email was not delivered. Check Resend delivery and arrange secure account recovery.'
  })
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
// Super Admin directory for all operational accounts; role and branch filters are applied server-side.
router.get('/accounts/team', requireSuper, async (req, res) => {
  const role = String(req.query.role || 'all')
  if (!['all', 'staff', 'doctor'].includes(role)) return res.status(400).json({ message: 'Invalid account role.' })
  const branchId = req.query.branch_id == null || req.query.branch_id === '' ? null : Number(req.query.branch_id)
  if (branchId !== null && !validId(branchId)) return res.status(400).json({ message: 'Invalid branch filter.' })
  const branchFilter = branchId === null ? '' : ' WHERE a.branch_id=?'
  const params = branchId === null ? [] : [branchId]
  const results = []
  if (role !== 'doctor') {
    const [rows] = await db.query(`SELECT a.id,a.full_name,a.email,a.phone,a.branch_id,b.name AS branch_name,a.status AS account_status,a.created_at,
      'staff' AS role FROM staff a JOIN clinic_branches b ON b.id=a.branch_id ${branchFilter}
      ORDER BY a.full_name,a.id`, params)
    results.push(...rows)
  }
  if (role !== 'staff') {
    const [rows] = await db.query(`SELECT a.id,a.full_name,a.email,a.phone,a.branch_id,b.name AS branch_name,
      CASE WHEN a.is_active=1 THEN 'active' ELSE 'inactive' END AS account_status,a.created_at,
      'doctor' AS role FROM doctors a JOIN clinic_branches b ON b.id=a.branch_id ${branchFilter}
      ORDER BY a.full_name,a.id`, params)
    results.push(...rows)
  }
  res.json(results)
})

// A move changes access, not historic appointments, consultations, bills or stock.
// All checks, the session revocation, and both-branch audit entries share one transaction.
router.put('/accounts/team/:role/:accountId/branch', requireSuper, async (req, res) => {
  const role = String(req.params.role)
  const table = role === 'staff' ? 'staff' : role === 'doctor' ? 'doctors' : null
  const accountId = Number(req.params.accountId)
  const toBranchId = Number(req.body?.branch_id)
  if (!table || !validId(accountId) || !validId(toBranchId)) return res.status(400).json({ message: 'Choose an account and a valid destination branch.' })
  if (req.body?.confirm !== true) return res.status(400).json({ code: 'CONFIRMATION_REQUIRED', message: 'Confirm this branch transfer before continuing.' })
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[account]] = await conn.query(`SELECT id,full_name,branch_id FROM ${table} WHERE id=? FOR UPDATE`, [accountId])
    if (!account) { await conn.rollback(); return res.status(404).json({ message: 'Account not found.' }) }
    const fromBranchId = Number(account.branch_id)
    if (fromBranchId === toBranchId) { await conn.rollback(); return res.status(400).json({ message: 'This account is already assigned to that branch.' }) }
    const [[branch]] = await conn.query('SELECT id,name FROM clinic_branches WHERE id=? AND is_active=1 FOR UPDATE', [toBranchId])
    if (!branch) { await conn.rollback(); return res.status(404).json({ message: 'Destination branch is unavailable.' }) }
    if (role === 'doctor') {
      const [[future]] = await conn.query(`SELECT COUNT(*) AS n FROM appointments
        WHERE doctor_id=? AND appointment_date>=CURDATE()
          AND status IN ('pending','confirmed','rescheduled','in-progress')`, [accountId])
      if (Number(future.n)) { await conn.rollback(); return res.status(409).json({ code: 'FUTURE_APPOINTMENTS', message: 'This doctor has active/upcoming appointments. Resolve them before moving the account.' }) }
    } else {
      const [[cashier]] = await conn.query(`SELECT COUNT(*) AS n FROM cashier_closings
        WHERE staff_id=? AND branch_id=? AND (is_locked=0 OR status='reopened')`, [accountId, fromBranchId])
      if (Number(cashier.n)) { await conn.rollback(); return res.status(409).json({ code: 'OPEN_CASHIER', message: 'Close the staff member’s open cashier shift before moving the account.' }) }
    }
    await conn.query(`UPDATE ${table} SET branch_id=?,session_version=COALESCE(session_version,1)+1 WHERE id=? AND branch_id=?`, [toBranchId, accountId, fromBranchId])
    const change = { account_role:role, account_id:accountId, from_branch_id:fromBranchId, to_branch_id:toBranchId }
    // Both branches retain independent audit evidence of the move.
    for (const branchId of [fromBranchId,toBranchId]) {
      await writeAuditLog({ userId:req.user.id,userRole:'superadmin',action:'account.branch_moved',entityType:role,entityId:accountId,
        oldValues:{branch_id:fromBranchId},newValues:change,branchId,ipAddress:req.ip||null }, conn)
    }
    await conn.commit()
    res.json({ message:'Account moved to the new branch. Existing sessions have been revoked.', ...change, destination_branch_name:branch.name })
  } catch (error) {
    await conn.rollback().catch(()=>{})
    throw error
  } finally { conn.release() }
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
 const [[p]]=await db.query('SELECT * FROM branch_booking_settings WHERE branch_id=?',[req.branchId]);res.json(withBookingTestingCapability({...p,branch_id:req.branchId,...normalizeBookingSettings(p||{},req.branchId),no_show_grace_minutes:p?.no_show_grace_minutes??15},req.branchId))
}
const saveBookingPolicy = async(req,res)=>{
 const input=validateBookingSettings(req.body,req.branchId)
 const grace=Number(req.body.no_show_grace_minutes??15)
 if(!Number.isInteger(grace)||grace<0||grace>240||grace%5!==0)return res.status(400).json({message:'No-show grace must be 0 to 240 minutes in 5-minute increments.'})
 await db.query(`INSERT INTO branch_booking_settings (branch_id,online_min_lead_minutes,pending_confirmation_cutoff_minutes,booking_start_interval_minutes,no_show_grace_minutes,updated_by_admin_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE online_min_lead_minutes=VALUES(online_min_lead_minutes),pending_confirmation_cutoff_minutes=VALUES(pending_confirmation_cutoff_minutes),booking_start_interval_minutes=30,no_show_grace_minutes=VALUES(no_show_grace_minutes),updated_by_admin_id=VALUES(updated_by_admin_id)`,[req.branchId,input.online_min_lead_minutes,input.pending_confirmation_cutoff_minutes,30,grace,req.user.id]);
 await audit(req,'booking_policy.updated','branch_booking_policy',req.branchId,null,{...input,no_show_grace_minutes:grace},req.branchId);await getBookingPolicy(req,res)
}
const reminderEndpoints=require('./appointmentReminderRoutes')
const installBranchEndpoints = (prefix, context) => {
 router.get(`${prefix}/dashboard`,context,requirePermission('dashboard'),branchDashboard)
 for(const [resource,permission] of Object.entries({appointments:'appointments',inventory:'inventory',services:'system_setup',doctors:'doctor_schedules',staff:'accounts',patients:'patient_records',billing:'billing',audits:'audit_logs'})) router.get(`${prefix}/${resource}`,context,...listResource(resource,permission))
 router.get(`${prefix}/reminder-settings`,context,requirePermission('system_setup'),reminderEndpoints.ensureBranch,reminderEndpoints.get)
 router.put(`${prefix}/reminder-settings`,context,requirePermission('system_setup'),reminderEndpoints.ensureBranch,reminderEndpoints.put)
 router.post(`${prefix}/appointments/:id/remind`,context,requirePermission('appointments'),reminderEndpoints.ensureBranch,reminderEndpoints.manual)
 router.get(`${prefix}/booking-policy`,context,requirePermission('system_setup'),getBookingPolicy)
 router.put(`${prefix}/booking-policy`,context,requirePermission('system_setup'),saveBookingPolicy)
}
installBranchEndpoints('/my',branchContext)
// Actual Super Admin branch-scoped endpoints with a branch lookup.
for (const [resource,permission] of Object.entries({dashboard:'dashboard',appointments:'appointments',inventory:'inventory',services:'system_setup',doctors:'doctor_schedules',staff:'accounts',patients:'patient_records',billing:'billing',audits:'audit_logs'})) {
 const handler=resource==='dashboard'?branchDashboard:listResource(resource,permission).at(-1)
 router.get(`/workspace/:branchId/${resource}`,requireSuper,branchContext,requirePermission(permission),handler)
}
router.get('/workspace/:branchId/booking-policy',requireSuper,branchContext,requirePermission('system_setup'),getBookingPolicy)
router.put('/workspace/:branchId/booking-policy',requireSuper,branchContext,requirePermission('system_setup'),saveBookingPolicy)


const serviceBody = async (req,res,branchId,unchangedLegacyMinutes=null) => {
 const name=String(req.body?.service_name||'').trim(),type=String(req.body?.clinic_type||''),price=Number(req.body?.default_price),duration=Number(req.body?.average_duration_minutes||60),categoryId=Number(req.body?.category_id||0)
 if(!name||name.length>180||!['medical','derma'].includes(type)||!Number.isFinite(price)||price<0||price>10000000||!Number.isInteger(duration)||(duration<30||duration>480||duration%30!==0) && !(duration===Number(unchangedLegacyMinutes)&&duration>=15&&duration<=480&&duration%15===0)){res.status(400).json({message:'Enter a valid service name, clinic type, price and appointment length (30-minute steps, up to 8 hours).'});return null}
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
 const v=await serviceBody({body:{...old,...req.body}},res,req.branchId,old.average_duration_minutes);if(!v)return
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
  const { loadBranchDashboard } = require('../utils/branchDashboard')
  const { getOnlineBookingReadiness } = require('../utils/bookingReadiness')
  const payload = await loadBranchDashboard({
    db,
    branchId: req.branchId,
    getBookingReadiness: getOnlineBookingReadiness,
    onSectionError: (section, error) => {
      // Server-side diagnostics only; no database SQL or sensitive information goes to the browser.
      console.error('[branch-dashboard-section]', {
        branchId: req.branchId,
        section,
        code: error?.code,
        sqlState: error?.sqlState,
        message: error?.message,
      })
    },
  })
  // A partial response keeps correct data visible while explicitly labelling failures.
  // If ALL sections fail, communicate a service error instead of false success.
  if (Object.keys(payload.sectionErrors || {}).length === 5) {
    return res.status(503).json({ code: 'BRANCH_DASHBOARD_UNAVAILABLE', message: 'Branch dashboard data is temporarily unavailable. Please try again.' })
  }
  res.json(payload)
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
  const [rows]=await db.query(`SELECT * FROM doctor_schedules WHERE doctor_id=? ORDER BY FIELD(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')`,[doctorId]);res.json(rows)
}
const originalServices=async(req,res)=>{
  const clinicType=String(req.query.clinic_type||'').trim()
  if(clinicType && !['medical','derma'].includes(clinicType))return res.status(400).json({message:'Invalid clinic type.'})
  // Booking queries must not leak inactive or other-clinic services.
  // Setup screens without clinic_type retain their full authorized catalog.
  const filter=clinicType ? " AND is_active=1 AND clinic_type IN (?,'all')" : ''
  const params=clinicType ? [req.branchId,clinicType] : [req.branchId]
  const [rows]=await db.query(`SELECT * FROM billing_service_catalog WHERE branch_id=?${filter} ORDER BY created_at,id LIMIT 500`,params)
  res.json(rows)
}
const originalInventory=async(req,res)=>{
  // The shared Inventory UI requires item.batches[].locations for Stock Out,
  // Move Stock, and Manage Batches. Do not return bare inventory rows.
  // Keep the authorized branch predicate and do not mutate stock during reads.
  const [rows]=await db.query(
    'SELECT * FROM inventory WHERE branch_id=? AND archived_at IS NULL ORDER BY name LIMIT 500',
    [req.branchId]
  )
  res.json(await attachBatchesToInventory(rows,db))
}
for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  router.get(`${prefix}/dashboard`,...middle,requirePermission('dashboard'),originalDashboard)
  router.get(`${prefix}/appointments`,...middle,requirePermission('appointments'),originalAppointments)
  router.get(`${prefix}/patients`,...middle,allowAnyPermission('patient_records','appointments'),originalPatients)
  router.get(`${prefix}/patients/:id`,...middle,requirePermission('patient_records'),originalPatientDetails)
  router.get(`${prefix}/walk-in/doctors`,...middle,requirePermission('appointments'),async(req,res,next)=>{
    try{
      const {buildWalkInDoctorAvailability}=require('../utils/doctorAvailabilitySummary')
      res.json(await buildWalkInDoctorAvailability({clinicType:String(req.query.clinic_type||''),branchId:req.branchId}))
    }catch(error){next(error)}
  })
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
  router.post(`${prefix}/staff`,...middle,requirePermission('accounts'),validateDelegation,afterSuccessfulMutation('accounts.updated'),(req,res,next)=>Promise.resolve(oldAdmin.createStaff(req,res)).catch(next))
  router.put(`${prefix}/staff/:id`,validateDelegation,afterSuccessfulMutation('accounts.updated'),...ownedPerson('staff','accounts',oldAdmin.updateStaff))
  router.patch(`${prefix}/staff/:id/toggle`,...ownedPerson('staff','accounts',oldAdmin.toggleStaff))
  router.post(`${prefix}/doctors`,...middle,requirePermission('accounts'),afterSuccessfulMutation('accounts.updated'),(req,res,next)=>Promise.resolve(oldAdmin.createDoctor(req,res)).catch(next))
  router.put(`${prefix}/doctors/:id`,afterSuccessfulMutation('accounts.updated'),...ownedPerson('doctors','accounts',oldAdmin.updateDoctor))
  router.patch(`${prefix}/doctors/:id/toggle`,afterSuccessfulMutation('accounts.updated'),...ownedPerson('doctors','accounts',oldAdmin.toggleDoctor))
  router.put(`${prefix}/doctors/:id/schedules`,afterSuccessfulMutation('schedule.updated'),...ownedPerson('doctors','doctor_schedules',oldAdmin.saveDaySchedule))
  router.get(`${prefix}/doctors/:id/unavailable-dates`,...ownedPerson('doctors','doctor_schedules',oldAdmin.getDoctorUnavailableDatesAdmin))
  router.get(`${prefix}/doctors/:id/available-slots`,...middle,allowAnyPermission('appointments','doctor_schedules'),async(req,res,next)=>{
    const id=Number(req.params.id)
    if(!validId(id))return res.status(400).json({message:'Invalid doctor.'})
    try{
      const [[doctor]]=await db.query('SELECT id FROM doctors WHERE id=? AND branch_id=?',[id,req.branchId])
      if(!doctor)return res.status(404).json({message:'Doctor not found in this branch.'})
      return await oldAdmin.getAppointmentAvailableSlotsAdmin(req,res)
    }catch(error){next(error)}
  })
  router.put(`${prefix}/doctors/:id/unavailable-dates`,afterSuccessfulMutation('schedule.updated'),...ownedPerson('doctors','doctor_schedules',oldAdmin.saveDoctorUnavailableDateAdmin))
  router.delete(`${prefix}/doctors/:id/unavailable-dates/:date`,afterSuccessfulMutation('schedule.updated'),...ownedPerson('doctors','doctor_schedules',oldAdmin.deleteDoctorUnavailableDateAdmin))
  router.get(`${prefix}/appointment-reasons`,...middle,requirePermission('appointments'),async(req,res)=>{
    const [rows]=await db.query(`SELECT id,label,clinic_type,is_active,created_at FROM appointment_reason_options WHERE branch_id=? ORDER BY label`,[req.branchId]);res.json(rows)
  })
  router.get(`${prefix}/appointment-cancellation-reasons`,...middle,requirePermission('appointments'),async(req,res)=>{
    const [rows]=await db.query(`SELECT id,label,is_active,created_at FROM appointment_cancellation_reasons WHERE branch_id=? ORDER BY created_at,id`,[req.branchId]);res.json(rows)
  })

  router.get(`${prefix}/billing/catalog`,...middle,allowAnyPermission('system_setup','appointments','billing'),originalServices)
  router.get(`${prefix}/inventory`,...middle,allowAnyPermission('inventory','billing'),originalInventory)
  router.get(`${prefix}/reminder-settings`,...middle,requirePermission('system_setup'),reminderEndpoints.ensureBranch,reminderEndpoints.get)
  router.put(`${prefix}/reminder-settings`,...middle,requirePermission('system_setup'),reminderEndpoints.ensureBranch,reminderEndpoints.put)
  router.post(`${prefix}/appointments/:id/remind`,...middle,requirePermission('appointments'),reminderEndpoints.ensureBranch,reminderEndpoints.manual)
  router.get(`${prefix}/system-setup/booking-policy`,...middle,requirePermission('system_setup'),getBookingPolicy)
  router.put(`${prefix}/system-setup/booking-policy`,...middle,requirePermission('system_setup'),afterSuccessfulMutation('settings.updated'),saveBookingPolicy)
  // Existing appointment transitions retain their original payload and status codes.
  for(const [action,controller] of Object.entries({confirm:oldAdmin.confirmAppointment,cancel:oldAdmin.cancelAppointment,'no-show':oldAdmin.markAppointmentNoShow,reschedule:oldAdmin.rescheduleAppointment})){
   router.patch(`${prefix}/appointments/:appointmentId/${action}`,...middle,...ownedAppointmentAction(controller))
  }
}

require('./branchAllInventory').registerAllInventory(router,requireSuper)

// Branch-scoped read handlers preserve the original Admin UI response shapes.
require('./branchOperationalReads').registerBranchOperationalReads(router,{requireSuper,branchContext,requirePermission,allowAnyPermission})
require('./branchReports').registerBranchReports(router,{requireSuper,branchContext,requirePermission})
require('./branchAudit').registerBranchAudit(router,{requireSuper,branchContext,requirePermission})
require('./branchPromotions').registerBranchPromotions(router,{requireSuper,branchContext,requirePermission})
require('./branchAnnouncements').registerBranchAnnouncements(router,{requireSuper,branchContext,requirePermission})

require('./branchSystemWrites').registerBranchSystemWrites(router,{requireSuper,branchContext,requirePermission})
require('./branchSystemWrites').registerBranchExtraSetup(router,{requireSuper,branchContext,requirePermission})
require('./branchQueueInventoryWrites').registerBranchQueueInventoryWrites(router,{requireSuper,branchContext,requirePermission})
require('./branchQueueInventoryWrites').registerBranchMoveStock(router,{requireSuper,branchContext,requirePermission})
require('./branchInventoryItems').registerBranchInventoryItems(router,{requireSuper,branchContext,requirePermission})
// New additive location-ledger API remains fail-closed until full cutover approval.
require('./branchLocationStock').registerBranchLocationStock(router,{requireSuper,branchContext,requirePermission})
require('./branchCatalogWrites').registerBranchCatalogWrites(router,{requireSuper,branchContext,requirePermission})
require('./branchAppointmentWrites').registerBranchAppointmentWrites(router,{requireSuper,branchContext,requirePermission})
require('./branchBillPreviewReads').registerBranchBillPreviewReads(router,{requireSuper,branchContext,requirePermission})
require('./branchGlobalReferenceWrites').registerBranchGlobalReferenceWrites(router,{requireSuper,branchContext,requirePermission})
require('./branchPaymentSettingsWrites').registerBranchPaymentSettingsWrites(router,{requireSuper,branchContext,requirePermission})
require('./branchSensitiveWrites').registerBranchSensitiveWrites(router,{requireSuper,branchContext,requirePermission})
require('./branchPaymentActions').registerBranchPaymentActions(router,{requireSuper,branchContext,requirePermission})
require('./branchCheckoutDraftWrites').registerBranchCheckoutDraftWrites(router,{requireSuper,branchContext,requirePermission})
require('./branchBillCorrections').registerBranchBillCorrections(router,{requireSuper,branchContext,requirePermission})
require('./branchBatchActions').registerBranchBatchActions(router,{requireSuper,branchContext,requirePermission})
require('./branchCashierAndPayment').registerBranchCashierAndPayment(router,{requireSuper,branchContext,requirePermission})
for (const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]) {
  router.use(`${prefix}/billing`,...middle,requirePermission('billing'),require('./paymongoGateway').apiRouter)
}

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



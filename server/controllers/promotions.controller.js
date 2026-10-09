// Service-targeted patient-facing promotions. These do not change billing totals.
const db = require('../db/connect')
const { writeAuditLog } = require('../utils/audit')
const { createNotification } = require('../utils/notifications')

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value

const grouped = (promotions, linked) => promotions.map(promo => ({
  ...promo,
  is_active: Boolean(promo.is_active),
  show_on_dashboard: Boolean(promo.show_on_dashboard),
  service_ids: linked.filter(row => row.promotion_id === promo.id).map(row => Number(row.service_id)),
}))

const listAllPromotions = async (req, res) => {
  const [promotions] = await db.query("SELECT id, title, description, badge_text, DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on, DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on, is_active, show_on_dashboard, created_at FROM clinic_promotions ORDER BY created_at DESC, id DESC")
  const [linked] = await db.query('SELECT promotion_id, service_id FROM clinic_promotion_services')
  res.json(grouped(promotions, linked))
}

const getActivePromotions = async (req, res) => {
  const requestedBranch=req.query.branch_id?Number(req.query.branch_id):null
  if(requestedBranch!==null&&(!Number.isSafeInteger(requestedBranch)||requestedBranch<1))return res.status(400).json({message:'Select a valid branch.'})
  const [rows] = await db.query(`
    SELECT p.id,p.title,p.description,p.badge_text,p.branch_id,cb.name AS branch_name,
           DATE_FORMAT(p.starts_on,'%Y-%m-%d') AS starts_on,
           DATE_FORMAT(p.ends_on,'%Y-%m-%d') AS ends_on,
           p.show_on_dashboard,ps.service_id
    FROM clinic_promotions p
    INNER JOIN clinic_branches cb ON cb.id=p.branch_id AND cb.is_active=1
    INNER JOIN clinic_promotion_services ps ON ps.promotion_id = p.id
    INNER JOIN billing_service_catalog svc ON svc.id=ps.service_id AND svc.branch_id=p.branch_id AND svc.is_active=1
    WHERE p.is_active=1 AND p.starts_on<=CURDATE() AND p.ends_on>=CURDATE()
      AND (? IS NULL OR p.branch_id=?)
    ORDER BY p.ends_on ASC,p.id DESC`,[requestedBranch,requestedBranch])
  const promos = new Map()
  for (const row of rows) {
    if (!promos.has(row.id)) promos.set(row.id, {
      id: row.id, title: row.title, description: row.description, badge_text: row.badge_text,branch_id:row.branch_id,branch_name:row.branch_name,
      starts_on: row.starts_on, ends_on: row.ends_on, show_on_dashboard: Boolean(row.show_on_dashboard),
      service_ids: [],
    })
    promos.get(row.id).service_ids.push(Number(row.service_id))
  }
  // Anyone logged into the patient portal sees on-site offers. Consent controls
  // marketing delivery, not on-site service information.
  res.json([...promos.values()])
}

const validate = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Invalid promotion.'), {status: 400})
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const badge_text = typeof body.badge_text === 'string' ? body.badge_text.trim() : ''
  if (!title || title.length > 120) throw Object.assign(new Error('Title is required (up to 120 characters).'), {status: 400})
  if (!description || description.length > 1000) throw Object.assign(new Error('Description is required (up to 1000 characters).'), {status: 400})
  if (badge_text.length > 48) throw Object.assign(new Error('Badge may be up to 48 characters.'), {status: 400})
  const starts_on = body.starts_on
  const ends_on = body.ends_on
  if (!isDate(starts_on) || !isDate(ends_on) || starts_on > ends_on) throw Object.assign(new Error('Enter a valid start and end date.'), {status: 400})
  const ids = body.service_ids
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) throw Object.assign(new Error('Select at least one valid service.'), {status: 400})
  const service_ids = [...new Set(ids.map(Number))]
  return { title, description, badge_text: badge_text || null, starts_on, ends_on,
    is_active: body.is_active === true || body.is_active === 1,
    show_on_dashboard: body.show_on_dashboard !== false && body.show_on_dashboard !== 0,
    service_ids }
}

const savePromotion = async (req, res) => {
  let input
  try { input = validate(req.body) } catch (err) { return res.status(err.status || 400).json({message:err.message}) }
  const id = req.params.id ? Number(req.params.id) : null
  if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) return res.status(400).json({message:'Invalid promotion ID.'})
  const conn = await db.getConnection()
  let savedId = id
  try {
    await conn.beginTransaction()
    const marks = input.service_ids.map(() => '?').join(',')
    const [services] = await conn.query(`SELECT id FROM billing_service_catalog WHERE id IN (${marks})`, input.service_ids)
    if (services.length !== input.service_ids.length) {
      await conn.rollback()
      return res.status(400).json({message:'One or more selected services no longer exist.'})
    }
    if (id) {
      const [[found]] = await conn.query('SELECT id FROM clinic_promotions WHERE id = ? FOR UPDATE', [id])
      if (!found) { await conn.rollback(); return res.status(404).json({message:'Promotion not found.'}) }
      await conn.query(`UPDATE clinic_promotions SET title=?, description=?, badge_text=?, starts_on=?, ends_on=?, is_active=?, show_on_dashboard=? WHERE id=?`,
        [input.title,input.description,input.badge_text,input.starts_on,input.ends_on,Number(input.is_active),Number(input.show_on_dashboard),id])
      await conn.query('DELETE FROM clinic_promotion_services WHERE promotion_id=?',[id])
    } else {
      const [result] = await conn.query(`INSERT INTO clinic_promotions (title,description,badge_text,starts_on,ends_on,is_active,show_on_dashboard,created_by_admin_id) VALUES (?,?,?,?,?,?,?,?)`,
        [input.title,input.description,input.badge_text,input.starts_on,input.ends_on,Number(input.is_active),Number(input.show_on_dashboard),req.user.id])
      savedId = result.insertId
    }
    for (const serviceId of input.service_ids) await conn.query('INSERT INTO clinic_promotion_services (promotion_id,service_id) VALUES (?,?)', [savedId, serviceId])
    await writeAuditLog({userId:req.user.id,userRole:'admin',action:id?'promotion.updated':'promotion.created',entityType:'promotion',entityId:savedId,newValues:{...input},ipAddress:req.ip||null}, conn)
    await conn.commit()
    res.json({message:id?'Promotion updated.':'Promotion created.',id:savedId})
  } catch (err) {
    await conn.rollback().catch(()=>{})
    throw err
  } finally { conn.release() }
}

const deletePromotion = async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({message:'Invalid promotion ID.'})
  const conn=await db.getConnection()
  try {
    await conn.beginTransaction()
    const [result]=await conn.query('DELETE FROM clinic_promotions WHERE id=?',[id])
    if (!result.affectedRows) { await conn.rollback(); return res.status(404).json({message:'Promotion not found.'}) }
    await writeAuditLog({userId:req.user.id,userRole:'admin',action:'promotion.deleted',entityType:'promotion',entityId:id,ipAddress:req.ip||null},conn)
    await conn.commit()
    res.json({message:'Promotion removed.'})
  } catch (err) { await conn.rollback().catch(()=>{}); throw err } finally { conn.release() }
}

// Explicit opt-in broadcast: never send to patients who declined marketing.
// Unique (promotion_id,patient_id) enforces at-most-once delivery per promotion.
const notifyOptedInPatients = async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid promotion ID.' })
  const [[promo]] = await db.query(`
    SELECT id, title, description, badge_text FROM clinic_promotions
    WHERE id = ? AND is_active = 1 AND starts_on <= CURDATE() AND ends_on >= CURDATE() LIMIT 1`, [id])
  if (!promo) return res.status(409).json({ message: 'Only active, currently valid promotions can send notifications.' })
  const [patients] = await db.query(`
    SELECT p.id FROM patients p
    WHERE p.receive_promotions = 1 AND COALESCE(p.is_walk_in,0) = 0 AND p.phone_verified_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM clinic_promotion_notifications n WHERE n.promotion_id = ? AND n.patient_id = p.id)
    ORDER BY p.id LIMIT 500`, [id])
  let delivered = 0
  let failed = 0
  for (const patient of patients) {
    const [reservation] = await db.query('INSERT IGNORE INTO clinic_promotion_notifications (promotion_id, patient_id) VALUES (?, ?)', [id, patient.id])
    if (!reservation.affectedRows) continue
    try {
      await createNotification({
        target_role: 'patient', target_user_id: patient.id, type: 'clinic_promotion',
        title: promo.title, message: promo.description,
        reference_type: 'promotion', reference_id: id, link: '/patient/book',
      })
      await db.query('UPDATE clinic_promotion_notifications SET notified_at = NOW() WHERE promotion_id = ? AND patient_id = ?', [id, patient.id])
      delivered += 1
    } catch (err) {
      await db.query('DELETE FROM clinic_promotion_notifications WHERE promotion_id = ? AND patient_id = ? AND notified_at IS NULL', [id, patient.id]).catch(()=>{})
      failed += 1
    }
  }
  await writeAuditLog({userId:req.user.id,userRole:'admin',action:'promotion.notifications_sent',entityType:'promotion',entityId:id,newValues:{delivered,failed},ipAddress:req.ip||null}).catch(()=>{})
  res.json({message:`${delivered} promotional notification(s) delivered to opted-in patients.`, delivered, failed, more_possible:patients.length>=500})
}

module.exports = { listAllPromotions, getActivePromotions, savePromotion, deletePromotion, notifyOptedInPatients }


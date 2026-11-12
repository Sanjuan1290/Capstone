'use strict'

// In-app notices only. No SMS or email is sent by this worker.
// Delivery is recorded in the same transaction as its notification, so a
// restarted worker cannot create the same patient notice twice.
const db = require('../db/connect')
const { broadcast } = require('./sse')
const CLINIC_NOW = "CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+08:00')"
const CLINIC_TODAY = `DATE(${CLINIC_NOW})`
const BATCH_SIZE = 100
let running = false
let timer = null

const queuePublication = async ({ kind, entityId, branchId, executor = db }) => {
  if (!['promotion', 'announcement'].includes(kind) || !Number.isSafeInteger(Number(entityId)) || Number(entityId) < 1 || !Number.isSafeInteger(Number(branchId)) || Number(branchId) < 1) {
    throw new Error('Invalid in-app publication notification')
  }
  // A published item is announced once. Hiding/unhiding, saving edits, or a
  // scheduled worker retry does not create another delivery event.
  await executor.query(`INSERT IGNORE INTO clinic_publication_notification_jobs (kind, entity_id, branch_id) VALUES (?,?,?)`, [kind, entityId, branchId])
}

const eligibleJobsSql = `
 SELECT j.id,j.kind,j.entity_id,j.branch_id
 FROM clinic_publication_notification_jobs j
 INNER JOIN clinic_branches b ON b.id=j.branch_id AND b.is_active=1
 LEFT JOIN clinic_promotions p ON j.kind='promotion' AND p.id=j.entity_id AND p.branch_id=j.branch_id
 LEFT JOIN clinic_announcements a ON j.kind='announcement' AND a.id=j.entity_id AND a.branch_id=j.branch_id
 WHERE (j.status='pending' OR (j.status='sending' AND j.claimed_at<DATE_SUB(NOW(),INTERVAL 10 MINUTE)))
   AND (
    (j.kind='promotion' AND p.is_active=1 AND p.starts_on<=${CLINIC_TODAY} AND p.ends_on>=${CLINIC_TODAY})
    OR (j.kind='announcement' AND a.type='promotion' AND a.promotion_id IS NULL
      AND a.status IN ('published','scheduled')
      AND (a.publish_at IS NULL OR a.publish_at<=${CLINIC_NOW})
      AND (a.expires_at IS NULL OR a.expires_at>${CLINIC_NOW}))
   )
 ORDER BY j.id LIMIT 5`

const claimJob = async job => {
  const [updated] = await db.query(`UPDATE clinic_publication_notification_jobs SET status='sending',claimed_at=NOW()
    WHERE id=? AND (status='pending' OR (status='sending' AND claimed_at<DATE_SUB(NOW(),INTERVAL 10 MINUTE)))`, [job.id])
  return Boolean(updated.affectedRows)
}

const deliver = async (job, patient, content) => {
  const conn = await db.getConnection()
  const ledger = job.kind === 'promotion' ? 'clinic_promotion_notifications' : 'clinic_announcement_notifications'
  const idColumn = job.kind === 'promotion' ? 'promotion_id' : 'announcement_id'
  let record
  try {
    await conn.beginTransaction()
    const [reserved] = await conn.query(`INSERT IGNORE INTO ${ledger} (${idColumn},patient_id) VALUES (?,?)`, [job.entity_id, patient.id])
    if (!reserved.affectedRows) { await conn.rollback(); return false }
    const [created] = await conn.query(`INSERT INTO notifications
      (target_role,target_user_id,type,title,message,reference_type,reference_id,body,link,branch_id)
      VALUES ('patient',?,?,?,?,?,?,?,?,?)`,
      [patient.id,job.kind==='promotion'?'clinic_promotion':'clinic_announcement',content.title,content.description,
        job.kind==='promotion'?'promotion':'announcement',job.entity_id,null,content.link,job.branch_id])
    await conn.query(`UPDATE ${ledger} SET notified_at=NOW() WHERE ${idColumn}=? AND patient_id=?`,[job.entity_id,patient.id])
    await conn.commit()
    record = {id:created.insertId,target_role:'patient',target_user_id:patient.id,type:job.kind==='promotion'?'clinic_promotion':'clinic_announcement',
      title:content.title,message:content.description,reference_type:job.kind==='promotion'?'promotion':'announcement',reference_id:job.entity_id,link:content.link,branch_id:job.branch_id}
  } catch (error) { await conn.rollback().catch(()=>{}); throw error }
  finally { conn.release() }
  broadcast([`patient_${patient.id}`], 'notification_created', record, { branchId: job.branch_id })
  return true
}

const processJob = async job => {
  if (!await claimJob(job)) return
  try {
    const table=job.kind==='promotion'?'clinic_promotions':'clinic_announcements'
    const [[item]]=await db.query(`SELECT title,${job.kind==='promotion'?'description,eligibility_type':'caption AS description'},${job.kind==='promotion'?'id':'slug'} FROM ${table} WHERE id=? AND branch_id=?`,[job.entity_id,job.branch_id])
    if(!item) {await db.query("UPDATE clinic_publication_notification_jobs SET status='completed',completed_at=NOW() WHERE id=?",[job.id]);return}
    const ledger=job.kind==='promotion'?'clinic_promotion_notifications':'clinic_announcement_notifications'
    const foreign=job.kind==='promotion'?'promotion_id':'announcement_id'
    const [patients]=await db.query(`SELECT p.id FROM patients p WHERE p.receive_promotions=1 AND COALESCE(p.is_walk_in,0)=0
      AND EXISTS(SELECT 1 FROM appointments ap WHERE ap.patient_id=p.id AND ap.branch_id=?)
      AND (?='announcement' OR ?='all' OR (p.email_verified_at IS NOT NULL AND p.phone_verified_at IS NOT NULL
        AND p.password IS NOT NULL AND p.password<>''))
      AND NOT EXISTS(SELECT 1 FROM ${ledger} d WHERE d.${foreign}=? AND d.patient_id=p.id)
      ORDER BY p.id LIMIT ?`,[job.branch_id,job.kind,job.kind==='promotion' ? (item.eligibility_type||'all') : 'all',job.entity_id,BATCH_SIZE])
    const content={title:item.title,description:item.description,
      link:job.kind==='promotion'?`/patient/book?branch_id=${job.branch_id}&promotion_id=${job.entity_id}`:`/news/${job.branch_id}/${encodeURIComponent(item.slug)}`}
    let failed=0
    for(const patient of patients){try{await deliver(job,patient,content)}catch(err){failed++;console.error('[publication-notifications] recipient failed',{job_id:job.id,patient_id:patient.id,message:err.message})}}
    // Continue in the next pass if the batch was full, or retry a failed
    // recipient. All successful recipients remain idempotently recorded.
    if(patients.length===BATCH_SIZE || failed){
      await db.query("UPDATE clinic_publication_notification_jobs SET status='pending',claimed_at=NULL WHERE id=?",[job.id])
    } else {
      await db.query("UPDATE clinic_publication_notification_jobs SET status='completed',claimed_at=NULL,completed_at=NOW() WHERE id=?",[job.id])
    }
  }catch(error){
    await db.query("UPDATE clinic_publication_notification_jobs SET status='pending',claimed_at=NULL WHERE id=?",[job.id]).catch(()=>{})
    console.error('[publication-notifications] job failed',{job_id:job.id,message:error.message})
  }
}

const runPublicationNotifications = async () => {
  if(running)return
  running=true
  try {const [jobs]=await db.query(eligibleJobsSql);for(const job of jobs)await processJob(job)}
  finally {running=false}
}

const startPublicationNotificationWorker = async () => {
  if(timer)return
  // A reviewed migration is required when automatic schema migration is off.
  await db.query('SELECT id FROM clinic_publication_notification_jobs LIMIT 1')
  timer=setInterval(()=>{void runPublicationNotifications().catch(error=>console.error('[publication-notifications]',error.message))},60000)
  timer.unref?.()
  void runPublicationNotifications().catch(error=>console.error('[publication-notifications]',error.message))
}

module.exports={queuePublication,runPublicationNotifications,startPublicationNotificationWorker,eligibleJobsSql}


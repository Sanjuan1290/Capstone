// Marketing channel is independent of clinical/billing transaction emails.
const crypto = require('node:crypto')
const db = require('../db/connect')
const { sendResendEmail } = require('./resendEmail')
const { getClinicDateTimeSql } = require('./date')
const setting = (name, fallback, min, max) => {
  const number = Number(process.env[name])
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback
}
const configured = () => Boolean(process.env.RESEND_API_KEY && process.env.MARKETING_FROM_EMAIL && process.env.MARKETING_UNSUBSCRIBE_SECRET?.length >= 24 && process.env.CLIENT_URL && /^https?:\/\//.test(process.env.CLIENT_URL))
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c])
const tokenFor = patientId => {
  const secret = process.env.MARKETING_UNSUBSCRIBE_SECRET
  if (!secret || secret.length < 24) throw new Error('Marketing unsubscribe signing secret not configured.')
  const id = Number(patientId)
  const signature = crypto.createHmac('sha256', secret).update(`carait-marketing-v1:${id}`).digest('hex')
  return `${id}.${signature}`
}
const patientFromToken = token => {
  const match = /^(\d{1,12})\.([a-f0-9]{64})$/.exec(String(token || ''))
  if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) <= 0) return null
  let expected
  try { expected = tokenFor(Number(match[1])).split('.')[1] } catch { return null }
  if (!crypto.timingSafeEqual(Buffer.from(expected,'hex'), Buffer.from(match[2],'hex'))) return null
  return Number(match[1])
}
const eligibleSql = `FROM patients p
 WHERE p.receive_promotions=1 AND COALESCE(p.is_walk_in,0)=0
 AND p.email_verified_at IS NOT NULL AND p.email IS NOT NULL AND p.email <> ''
 AND NOT EXISTS (SELECT 1 FROM marketing_unsubscribes u WHERE u.patient_id=p.id)
 AND EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id=p.id AND a.branch_id=?)`
const sendMarketingEmail = async ({ patient, campaign, announcement }) => {
  if (!configured()) throw new Error('Bulk email provider disabled.')
  const base = String(process.env.CLIENT_URL).replace(/\/$/,'')
  const token=encodeURIComponent(tokenFor(patient.id))
  const unsub = `${base}/unsubscribe?token=${token}`
  const oneClick = `${base}/api/news/unsubscribe-one-click?token=${token}`
  const article = `${base}/news/${announcement.branch_id}/${encodeURIComponent(announcement.slug)}`
  const safeUrl = escapeHtml(article), safeUnsub = escapeHtml(unsub)
  const html = `<div style="max-width:600px;margin:auto;font-family:Arial,sans-serif;color:#172b42;padding:24px"><h2>${escapeHtml(announcement.title)}</h2><p>${escapeHtml(announcement.caption)}</p>${announcement.cover_image_url ? `<img src="${escapeHtml(announcement.cover_image_url)}" alt="" style="max-width:100%;height:auto"/>` : ''}<p style="white-space:pre-line">${escapeHtml(announcement.body)}</p><p><a href="${safeUrl}">Read the announcement</a></p><hr/><small>Promotional communication from CARAIT Clinic. <a href="${safeUnsub}">Unsubscribe</a></small></div>`
  return sendResendEmail({
    from: `${process.env.MARKETING_FROM_NAME || 'CARAIT Clinic'} <${process.env.MARKETING_FROM_EMAIL}>`,
    to: patient.email,
    subject: announcement.title,
    html,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    // One idempotency key for this recipient/campaign, preventing duplicate delivery.
    idempotencyKey: `carait-marketing-${campaign.id}-${patient.id}`,
  })
}
let running = false
const reserveAndClaim = async (campaignId) => {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [[active]]=await conn.query("SELECT id FROM marketing_campaigns WHERE id=? AND status IN ('queued','sending') AND (scheduled_at IS NULL OR scheduled_at<=NOW()) FOR UPDATE",[campaignId])
    if(!active){await conn.rollback();return null}
    // The campaign row above is already locked, so only one worker can claim
    // a recipient from this campaign. TiDB does not implement SKIP LOCKED.
    const recipientLock = String(process.env.DB_PROVIDER || '').toLowerCase() === 'tidb'
      ? 'FOR UPDATE'
      : 'FOR UPDATE SKIP LOCKED'
    const [[recipient]] = await conn.query(`SELECT r.id,r.patient_id FROM marketing_campaign_recipients r
      WHERE r.campaign_id=? AND r.status='pending' ORDER BY r.id LIMIT 1 ${recipientLock}`,[campaignId])
    if (!recipient) {await conn.rollback();return null}
    const day=getClinicDateTimeSql().slice(0,10), minute=getClinicDateTimeSql().slice(0,16)
    for (const [bucket,period,limit] of [['day',day,setting('MARKETING_DAILY_LIMIT',200,1,10000)],['minute',minute,setting('MARKETING_PER_MINUTE_LIMIT',5,1,60)]]) {
      await conn.query('INSERT IGNORE INTO marketing_send_quota (bucket,period_key,reserved) VALUES (?,?,0)',[bucket,period])
      const [claimed]=await conn.query('UPDATE marketing_send_quota SET reserved=reserved+1 WHERE bucket=? AND period_key=? AND reserved<?',[bucket,period,limit])
      if (!claimed.affectedRows) {await conn.rollback();return null}
    }
    await conn.query("UPDATE marketing_campaign_recipients SET status='sending',attempts=attempts+1,claimed_at=NOW() WHERE id=?",[recipient.id])
    await conn.commit()
    return recipient
  } catch(e) {await conn.rollback().catch(()=>{});throw e} finally{conn.release()}
}
const processCampaign = async campaign => {
  const [[announcement]] = await db.query(`SELECT a.* FROM clinic_announcements a WHERE a.id=? AND a.branch_id=? AND a.status IN ('published','scheduled') AND (a.publish_at IS NULL OR a.publish_at<=NOW()) AND (a.expires_at IS NULL OR a.expires_at>NOW())`,[campaign.announcement_id,campaign.branch_id])
  if (!announcement) {
    const [[post]]=await db.query('SELECT status,(publish_at>NOW()) AS publish_in_future FROM clinic_announcements WHERE id=? AND branch_id=?',[campaign.announcement_id,campaign.branch_id])
    if(post && ['scheduled','published'].includes(post.status) && Number(post.publish_in_future))return
    await db.query("UPDATE marketing_campaigns SET status='paused' WHERE id=? AND status IN ('queued','sending')",[campaign.id]);return
  }
  const recipient=await reserveAndClaim(campaign.id)
  if (!recipient) {
    const [[counts]]=await db.query("SELECT SUM(status='pending') AS pending,SUM(status='sending') AS sending FROM marketing_campaign_recipients WHERE campaign_id=?",[campaign.id])
    if (!Number(counts.pending) && !Number(counts.sending)) await db.query("UPDATE marketing_campaigns SET status='completed',completed_at=NOW() WHERE id=? AND status IN ('queued','sending')",[campaign.id])
    return
  }
  const [[patient]] = await db.query(`SELECT p.id,p.email FROM patients p ${eligibleSql.slice(eligibleSql.indexOf('WHERE'))} AND p.id=?`,[campaign.branch_id,recipient.patient_id])
  if (!patient) {await db.query("UPDATE marketing_campaign_recipients SET status='suppressed' WHERE id=?",[recipient.id]);return}
  try {
    const messageId = await sendMarketingEmail({patient,campaign,announcement})
    await db.query("UPDATE marketing_campaign_recipients SET status='sent',provider_message_id=?,sent_at=NOW() WHERE id=? AND status='sending'",[messageId,recipient.id])
  } catch(error) {
    // A transport timeout can mean the provider accepted the email. Never retry automatically.
    await db.query("UPDATE marketing_campaign_recipients SET status='unknown',last_error=? WHERE id=? AND status='sending'",[String(error.message).slice(0,250),recipient.id])
    console.error('[marketing] delivery needs review', {campaignId:campaign.id, recipientId:recipient.id, reason:error.message})
  }
}
const runMarketingWorker = async () => {
  if (running || !configured()) return
  running=true
  try {
    // Crash recovery is deliberately non-retrying: may have been delivered externally.
    await db.query("UPDATE marketing_campaign_recipients SET status='unknown',last_error='Unconfirmed outcome after worker interruption' WHERE status='sending' AND claimed_at<DATE_SUB(NOW(),INTERVAL 3 MINUTE)")
    const [campaigns] = await db.query(`SELECT id,announcement_id,branch_id FROM marketing_campaigns
      WHERE status IN ('queued','sending') AND (scheduled_at IS NULL OR scheduled_at<=NOW()) ORDER BY id LIMIT 5`)
    for(const campaign of campaigns) {
      await db.query("UPDATE marketing_campaigns SET status='sending',started_at=COALESCE(started_at,NOW()) WHERE id=? AND status='queued'",[campaign.id])
      await processCampaign(campaign)
    }
  } catch(error) {console.error('[marketing] worker failure',error.message)} finally {running=false}
}
const startMarketingWorker = () => {
  if (!configured()) {console.warn('[marketing] Bulk email disabled until Resend and unsubscribe credentials are configured.');return}
  const timer=setInterval(()=>{void runMarketingWorker()},30000)
  timer.unref?.()
  void runMarketingWorker()
}
module.exports={configured,tokenFor,patientFromToken,eligibleSql,escapeHtml,reserveAndClaim,runMarketingWorker,startMarketingWorker}


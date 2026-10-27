const express = require('express')
const crypto = require('node:crypto')
const db = require('../db/connect')
const { writeAuditLog } = require('../utils/audit')
const { configured, eligibleSql, patientFromToken } = require('../utils/marketingCampaigns')
const cloud = require('../utils/cloudinarySecurity')
const {afterSuccessfulMutation}=require('../utils/clinicEvents')
const idOk = n => Number.isSafeInteger(Number(n)) && Number(n) > 0
const bad = (message,status=400) => Object.assign(new Error(message), {statusCode:status})
const clean = (v,max=255) => String(v ?? '').trim().slice(0,max)
const dateTime = v => !v ? null : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}:00+08:00`)) ? v.replace('T',' ')+':00' : undefined
const slug = input => clean(input,190).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'')
const validatePost = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Invalid announcement payload.')
  const title=clean(body.title,161), caption=clean(body.caption,351), content=String(body.body??'').trim()
  if(!title || title.length>160 || !caption || caption.length>350 || !content || content.length>12000)throw bad('Provide a title (160), caption (350), and article text (12,000 characters max).')
  const kind=String(body.type||'news'),status=String(body.status||'draft')
  if(!['promotion','news','article'].includes(kind)||!['draft','scheduled','published','archived'].includes(status))throw bad('Invalid announcement category or publishing status.')
  const path=slug(body.slug || title)
  if(path.length<3)throw bad('Enter a clear URL slug (3 or more characters).')
  const publishAt=dateTime(body.publish_at),expiresAt=dateTime(body.expires_at)
  if(publishAt===undefined||expiresAt===undefined|| (publishAt&&expiresAt&&expiresAt<=publishAt))throw bad('Invalid publication or expiration date.')
  if(status==='scheduled'&&!publishAt)throw bad('Schedule requires a publication date.')
  const rawCta=clean(body.cta_url,251)
  if(rawCta && !/^\/(?!\/)[\w/?#=&%.-]*$/.test(rawCta))throw bad('Only internal CARAIT booking links are allowed.')
  return {title,caption,body:content,type:kind,status,slug:path,publish_at:publishAt,expires_at:expiresAt,cta_label:clean(body.cta_label,60)||null,cta_url:rawCta||null,promotion_id:body.promotion_id ? Number(body.promotion_id) : null}
}
const audit=(req,action,id,details)=>writeAuditLog({userId:req.user.id,userRole:req.adminContext.account_role,branchId:req.branchId,action,entityType:'announcement',entityId:id,newValues:details,ipAddress:req.ip}).catch(()=>{})
const list = async(req,res)=>{
  const [rows]=await db.query(`SELECT a.id,a.branch_id,a.promotion_id,a.type,a.title,a.slug,a.caption,a.body,a.cover_image_url,a.cover_image_asset_id,a.cta_label,a.cta_url,a.status, DATE_FORMAT(a.publish_at,'%Y-%m-%d %H:%i:%s') AS publish_at, DATE_FORMAT(a.expires_at,'%Y-%m-%d %H:%i:%s') AS expires_at,a.created_at,a.updated_at,p.title AS promotion_title FROM clinic_announcements a LEFT JOIN clinic_promotions p ON p.id=a.promotion_id AND p.branch_id=a.branch_id WHERE a.branch_id=? ORDER BY a.updated_at DESC,a.id DESC LIMIT 300`,[req.branchId])
  res.json(rows)
}
const save = async(req,res)=>{
  const values=validatePost(req.body)
  const id=req.params.id?Number(req.params.id):null
  if(id!==null&&!idOk(id))throw bad('Invalid announcement ID.')
  if(values.promotion_id){if(!idOk(values.promotion_id))throw bad('Invalid promotion.');const [[promotion]]=await db.query('SELECT id FROM clinic_promotions WHERE id=? AND branch_id=?',[values.promotion_id,req.branchId]);if(!promotion)throw bad('Linked promotion must belong to the selected branch.')}
  const old=id?(await db.query('SELECT * FROM clinic_announcements WHERE id=? AND branch_id=?',[id,req.branchId]))[0][0]:null
  if(id){const [[campaign]]=await db.query("SELECT id FROM marketing_campaigns WHERE announcement_id=? AND branch_id=? AND status IN ('queued','sending','paused') LIMIT 1",[id,req.branchId]);if(campaign)throw bad('Pause/cancel the active email campaign before changing the announcement.',409)}
  if(id&&!old)return res.status(404).json({message:'Announcement not found in this branch.'})
  const nextImg=req.body.cover_image_url||null
  let assetId=old?.cover_image_asset_id||null,img=old?.cover_image_url||null
  if(nextImg && nextImg!==img){
    const token=String(req.body.cover_image_token||'')
    const claims=cloud.verifyUploadSecurityToken(token,{stage:'accepted',role:'admin',user_id:req.user.id,context_type:'announcement',context_id:req.branchId,scan_status:'approved',url:nextImg})
    assetId=claims.asset_id;img=nextImg
  } else if(req.body.clear_cover_image===true){assetId=null;img=null}
  const args=[values.title,values.slug,values.caption,values.body,values.type,values.status,values.publish_at,values.expires_at,values.cta_label,values.cta_url,values.promotion_id,img,assetId]
  try{
    if(id) {
      await db.query(`UPDATE clinic_announcements SET title=?,slug=?,caption=?,body=?,type=?,status=?,publish_at=?,expires_at=?,cta_label=?,cta_url=?,promotion_id=?,cover_image_url=?,cover_image_asset_id=? WHERE id=? AND branch_id=?`,[...args,id,req.branchId])
    } else {
      const [result]=await db.query(`INSERT INTO clinic_announcements (title,slug,caption,body,type,status,publish_at,expires_at,cta_label,cta_url,promotion_id,cover_image_url,cover_image_asset_id,branch_id,created_by_admin_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[...args,req.branchId,req.user.id]);req.savedAnnouncementId=result.insertId
    }
  }catch(error){if(error.code==='ER_DUP_ENTRY')throw bad('This URL slug already exists in this branch. Choose another.');throw error}
  const savedId=id||req.savedAnnouncementId
  await audit(req,id?'announcement.updated':'announcement.created',savedId,{title:values.title,status:values.status})
  res.json({id:savedId,message:'Announcement saved.'})
}
const uploadImage=async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||req.body.length>5*1024*1024||!req.body.length)throw bad('Choose a JPG or PNG cover image up to 5 MB.')
  if(!cloud.detectImageMime(req.body))throw bad('A valid JPG or PNG image is required.')
  const cloudName=process.env.CLOUDINARY_CLOUD_NAME,apiKey=process.env.CLOUDINARY_API_KEY,apiSecret=process.env.CLOUDINARY_API_SECRET
  if(!cloudName||!apiKey||!apiSecret)throw bad('Image uploads need Cloudinary configuration.',503)
  const timestamp=Math.floor(Date.now()/1000),folder=`carait-clinic/announcements/branch_${req.branchId}`
  const signed={cloud_name:cloudName,api_key:apiKey,timestamp,folder,moderation:'perception_point',scan_mode:'scan',signature:cloud.makeCloudinarySignature({folder,moderation:'perception_point',timestamp},apiSecret)}
  const result=await cloud.cloudinaryUploadBuffer({buffer:req.body,mimeType:req.get('content-type'),fileName:'announcement-cover',signed})
  res.json({status:'pending',asset_id:result.asset_id,url:result.secure_url,scan_token:cloud.issueScanPendingToken({role:'admin',userId:req.user.id,contextType:'announcement',contextId:req.branchId,assetId:result.asset_id,url:result.secure_url,publicId:result.public_id,fileHash:cloud.hashUploadBuffer(req.body)})})
}
const imageStatus=async(req,res)=>{
  const pending=cloud.verifyUploadSecurityToken(req.body?.scan_token,{stage:'scan_pending',role:'admin',user_id:req.user.id,context_type:'announcement',context_id:req.branchId})
  const scan=await cloud.getPerceptionPointScanStatus(pending.asset_id)
  if(scan.secure_url&&scan.secure_url!==pending.url)throw bad('Uploaded image identity mismatch.',409)
  if(scan.status!=='approved')return res.json({status:scan.status,message:scan.message||null})
  return res.json({status:'approved',url:pending.url,security_token:cloud.issueAcceptedUploadToken({role:'admin',userId:req.user.id,contextType:'announcement',contextId:req.branchId,status:'approved',assetId:pending.asset_id,url:pending.url,publicId:pending.public_id})})
}
const countEligible=async(req,res)=>{const audienceArgs=[req.branchId];const [[row]]=await db.query(`SELECT COUNT(*) AS eligible ${eligibleSql}`,audienceArgs);res.json({eligible:Number(row.eligible),provider_ready:configured(),daily_limit:Number(process.env.MARKETING_DAILY_LIMIT)||200,per_minute_limit:Number(process.env.MARKETING_PER_MINUTE_LIMIT)||5})}
const campaigns=async(req,res)=>{const [rows]=await db.query(`SELECT c.*,a.title, SUM(r.status='sent') AS sent,SUM(r.status='pending') AS pending,SUM(r.status='unknown') AS needs_review,SUM(r.status='suppressed') AS suppressed FROM marketing_campaigns c JOIN clinic_announcements a ON a.id=c.announcement_id LEFT JOIN marketing_campaign_recipients r ON r.campaign_id=c.id WHERE c.branch_id=? GROUP BY c.id ORDER BY c.id DESC LIMIT 100`,[req.branchId]);res.json(rows)}
const campaignRecipients=async(req,res)=>{
  const id=Number(req.params.id)
  if(!idOk(id))throw bad('Invalid campaign ID.')
  const [[owned]]=await db.query('SELECT id FROM marketing_campaigns WHERE id=? AND branch_id=?',[id,req.branchId])
  if(!owned)return res.status(404).json({message:'Campaign not found in this branch.'})
  const page=Number(req.query.page||1)
  if(!Number.isSafeInteger(page)||page<1||page>100000)throw bad('Invalid page number.')
  const [rows]=await db.query(`SELECT r.id,r.status,r.attempts,r.provider_message_id,r.last_error,r.sent_at,p.id AS patient_id,p.email
    FROM marketing_campaign_recipients r INNER JOIN patients p ON p.id=r.patient_id
    WHERE r.campaign_id=? ORDER BY r.id LIMIT 50 OFFSET ?`,[id,(page-1)*50])
  res.json({page,recipients:rows})
}
const launch=async(req,res)=>{
  if(!configured())throw bad('Bulk email is disabled. Configure Resend sender, API key, unsubscribe secret, and CLIENT_URL first.',503)
  const id=Number(req.params.id)
  if(!idOk(id))throw bad('Invalid announcement.')
  const mode=String(req.body?.recipient_mode||'random'),requested=Number(req.body?.limit||500)
  if(!['random','all'].includes(mode)||!Number.isSafeInteger(requested)||requested<1||requested>10000)throw bad('Choose all or a recipient limit of 1–10,000.')
  const [[post]]=await db.query("SELECT id,status,publish_at,expires_at FROM clinic_announcements WHERE id=? AND branch_id=? AND status IN ('scheduled','published')",[id,req.branchId]);if(!post)throw bad('Publish or schedule this announcement before creating a campaign.',409)
  const scheduled=dateTime(req.body.scheduled_at)
  if(scheduled===undefined)throw bad('Invalid schedule date.')
  const conn=await db.getConnection()
  try{
    await conn.beginTransaction()
    const [[lockedPost]]=await conn.query('SELECT id,status FROM clinic_announcements WHERE id=? AND branch_id=? FOR UPDATE',[id,req.branchId])
    if(!lockedPost)throw bad('Announcement no longer exists in this branch.',404)
    if(!['published','scheduled'].includes(lockedPost.status))throw bad('Only a published or scheduled announcement can be emailed.',409)
    const [[existing]]=await conn.query("SELECT id FROM marketing_campaigns WHERE announcement_id=? AND branch_id=? AND status IN ('draft','queued','sending','paused') LIMIT 1",[id,req.branchId])
    if(existing)throw bad('This announcement already has an active campaign. Pause, resume or cancel it rather than duplicating recipients.',409)
    const [created]=await conn.query(`INSERT INTO marketing_campaigns (announcement_id,branch_id,status,recipient_mode,requested_limit,scheduled_at,created_by_admin_id) VALUES (?,?,'draft',?,?,?,?)`,[id,req.branchId,mode,requested,scheduled,req.user.id])
    const campaignId=created.insertId
    // Deterministic randomized selection per campaign. One per patient, only verified opt-ins who have visited this branch.
    const limit=mode==='all'?10000:requested
    const recipientArgs=[campaignId,req.branchId,campaignId,limit]
    await conn.query(`INSERT INTO marketing_campaign_recipients (campaign_id,patient_id,status)
      SELECT ?,p.id,'pending' ${eligibleSql} ORDER BY SHA2(CONCAT(p.id,':',?),256) LIMIT ?`,recipientArgs)
    const [[count]]=await conn.query('SELECT COUNT(*) n FROM marketing_campaign_recipients WHERE campaign_id=?',[campaignId])
    if(Number(count.n)===0){await conn.rollback();throw bad('No consented, email-verified patients with a visit in this branch are eligible.',409)}
    await conn.query("UPDATE marketing_campaigns SET recipient_total=?,status='queued' WHERE id=?",[Number(count.n),campaignId])
    await conn.commit()
    await audit(req,'marketing_campaign.queued',campaignId,{announcement_id:id,recipient_total:Number(count.n),recipient_mode:mode})
    res.status(201).json({id:campaignId,queued:Number(count.n),message:'Campaign queued. Sending will respect configured limits.'})
  }catch(err){await conn.rollback().catch(()=>{});throw err}finally{conn.release()}
}
const control=async(req,res)=>{
  const id=Number(req.params.id),action=req.body?.action
  if(!idOk(id)||!['pause','resume','cancel'].includes(action))throw bad('Invalid campaign action.')
  const allowed=action==='pause'?['queued','sending']:action==='resume'?['paused']:['draft','queued','sending','paused']
  const [result]=await db.query(`UPDATE marketing_campaigns SET status=? WHERE id=? AND branch_id=? AND status IN (${allowed.map(()=>'?').join(',')})`,[action==='pause'?'paused':action==='resume'?'queued':'cancelled',id,req.branchId,...allowed])
  if(!result.affectedRows)throw bad('Campaign state has changed. Refresh and try again.',409)
  await audit(req,`marketing_campaign.${action}`,id,{action})
  res.json({message:`Campaign ${action}d.`})
}
const registerBranchAnnouncements=(router,{requireSuper,branchContext,requirePermission})=>{
  for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
    const auth=[...middle,requirePermission('system_setup')]
    router.get(`${prefix}/announcements`,...auth,list)
    router.post(`${prefix}/announcements`,...auth,afterSuccessfulMutation('promotion.updated'),save)
    router.put(`${prefix}/announcements/:id`,...auth,afterSuccessfulMutation('promotion.updated'),save)
    router.post(`${prefix}/announcements/image`,...auth,express.raw({type:['image/png','image/jpeg','application/octet-stream'],limit:'5mb'}),uploadImage)
    router.post(`${prefix}/announcements/image/status`,...auth,imageStatus)
    router.get(`${prefix}/announcements/audience`,...auth,countEligible)
    router.get(`${prefix}/announcements/campaigns`,...auth,campaigns)
    router.get(`${prefix}/announcements/campaigns/:id/recipients`,...auth,campaignRecipients)
    router.post(`${prefix}/announcements/:id/campaigns`,...auth,launch)
    router.post(`${prefix}/announcements/campaigns/:id/control`,...auth,control)
  }
}
const publicRouter=express.Router()
publicRouter.get('/',async(req,res)=>{
  const branch=req.query.branch_id?Number(req.query.branch_id):null
  if(branch!==null&&!idOk(branch))throw bad('Invalid branch ID.')
  const type=String(req.query.type||'all')
  if(!['all','promotion','news','article'].includes(type))throw bad('Invalid news category.')
  const [rows]=await db.query(`SELECT a.id,a.branch_id,a.title,a.slug,a.caption,a.type,a.cover_image_url,a.publish_at,a.expires_at,cb.name AS branch_name FROM clinic_announcements a INNER JOIN clinic_branches cb ON cb.id=a.branch_id AND cb.is_active=1
    WHERE a.status IN ('published','scheduled') AND (a.publish_at IS NULL OR a.publish_at<=NOW()) AND (a.expires_at IS NULL OR a.expires_at>NOW()) AND (? IS NULL OR a.branch_id=?) AND (?='all' OR a.type=?) ORDER BY a.publish_at DESC,a.id DESC LIMIT 100`,[branch,branch,type,type])
  res.json(rows)
})
publicRouter.get('/:branchId/:slug',async(req,res)=>{
  const branchId=Number(req.params.branchId),path=slug(req.params.slug)
  if(!idOk(branchId)||path!==req.params.slug)throw bad('Invalid news URL.')
  const [[article]]=await db.query(`SELECT a.id,a.branch_id,a.promotion_id,a.title,a.slug,a.caption,a.body,a.type,a.cover_image_url,a.cta_label,a.cta_url,a.publish_at,a.expires_at,cb.name AS branch_name FROM clinic_announcements a INNER JOIN clinic_branches cb ON cb.id=a.branch_id AND cb.is_active=1 WHERE a.branch_id=? AND a.slug=? AND a.status IN ('published','scheduled') AND (a.publish_at IS NULL OR a.publish_at<=NOW()) AND (a.expires_at IS NULL OR a.expires_at>NOW())`,[branchId,path])
  if(!article)return res.status(404).json({message:'This article is not available.'})
  res.json(article)
})
const unsubscribe=async(req,res)=>{
  const patientId=patientFromToken(req.body?.token || req.query?.token)
  if(!patientId)throw bad('Unsubscribe link is invalid or expired.',400)
  const conn=await db.getConnection()
  try{await conn.beginTransaction();await conn.query("INSERT IGNORE INTO marketing_unsubscribes (patient_id,reason) VALUES (?,'email_link')",[patientId]);await conn.query('UPDATE patients SET receive_promotions=0 WHERE id=?',[patientId]);await conn.commit();res.json({message:'You are unsubscribed from CARAIT promotional emails.'})}catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
}
publicRouter.post('/unsubscribe',unsubscribe)
// RFC 8058 one-click unsubscribe: POST only; GET never modifies consent.
publicRouter.post('/unsubscribe-one-click',unsubscribe)
module.exports={registerBranchAnnouncements,publicRouter,validatePost,slug,dateTime}


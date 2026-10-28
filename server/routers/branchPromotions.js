// Branch-owned, informational promotions. Never adjust billing automatically.
const db=require('../db/connect')
const {writeAuditLog}=require('../utils/audit')
const {createNotification}=require('../utils/notifications')
const cloud=require('../utils/cloudinarySecurity')
const {broadcastClinicChange}=require('../utils/clinicEvents')
const express=require('express')
const validDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value}
const validId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0
const validate=body=>{
 const title=String(body?.title||'').trim(),description=String(body?.description||'').trim(),badge=String(body?.badge_text||'').trim(),start=body?.starts_on,end=body?.ends_on
 if(!title||title.length>120||!description||description.length>1000||badge.length>48)return 'Enter a title, description and optional badge within the character limits.'
 if(!validDate(start)||!validDate(end)||start>end)return 'Enter a valid promotion start and end date.'
 if(body?.featured_order!==undefined && (!Number.isSafeInteger(Number(body.featured_order)) || Number(body.featured_order)<0 || Number(body.featured_order)>9999))return 'Featured order must be between 0 and 9999.'
 if(!Array.isArray(body?.service_ids)||!body.service_ids.length||body.service_ids.length>100||body.service_ids.some(i=>!validId(i)))return 'Select at least one valid branch service.'
 return null
}
const audit=(req,conn,action,id,data)=>writeAuditLog({userId:req.user.id,userRole:req.adminContext.account_role,branchId:req.branchId,action,entityType:'promotion',entityId:id,newValues:data,ipAddress:req.ip},conn)
const list=async(req,res)=>{
 const [rows]=await db.query("SELECT id,title,description,badge_text,image_url,featured_order,DATE_FORMAT(starts_on,'%Y-%m-%d') starts_on,DATE_FORMAT(ends_on,'%Y-%m-%d') ends_on,is_active,show_on_dashboard,created_at FROM clinic_promotions WHERE branch_id=? ORDER BY created_at DESC,id DESC",[req.branchId])
 if(!rows.length)return res.json([])
 const ids=rows.map(r=>r.id)
 const [services]=await db.query(`SELECT ps.promotion_id,ps.service_id FROM clinic_promotion_services ps JOIN billing_service_catalog bc ON bc.id=ps.service_id AND bc.branch_id=? WHERE ps.promotion_id IN (${ids.map(()=>'?').join(',')})`,[req.branchId,...ids])
 res.json(rows.map(r=>({...r,is_active:Boolean(r.is_active),show_on_dashboard:Boolean(r.show_on_dashboard),service_ids:services.filter(s=>s.promotion_id===r.id).map(s=>Number(s.service_id))})))
}
const save=async(req,res)=>{
 const failure=validate(req.body);if(failure)return res.status(400).json({message:failure})
 const id=req.params.id?Number(req.params.id):null;if(id!==null&&!validId(id))return res.status(400).json({message:'Invalid promotion.'})
 const data={title:String(req.body.title).trim(),description:String(req.body.description).trim(),badge_text:String(req.body.badge_text||'').trim()||null,starts_on:req.body.starts_on,ends_on:req.body.ends_on,is_active:req.body.is_active===true||Number(req.body.is_active)===1?1:0,show_on_dashboard:req.body.show_on_dashboard===false||Number(req.body.show_on_dashboard)===0?0:1,featured_order:Number(req.body.featured_order||0),service_ids:[...new Set(req.body.service_ids.map(Number))]}
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const [services]=await conn.query(`SELECT id FROM billing_service_catalog WHERE branch_id=? AND id IN (${data.service_ids.map(()=>'?').join(',')})`,[req.branchId,...data.service_ids]);if(services.length!==data.service_ids.length){await conn.rollback();return res.status(400).json({message:'One or more services do not belong to the selected branch.'})}
  let savedId=id
  const [[oldImage]]=id?await conn.query('SELECT id,image_url,image_asset_id FROM clinic_promotions WHERE id=? AND branch_id=? FOR UPDATE',[id,req.branchId]):[[]]
  let imageUrl=oldImage?.image_url||null,imageAssetId=oldImage?.image_asset_id||null
  if(req.body.clear_image===true){imageUrl=null;imageAssetId=null}
  else if(req.body.image_token){const accepted=cloud.verifyUploadSecurityToken(req.body.image_token,{stage:'accepted',role:'admin',user_id:req.user.id,context_type:'promotion',context_id:req.branchId,scan_status:'approved',url:req.body.image_url});imageUrl=accepted.url;imageAssetId=accepted.asset_id}
  else if(req.body.image_url && req.body.image_url!==imageUrl){await conn.rollback();return res.status(400).json({message:'Upload and approve the promotional image before saving.'})}
  if(id){const [[old]]=await conn.query('SELECT id FROM clinic_promotions WHERE id=? AND branch_id=? FOR UPDATE',[id,req.branchId]);if(!old){await conn.rollback();return res.status(404).json({message:'Promotion not found in this branch.'})}
    await conn.query('UPDATE clinic_promotions SET title=?,description=?,badge_text=?,starts_on=?,ends_on=?,is_active=?,show_on_dashboard=?,image_url=?,image_asset_id=?,featured_order=? WHERE id=? AND branch_id=?',[data.title,data.description,data.badge_text,data.starts_on,data.ends_on,data.is_active,data.show_on_dashboard,imageUrl,imageAssetId,data.featured_order,id,req.branchId]);await conn.query('DELETE FROM clinic_promotion_services WHERE promotion_id=?',[id])
  }else{const [created]=await conn.query('INSERT INTO clinic_promotions (title,description,badge_text,starts_on,ends_on,is_active,show_on_dashboard,created_by_admin_id,branch_id,image_url,image_asset_id,featured_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[data.title,data.description,data.badge_text,data.starts_on,data.ends_on,data.is_active,data.show_on_dashboard,req.user.id,req.branchId,imageUrl,imageAssetId,data.featured_order]);savedId=created.insertId}
  for(const serviceId of data.service_ids)await conn.query('INSERT INTO clinic_promotion_services (promotion_id,service_id) VALUES (?,?)',[savedId,serviceId])
  await audit(req,conn,id?'promotion.updated':'promotion.created',savedId,{...data,branch_id:req.branchId,image_url:imageUrl});await conn.commit();broadcastClinicChange('promotion.updated',{branchId:req.branchId,id:savedId});res.json({id:savedId,message:id?'Promotion updated.':'Promotion created.'})
 }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
}
const deactivate=async(req,res)=>{
 const id=Number(req.params.id);if(!validId(id))return res.status(400).json({message:'Invalid promotion.'})
 const [[promo]]=await db.query('SELECT id,title,is_active FROM clinic_promotions WHERE id=? AND branch_id=?',[id,req.branchId]);if(!promo)return res.status(404).json({message:'Promotion not found in this branch.'})
 // Remove from active listings, never delete historical deliveries or audit links.
 await db.query('UPDATE clinic_promotions SET is_active=0 WHERE id=? AND branch_id=?',[id,req.branchId]);await audit(req,db,'promotion.deactivated',id,{title:promo.title});broadcastClinicChange('promotion.updated',{branchId:req.branchId,id});res.json({message:'Promotion deactivated. Notification history has been retained.'})
}
const notify=async(req,res)=>{
 const id=Number(req.params.id);if(!validId(id))return res.status(400).json({message:'Invalid promotion.'})
 const [[p]]=await db.query('SELECT id,title,description FROM clinic_promotions WHERE id=? AND branch_id=? AND is_active=1 AND starts_on<=CURDATE() AND ends_on>=CURDATE()', [id,req.branchId]);if(!p)return res.status(409).json({message:'Only an active, currently valid promotion can be sent.'})
 // Never notify patients merely because they exist in the shared patient directory.
 const [patients]=await db.query(`SELECT patient.id FROM patients patient WHERE patient.receive_promotions=1 AND COALESCE(patient.is_walk_in,0)=0 AND patient.phone_verified_at IS NOT NULL AND EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id=patient.id AND a.branch_id=?) AND NOT EXISTS (SELECT 1 FROM clinic_promotion_notifications n WHERE n.promotion_id=? AND n.patient_id=patient.id) ORDER BY patient.id LIMIT 500`,[req.branchId,id])
 let delivered=0,failed=0
 for(const patient of patients){const [reservation]=await db.query('INSERT IGNORE INTO clinic_promotion_notifications (promotion_id,patient_id) VALUES (?,?)',[id,patient.id]);if(!reservation.affectedRows)continue
   try{await createNotification({target_role:'patient',target_user_id:patient.id,type:'clinic_promotion',title:p.title,message:p.description,reference_type:'promotion',reference_id:id,branch_id:req.branchId,link:'/patient/book'});await db.query('UPDATE clinic_promotion_notifications SET notified_at=NOW() WHERE promotion_id=? AND patient_id=?',[id,patient.id]);delivered++}catch(e){failed++;await db.query('DELETE FROM clinic_promotion_notifications WHERE promotion_id=? AND patient_id=? AND notified_at IS NULL',[id,patient.id]).catch(()=>{})}
 }
 await audit(req,db,'promotion.notifications_sent',id,{delivered,failed});res.json({message:`${delivered} opted-in patient notification(s) delivered.`,delivered,failed,more_possible:patients.length>=500})
}

// Per-promotion image workflow uses the same Cloudinary malware moderation as Announcements,
// but a different signed context: announcement approvals cannot attach to a promotion.
const uploadImage=async(req,res)=>{
 if(!Buffer.isBuffer(req.body)||!req.body.length||req.body.length>5*1024*1024||!cloud.detectImageMime(req.body))return res.status(400).json({message:'Choose a valid JPG or PNG image up to 5 MB.'})
 const cloudName=process.env.CLOUDINARY_CLOUD_NAME,apiKey=process.env.CLOUDINARY_API_KEY,apiSecret=process.env.CLOUDINARY_API_SECRET
 if(!cloudName||!apiKey||!apiSecret)return res.status(503).json({message:'Secure image uploads are not configured.'})
 const timestamp=Math.floor(Date.now()/1000),folder=`carait-clinic/promotions/branch_${req.branchId}`
 const signed={cloud_name:cloudName,api_key:apiKey,timestamp,folder,moderation:'perception_point',scan_mode:'scan',signature:cloud.makeCloudinarySignature({folder,moderation:'perception_point',timestamp},apiSecret)}
 const uploaded=await cloud.cloudinaryUploadBuffer({buffer:req.body,mimeType:cloud.detectImageMime(req.body),fileName:'promotion-cover',signed})
 res.json({status:'pending',url:uploaded.secure_url,scan_token:cloud.issueScanPendingToken({role:'admin',userId:req.user.id,contextType:'promotion',contextId:req.branchId,assetId:uploaded.asset_id,url:uploaded.secure_url,publicId:uploaded.public_id,fileHash:cloud.hashUploadBuffer(req.body)})})
}
const imageStatus=async(req,res)=>{
 const pending=cloud.verifyUploadSecurityToken(req.body?.scan_token,{stage:'scan_pending',role:'admin',user_id:req.user.id,context_type:'promotion',context_id:req.branchId})
 const scan=await cloud.getPerceptionPointScanStatus(pending.asset_id)
 if(scan.secure_url&&scan.secure_url!==pending.url)return res.status(409).json({message:'Uploaded image identity mismatch.'})
 if(scan.status!=='approved')return res.json({status:scan.status,message:scan.message||null})
 res.json({status:'approved',url:pending.url,security_token:cloud.issueAcceptedUploadToken({role:'admin',userId:req.user.id,contextType:'promotion',contextId:req.branchId,status:'approved',assetId:pending.asset_id,url:pending.url,publicId:pending.public_id})})
}

const registerBranchPromotions=(router,{requireSuper,branchContext,requirePermission})=>{
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  router.post(`${prefix}/promotions/image`,...middle,requirePermission('system_setup'),express.raw({type:['image/png','image/jpeg','application/octet-stream'],limit:'5mb'}),uploadImage)
  router.post(`${prefix}/promotions/image/status`,...middle,requirePermission('system_setup'),imageStatus)
  router.get(`${prefix}/promotions`,...middle,requirePermission('system_setup'),list)
  router.post(`${prefix}/promotions`,...middle,requirePermission('system_setup'),save)
  router.put(`${prefix}/promotions/:id`,...middle,requirePermission('system_setup'),save)
  router.delete(`${prefix}/promotions/:id`,...middle,requirePermission('system_setup'),deactivate)
  router.post(`${prefix}/promotions/:id/notify`,...middle,requirePermission('system_setup'),notify)
 }
}
module.exports={registerBranchPromotions,validate}

const db=require('../db/connect')
const {loadStaffPermissions}=require('./staffPermissions')
const {getTodayDateOnly}=require('./date')
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode})
const dateOnly=v=>v instanceof Date?v.toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}):String(v||'').slice(0,10)
const references={appointment:['appointments','appointments'],billing:['billing_records','billing'],billing_record:['billing_records','billing'],promotion:['clinic_promotions','system_setup'],announcement:['clinic_announcements','system_setup'],inventory:['inventory','inventory'],supply_request:['supply_requests','inventory'],supply_request_group:['supply_request_groups','inventory']}
async function notificationDestination({id,role,userId,branchId,superadmin=false,permissions},executor=db){
 if(!Number.isSafeInteger(Number(id))||Number(id)<=0)throw fail(404,'Notification not found.')
 const [[n]]=await executor.query(`SELECT * FROM notifications WHERE id=? AND target_role=? AND (target_user_id IS NULL OR target_user_id=?)${role==='patient'||superadmin?'':' AND branch_id=?'} LIMIT 1`,[id,superadmin?'admin':role,userId,...(role==='patient'||superadmin?[]:[branchId])])
 if(!n)throw fail(404,'Notification not found in this branch.')
 let type=n.reference_type,ref=Number(n.reference_id)
 if(!references[type]){const legacy=String(n.link||'').match(/^\/(?:admin|staff)\/(?:billing\/)?checkout\/(\d+)$/);if(legacy){type='billing_record';ref=Number(legacy[1])}}
 const mapping=references[type]
 if(!mapping||!Number.isSafeInteger(ref)||ref<=0)throw fail(410,'This notification has no available destination.')
 const legacyGlobal=!Number(n.branch_id)&&(role==='patient'||superadmin)
 const [[record]]=await executor.query(`SELECT * FROM ${mapping[0]} WHERE id=?${legacyGlobal?'':' AND branch_id=?'} LIMIT 1`,[ref,...(legacyGlobal?[]:[n.branch_id])])
 if(!record)throw fail(410,'This record was deleted or is no longer available.')
 if(role==='patient'&&['appointment','billing','billing_record'].includes(type)&&Number(record.patient_id)!==Number(userId))throw fail(403,'You do not have access to this record.')
 if(role==='doctor'&&Number(record.doctor_id)!==Number(userId))throw fail(403,'You do not have access to this record.')
 let staffCanCheckout=false
 if(role==='staff'){
  const granted=permissions||await loadStaffPermissions(userId,executor)
  staffCanCheckout=granted.includes('checkout')
  if(mapping[1]==='billing'?(!staffCanCheckout&&!granted.includes('billing')):!granted.includes(mapping[1]))throw fail(403,'Your account does not have access to this page.')
  if(['promotion','announcement'].includes(type))throw fail(410,'This notice has no Staff destination. Ask an administrator to review its details.')
 }
 if(role==='admin'&&!superadmin&&!permissions?.includes(mapping[1]))throw fail(403,'Your account does not have access to this page.')
 const branch=Number(record.branch_id),base=superadmin?`/superadmin/branches/${branch}`:`/${role}`
 if(type==='appointment')return {path:role==='patient'&&!['pending','confirmed','rescheduled','in-progress'].includes(record.status)?`/patient/history?appointment_id=${ref}`:`${base}/appointments?appointment_id=${ref}&date=${dateOnly(record.appointment_date)}`}
 if(['billing','billing_record'].includes(type))return {path:role==='patient'?`/patient/history?bill_id=${ref}`:role==='staff'&&!staffCanCheckout?`/staff/billing/history/${ref}`:`${base}/${role==='staff'?'checkout':'billing/checkout'}/${ref}`}
 if(type==='promotion'){
  if(role==='patient'){const today=getTodayDateOnly();if(!Number(record.is_active)||dateOnly(record.starts_on)>today||dateOnly(record.ends_on)<today)throw fail(410,'This offer is no longer active.');return {path:`/patient/offers?branch_id=${branch}&promotion_id=${ref}`}}
  return {path:`${base}/announcements?promotion_id=${ref}`}
 }
 if(type==='announcement'){
  if(role==='patient'){if(!['published','scheduled'].includes(record.status)||(record.expires_at&&new Date(record.expires_at).getTime()<=Date.now())||(record.publish_at&&new Date(record.publish_at).getTime()>Date.now()))throw fail(410,'This post is no longer available.');return {path:`/news/${branch}/${encodeURIComponent(record.slug)}`}}
  return {path:`${base}/announcements?announcement_id=${ref}`}
 }
 if(role==='doctor')throw fail(410,'This stock workflow is no longer available. Ask clinic staff for its history.')
 if(role==='patient')throw fail(403,'You do not have access to this record.')
 return {path:`${base}/inventory?${type}_id=${ref}`}
}
module.exports={notificationDestination}

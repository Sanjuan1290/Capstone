// Durable appointment reminders; schema must be applied explicitly before enabling.
// Sending is OFF by default on new branches; never use promotional consent as blanket authority.
const db=require('../db/connect')
const {randomUUID}=require('crypto')
const {getTodayDateOnly,addDaysDateOnly}=require('./date')
const {appointmentStartUtc}=require('./bookingPolicy')
const {sendAppointmentReminder}=require('./emailService')
const {sendPatientAppointmentReminderSms,isSmsConfigured}=require('./smsService')
const HOURS=[1,2,3,6,12,24]
const truthy=value=>value===true||value===1||value==='1'
const failure=(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code})
const checkSettings=input=>{
  const lead=Number(input.lead_hours)
  if(!HOURS.includes(lead))throw failure(400,'REMINDER_LEAD_INVALID','Choose 1, 2, 3, 6, 12 or 24 hours.')
  const out={enabled:truthy(input.enabled),lead_hours:lead,email_enabled:truthy(input.email_enabled),sms_enabled:truthy(input.sms_enabled)}
  if(out.enabled&&!out.email_enabled&&!out.sms_enabled)throw failure(400,'REMINDER_CHANNEL_REQUIRED','Choose email, SMS, or both.')
  return out
}
const getSettings=async(branchId,executor=db)=>{
  const [[row]]=await executor.query('SELECT * FROM branch_appointment_reminder_settings WHERE branch_id=? LIMIT 1',[branchId])
  return row||{branch_id:branchId,enabled:0,lead_hours:3,email_enabled:1,sms_enabled:0}
}
const putSettings=async(branchId,input,executor=db)=>{
  const s=checkSettings(input)
  await executor.query(`INSERT INTO branch_appointment_reminder_settings
    (branch_id,enabled,lead_hours,email_enabled,sms_enabled) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),lead_hours=VALUES(lead_hours),email_enabled=VALUES(email_enabled),sms_enabled=VALUES(sms_enabled)`,
    [branchId,+s.enabled,s.lead_hours,+s.email_enabled,+s.sms_enabled])
  return getSettings(branchId,executor)
}
const loadAppointment=async(id,branchId,executor=db)=>{
 const [[row]]=await executor.query(`SELECT a.id,a.branch_id,a.status,
 DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,a.appointment_time,
 a.requested_service_name_snapshot AS service_name,
 p.id AS patient_id,p.full_name AS patient_name,p.email,p.phone,p.consent_given,p.email_verified_at,p.phone_verified_at,
 d.full_name AS doctor_name,b.name AS branch_name,b.address AS branch_address,b.phone AS branch_phone
 FROM appointments a JOIN patients p ON p.id=a.patient_id
 JOIN doctors d ON d.id=a.doctor_id JOIN clinic_branches b ON b.id=a.branch_id
 WHERE a.id=? AND a.branch_id=? LIMIT 1`,[id,branchId])
 return row||null
}
const isEligible=(appt,now=new Date())=>{
 if(!appt||appt.status!=='confirmed'||!truthy(appt.consent_given))return false
 const time=appointmentStartUtc(appt.appointment_date,appt.appointment_time)
 return Boolean(time&&time.getTime()>now.getTime())
}
const deliveryChannels=(appt,settings)=>{
 const channels=[]
 if(settings.email_enabled&&appt.email&&appt.email_verified_at)channels.push('email')
 if(settings.sms_enabled&&appt.phone&&appt.phone_verified_at&&isSmsConfigured())channels.push('sms')
 return channels
}
const unavailableReason=(appt,settings,channel)=>{
 if(channel==='email'){
  if(!settings.email_enabled)return 'email_disabled_in_reminder_settings'
  if(!appt.email)return 'patient_email_missing'
  if(!appt.email_verified_at)return 'patient_email_not_verified'
 }
 if(channel==='sms'){
  if(!settings.sms_enabled)return 'sms_disabled_in_reminder_settings'
  if(!appt.phone)return 'patient_phone_missing'
  if(!appt.phone_verified_at)return 'patient_phone_not_verified'
  if(!isSmsConfigured())return 'sms_provider_not_configured'
 }
 return 'channel_unavailable'
}
const sendOne=async({appointmentId,branchId,channel,kind='automatic',actor=null,now=new Date(),executor=db})=>{
 const appt=await loadAppointment(appointmentId,branchId,executor)
 if(!isEligible(appt,now))return {channel,status:'skipped',reason:'not_confirmed_or_not_future_or_no_consent'}
 const settings=await getSettings(branchId,executor)
 if(kind==='automatic'&&!truthy(settings.enabled))return {channel,status:'skipped',reason:'disabled'}
 if(!deliveryChannels(appt,settings).includes(channel))return {channel,status:'skipped',reason:unavailableReason(appt,settings,channel)}
 if(kind==='manual'){
  const [[recent]]=await executor.query(`SELECT id FROM appointment_reminder_deliveries WHERE appointment_id=? AND branch_id=? AND reminder_kind='manual' AND channel=? AND status IN ('sent','processing') AND created_at > DATE_SUB(NOW(),INTERVAL 10 MINUTE) LIMIT 1`,[appointmentId,branchId,channel])
  if(recent)return {channel,status:'skipped',reason:'cooldown'}
 }
 // Schedule fingerprint changes automatically when date/time changes.
 const eventKey=kind==='automatic'?`auto:${appt.id}:${appt.appointment_date}:${appt.appointment_time}:${channel}`:`manual:${appt.id}:${channel}:${randomUUID()}`
 const [claimed]=await executor.query(`INSERT IGNORE INTO appointment_reminder_deliveries (appointment_id,branch_id,schedule_date,schedule_time,reminder_kind,channel,event_key,actor_role,actor_id)
 VALUES (?,?,?,?,?,?,?,?,?)`,[appt.id,branchId,appt.appointment_date,appt.appointment_time,kind,channel,eventKey,actor?.role||null,actor?.id||null])
 if(Number(claimed?.affectedRows)!==1)return {channel,status:'skipped',reason:'already_queued'}
 const [[row]]=await executor.query('SELECT id FROM appointment_reminder_deliveries WHERE event_key=? LIMIT 1',[eventKey])
 try {
  // Re-read before handing content to provider: never remind a cancelled visit.
  const latest=await loadAppointment(appt.id,branchId,executor)
  if(!isEligible(latest,new Date())||latest.appointment_date!==appt.appointment_date||latest.appointment_time!==appt.appointment_time){
   await executor.query("UPDATE appointment_reminder_deliveries SET status='skipped',completed_at=NOW() WHERE id=?",[row.id]);return {channel,status:'skipped',reason:'appointment_changed'}
  }
  const params={patient_name:latest.patient_name,doctor_name:latest.doctor_name,appointment_date:latest.appointment_date,appointment_time:latest.appointment_time,branch_name:latest.branch_name,branch_address:latest.branch_address,branch_phone:latest.branch_phone,service_name:latest.service_name}
  // Sensitive service details are omitted until a separate explicit disclosure consent exists.
  if(channel==='email')await sendAppointmentReminder({to:latest.email,...params})
  else await sendPatientAppointmentReminderSms({patientPhone:latest.phone,...params})
  await executor.query("UPDATE appointment_reminder_deliveries SET status='sent',completed_at=NOW() WHERE id=?",[row.id]);return {channel,status:'sent'}
 }catch(err){
  // Do not automatically retry ambiguous provider timeouts; avoid duplicated clinical messages.
  await executor.query("UPDATE appointment_reminder_deliveries SET status='failed',error_code=?,completed_at=NOW() WHERE id=?",[String(err.code||'DELIVERY_ERROR').slice(0,90),row.id]).catch(()=>{})
  return {channel,status:'failed',reason:'provider_error'}
 }
}
const sendManual=async({appointmentId,branchId,actor,channels,executor=db})=>{
 if(!Array.isArray(channels)||!channels.length||channels.some(x=>!['email','sms'].includes(x)))throw failure(400,'REMINDER_CHANNEL_INVALID','Choose Email or SMS.')
 const data=await loadAppointment(appointmentId,branchId,executor)
 if(!data)throw failure(404,'APPOINTMENT_NOT_FOUND','Appointment not found in this branch.')
 if(!isEligible(data))throw failure(409,'REMINDER_NOT_AVAILABLE','Only future, confirmed appointments can receive a reminder.')
 const settings=await getSettings(branchId,executor)
 const available=deliveryChannels(data,settings)
 const result=[]
 for(const channel of [...new Set(channels)]){
  if(!available.includes(channel))result.push({channel,status:'skipped',reason:unavailableReason(data,settings,channel)})
  else result.push(await sendOne({appointmentId,branchId,channel,kind:'manual',actor,executor}))
 }
 return result
}
const runAutomatic=async({executor=db,now=new Date()}={})=>{
 const from=getTodayDateOnly(now),to=addDaysDateOnly(from,2)
 const [rows]=await executor.query(`SELECT a.id,a.branch_id,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,a.appointment_time,
 rs.lead_hours,rs.email_enabled,rs.sms_enabled
 FROM appointments a JOIN branch_appointment_reminder_settings rs ON rs.branch_id=a.branch_id
 WHERE rs.enabled=1 AND a.status='confirmed' AND a.appointment_date BETWEEN ? AND ?`,[from,to])
 const results=[]
 for(const a of rows){
  const start=appointmentStartUtc(a.appointment_date,a.appointment_time)
  if(!start)continue
  const remaining=start.getTime()-now.getTime()
  if(remaining<=0||remaining>Number(a.lead_hours)*3600000)continue
  for(const channel of ['email','sms']){
   if(!a[`${channel}_enabled`])continue
   results.push(await sendOne({appointmentId:a.id,branchId:a.branch_id,channel,now,executor}))
  }
 }
 return results
}
module.exports={HOURS,checkSettings,getSettings,putSettings,loadAppointment,isEligible,sendManual,runAutomatic,sendOne}


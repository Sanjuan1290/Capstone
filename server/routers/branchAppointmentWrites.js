// New branch Admin appointments use the same slot validator/doctor-level lock
// as legacy booking, with branch ownership verified before scheduling.
const db=require('../db/connect')
const {validateAppointmentSlot,withAppointmentSlotLock}=require('../utils/appointmentSecurity')
const {loadBookingSettings,roundReservedDurationMinutes}=require('../utils/bookingPolicy')
const {getTodayDateOnly}=require('../utils/date')
const {getLastNoShowAppointment,makeNoShowWarningResponse}=require('../utils/appointmentPolicies')
const {writeAuditLog}=require('../utils/audit')
const {notifyRoles}=require('../utils/notifications')
const {broadcast}=require('../utils/sse')
const positive=v=>Number.isSafeInteger(Number(v))&&Number(v)>0
const fail=(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code})
async function createAppointment(req,res){
 const b=req.body||{}
 const patientId=Number(b.patient_id),doctorId=Number(b.doctor_id),serviceId=Number(b.requested_service_id)
 const type=String(b.clinic_type||''),date=String(b.appointment_date||'').slice(0,10),time=String(b.appointment_time||'')
 if(![patientId,doctorId,serviceId].every(positive)||!['medical','derma'].includes(type)||!/^(\d{4})-(\d{2})-(\d{2})$/.test(date)||!time)return res.status(400).json({message:'Patient, doctor, clinic, service, date and time are required.'})
 if(date<getTodayDateOnly())return res.status(400).json({message:'Cannot book an appointment in the past.'})
 const lastNoShow=await getLastNoShowAppointment(patientId)
 if(lastNoShow&&!b.override_no_show_warning)return res.status(409).json(makeNoShowWarningResponse(lastNoShow))
 const conn=await db.getConnection()
 let committed=false,resultId
 try{
  await conn.beginTransaction()
  // All foreign keys are checked in the transaction before the appointment is inserted.
  const [[patient]]=await conn.query('SELECT id,full_name FROM patients WHERE id=? LIMIT 1',[patientId])
  const [[doctor]]=await conn.query('SELECT id,full_name,clinic_type FROM doctors WHERE id=? AND branch_id=? AND is_active=1 FOR UPDATE',[doctorId,req.branchId])
  const [[service]]=await conn.query('SELECT id,service_name,clinic_type,default_price,average_duration_minutes FROM billing_service_catalog WHERE id=? AND branch_id=? AND is_active=1',[serviceId,req.branchId])
  if(!patient||!doctor||!service)throw fail(404,'BOOKING_REFERENCE_NOT_FOUND','Patient, doctor or service not available in this branch.')
  if(doctor.clinic_type!==type||![type,'all'].includes(service.clinic_type))throw fail(409,'CLINIC_MISMATCH','Doctor and service must match the selected clinic.')
  const settings=await loadBookingSettings(conn,req.branchId)
  const duration=Number(service.average_duration_minutes||60)
  const reserved=roundReservedDurationMinutes(duration,settings.booking_start_interval_minutes)
  resultId=await withAppointmentSlotLock({doctorId},async()=>{
   const [[duplicate]]=await conn.query(`SELECT id FROM appointments WHERE patient_id=? AND doctor_id=? AND branch_id=? AND status IN ('pending','confirmed','rescheduled','in-progress') LIMIT 1`,[patientId,doctorId,req.branchId])
   if(duplicate)throw fail(409,'DUPLICATE_APPOINTMENT','This patient already has an active appointment with this doctor.')
   await validateAppointmentSlot({doctorId,clinicType:type,date,time,durationMinutes:reserved,startIntervalMinutes:settings.booking_start_interval_minutes,executor:conn})
   const [r]=await conn.query(`INSERT INTO appointments (patient_id,doctor_id,clinic_type,requested_service_id,requested_service_name_snapshot,requested_service_price_snapshot,requested_service_duration_minutes_snapshot,reserved_duration_minutes_snapshot,reason,appointment_date,appointment_time,notes,appointment_source,branch_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[patientId,doctorId,type,serviceId,service.service_name,service.default_price,duration,reserved,String(b.reason||'').slice(0,255)||null,date,time,String(b.notes||'').slice(0,2000)||null,'admin_booking',req.branchId])
   return r.insertId
  },conn)
  await writeAuditLog({userId:req.user.id,userRole:req.adminContext?.account_role||'admin',action:'appointment.created',entityType:'appointment',entityId:resultId,branchId:req.branchId,newValues:{patient_id:patientId,doctor_id:doctorId,requested_service_id:serviceId,appointment_date:date,appointment_time:time},ipAddress:req.ip},conn)
  await conn.commit();committed=true
  res.status(201).json({message:'Appointment created.',id:resultId})
  // Notification failures must not make a successful booking look like a failure.
  notifyRoles(['admin','staff'],{branch_id:req.branchId,type:'appointment_booked',title:'New appointment',message:`${patient.full_name} booked with ${doctor.full_name} on ${date} at ${time}.`,reference_type:'appointment',reference_id:resultId}).catch(e=>console.error('[branch booking] notification failed',e.message))
  broadcast(['admin','staff'],'appointment_updated',{appointmentId:resultId,status:'pending'},{branchId:req.branchId})
 }catch(e){if(!committed)await conn.rollback().catch(()=>{})
  if(e.statusCode)return res.status(e.statusCode).json({code:e.code,message:e.message})
  throw e
 }finally{conn.release()}
}
function registerBranchAppointmentWrites(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]])
  router.post(`${prefix}/appointments`,...middle,requirePermission('appointments'),createAppointment)
}
module.exports={registerBranchAppointmentWrites,createAppointment}


// Public guest booking. This never creates a patient portal login session.
const crypto=require('crypto')
const db=require('../db/connect')
const {normalizePhilippinePhone}=require('../utils/phone')
const {validateBirthdate}=require('../utils/patientProfile')
const {validateAppointmentSlot,withAppointmentSlotLock}=require('../utils/appointmentSecurity')
const {loadBookingSettings,roundReservedDurationMinutes,buildConfirmationDeadlineSql}=require('../utils/bookingPolicy')
const {getTodayDateOnly}=require('../utils/date')
const {notifyRoles}=require('../utils/notifications')
const {broadcast}=require('../utils/sse')
const {writeAuditLog}=require('../utils/audit')
const {getOnlineBookingReadiness,applyBranchBookingOfferings}=require('../utils/bookingReadiness')

const invalid=(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code})
const ageAtVisit=(birthdate,date,reportedAge)=>{
  if(!birthdate)return Number(reportedAge)
  const [y,m,d]=String(birthdate).slice(0,10).split('-').map(Number)
  const [by,bm,bd]=String(date).split('-').map(Number)
  return by-y-(bm<m||(bm===m&&bd<d)?1:0)
}
const create=async(req,res)=>{
  const b=req.body||{}
  const name=String(b.full_name||'').trim()
  const gender=String(b.gender||'')
  const phone=normalizePhilippinePhone(b.phone)
  const birthdate=String(b.birthdate||'').trim()
  const age=Number(b.reported_age)
  const email=String(b.email||'').trim()||null
  const address=String(b.address||'').trim()||null
  const branchId=Number(b.branch_id),doctorId=Number(b.doctor_id),serviceId=Number(b.requested_service_id)
  const clinicType=String(b.clinic_type||'')
  const date=String(b.appointment_date||''),time=String(b.appointment_time||'')
  const reason=String(b.reason||'').trim(),otherDetail=String(b.reason_details||'').trim()
  if(!name||name.length>150)throw invalid(400,'NAME_REQUIRED','Enter a full name (up to 150 characters).')
  if(!['Male','Female','Other'].includes(gender))throw invalid(400,'GENDER_REQUIRED','Choose your gender.')
  if(!phone)throw invalid(400,'CONTACT_REQUIRED','A valid Philippine mobile number is required for guest booking.')
  if(birthdate){const error=validateBirthdate(birthdate);if(error)throw invalid(400,'INVALID_BIRTHDATE',error)}
  if(!birthdate&&(!/^\d{1,3}$/.test(String(b.reported_age))||!Number.isInteger(age)||age>120))throw invalid(400,'AGE_REQUIRED','Enter an age between 0 and 120, or provide your birthdate.')
  if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>150))throw invalid(400,'INVALID_EMAIL','Enter a valid email or leave it blank.')
  if(address&&address.length>500)throw invalid(400,'INVALID_ADDRESS','Address must be 500 characters or less.')
  if(b.consent_given!==true)throw invalid(400,'PRIVACY_CONSENT_REQUIRED','Accept the privacy notice before booking.')
  if(![branchId,doctorId,serviceId].every(id=>Number.isSafeInteger(id)&&id>0)||!['medical','derma'].includes(clinicType))throw invalid(400,'BOOKING_DETAILS_REQUIRED','Choose your clinic branch, doctor and service.')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!time||date<getTodayDateOnly())throw invalid(400,'BOOKING_TIME_REQUIRED','Choose a future appointment date and time.')
  if(!reason||reason.length>120)throw invalid(400,'REASON_REQUIRED','Choose a reason for your visit.')
  const storedReason=reason.toLowerCase()==='other'?`Other — ${otherDetail}`:reason
  if(reason.toLowerCase()==='other'&&(otherDetail.length<2||otherDetail.length>180))throw invalid(400,'REASON_DETAILS_REQUIRED','Enter a short reason for your visit.')
  const [[branch]]=await db.query('SELECT id,name,offers_medical,offers_derma FROM clinic_branches WHERE id=? AND is_active=1',[branchId])
  if(!branch||!Number(branch[clinicType==='medical'?'offers_medical':'offers_derma']))throw invalid(409,'BRANCH_NOT_BOOKABLE','This branch does not accept the selected type of appointment.')
  const ready=applyBranchBookingOfferings(await getOnlineBookingReadiness(db,branchId),branch)
  if(!ready[clinicType]?.bookable)throw invalid(409,'CLINIC_NOT_READY','This clinic type is not currently accepting online bookings.')
  const [[doctor]]=await db.query(`SELECT d.id,d.full_name,d.clinic_type FROM doctors d
    JOIN doctor_branch_assignments a ON a.doctor_id=d.id AND a.branch_id=? AND a.is_active=1
    WHERE d.id=? AND d.is_active=1`,[branchId,doctorId])
  const [[service]]=await db.query('SELECT id,service_name,clinic_type,default_price,average_duration_minutes FROM billing_service_catalog WHERE id=? AND branch_id=? AND is_active=1',[serviceId,branchId])
  if(!doctor||doctor.clinic_type!==clinicType||!service||![clinicType,'all'].includes(service.clinic_type))throw invalid(409,'SERVICE_OR_DOCTOR_UNAVAILABLE','The selected doctor or service is no longer available.')
  if(reason.toLowerCase()!=='other'){
    const [[allowed]]=await db.query(`SELECT id FROM appointment_reason_options WHERE branch_id=? AND is_active=1 AND (clinic_type=? OR clinic_type='all') AND LOWER(TRIM(label))=LOWER(?) LIMIT 1`,[branchId,clinicType,reason])
    if(!allowed)throw invalid(409,'VISIT_REASON_UNAVAILABLE','Choose one of the active reasons for your visit.')
  }
  const settings=await loadBookingSettings(db,branchId)
  const duration=Number(service.average_duration_minutes||60)
  const reserved=roundReservedDurationMinutes(duration,settings.booking_start_interval_minutes)
  const bookedAge=ageAtVisit(birthdate,date,age)
  if(bookedAge<0||bookedAge>120)throw invalid(400,'INVALID_PATIENT_AGE','The reported age or birthdate is invalid for the appointment date.')
  const lockKey=`carait:guest-phone:${crypto.createHash('sha256').update(phone).digest('hex').slice(0,32)}`
  let appointmentId=null, accessToken=null
  await withAppointmentSlotLock({doctorId},async()=>{
    const conn=await db.getConnection()
    let phoneLock=false,committed=false
    try {
      const [[lock]]=await conn.query('SELECT GET_LOCK(?,5) AS acquired',[lockKey])
      if(Number(lock?.acquired)!==1)throw invalid(409,'BOOKING_BUSY','This booking is being processed. Try again.')
      phoneLock=true
      await conn.beginTransaction()
      if(email){
        const [[existingEmail]]=await conn.query('SELECT id FROM patients WHERE LOWER(email)=LOWER(?) LIMIT 1',[email])
        if(existingEmail)throw invalid(409,'EXISTING_PATIENT_EMAIL','That email belongs to an existing patient. Sign in or contact the clinic.')
      }
      const variants=[phone,`0${phone.slice(2)}`]
      const [previous]=await conn.query(`SELECT id FROM patients WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,'+',''),'-',''),' ',''),'(',''),')','') IN (?,?) LIMIT 1 FOR UPDATE`,variants)
      if(previous.length)throw invalid(409,'EXISTING_PATIENT','This mobile number is already linked to a patient record. Sign in or contact the clinic for help with another booking.')
      await validateAppointmentSlot({doctorId,branchId,clinicType,date,time,durationMinutes:reserved,startIntervalMinutes:settings.booking_start_interval_minutes,enforceLeadTime:true,minLeadMinutes:settings.online_min_lead_minutes,executor:conn})
      const [patient]=await conn.query(`INSERT INTO patients
        (full_name,birthdate,reported_age,gender,sex,phone,address,email,password,is_walk_in,consent_given,consent_given_at,consent_method,receive_promotions,is_profile_complete)
        VALUES (?,?,?,?,?,?,?,?,NULL,1,1,NOW(),'guest_online',0,0)`,[name,birthdate||null,birthdate?null:age,gender,gender,phone,address,email])
      await conn.query('INSERT INTO patient_consents (patient_id,consent_type,ip_address) VALUES (?,?,?)',[patient.insertId,'data_processing',req.ip||null])
      const deadline=buildConfirmationDeadlineSql({date,time,cutoffMinutes:settings.pending_confirmation_cutoff_minutes})
      const [appointment]=await conn.query(`INSERT INTO appointments
        (patient_id,doctor_id,clinic_type,requested_service_id,requested_service_name_snapshot,requested_service_price_snapshot,
         requested_service_duration_minutes_snapshot,reserved_duration_minutes_snapshot,patient_age_at_visit,
         confirmation_deadline_at,reason,appointment_date,appointment_time,appointment_source,branch_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'guest_online',?)`,
        [patient.insertId,doctorId,clinicType,serviceId,service.service_name,service.default_price,duration,reserved,bookedAge,deadline,storedReason,date,time,branchId])
      appointmentId=appointment.insertId
      accessToken=crypto.randomBytes(32).toString('base64url')
      const tokenHash=crypto.createHash('sha256').update(accessToken).digest('hex')
      await conn.query('INSERT INTO guest_booking_access (appointment_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 90 DAY))',[appointmentId,tokenHash])
      await writeAuditLog({userRole:'guest',action:'appointment.guest_booked',entityType:'appointment',entityId:appointmentId,branchId,newValues:{guest:true,doctor_id:doctorId,service_id:serviceId,date,time},ipAddress:req.ip||null},conn)
      await conn.commit();committed=true
    }catch(error){
      if(!committed)await conn.rollback().catch(()=>{})
      if(error.code==='ER_DUP_ENTRY')throw invalid(409,'EXISTING_PATIENT_EMAIL','That contact information already belongs to a patient. Sign in or contact the clinic.')
      throw error
    }
    finally{if(phoneLock)await conn.query('SELECT RELEASE_LOCK(?)',[lockKey]).catch(()=>{});conn.release()}
  })
  // Staff/admin in-app notifications only. No patient email or SMS.
  notifyRoles(['admin','staff'],{branch_id:branchId,type:'appointment_booked',title:'New guest booking',message:`${name} requested ${date} at ${time} with ${doctor.full_name}.`,reference_type:'appointment',reference_id:appointmentId}).catch(()=>{})
  broadcast(['admin','staff'],'appointment_updated',{appointmentId,status:'pending'},{branchId})
  res.setHeader('Cache-Control','no-store')
  res.status(201).json({id:appointmentId,reference:`G-${appointmentId}`,access_token:accessToken,status:'pending',message:'Guest appointment request received.'})
}
const status=async(req,res)=>{
  const id=Number(req.params.id),token=String(req.get('x-guest-booking-token')||'')
  if(!Number.isSafeInteger(id)||id<1||token.length<30||token.length>128)return res.status(404).json({message:'Booking not found or secure access link invalid.'})
  const hash=crypto.createHash('sha256').update(token).digest('hex')
  const [[access]]=await db.query('SELECT appointment_id FROM guest_booking_access WHERE appointment_id=? AND token_hash=? AND expires_at>NOW() LIMIT 1',[id,hash])
  if(!access)return res.status(404).json({message:'Booking not found or secure access link expired.'})
  const [[row]]=await db.query(`SELECT a.id,a.status,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,a.appointment_time,
    a.requested_service_name_snapshot AS service_name,d.full_name AS doctor_name,b.name AS branch_name
    FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN clinic_branches b ON b.id=a.branch_id WHERE a.id=?`,[id])
  if(!row)return res.status(404).json({message:'Booking no longer exists.'})
  res.setHeader('Cache-Control','private, no-store')
  res.json({...row,reference:`G-${id}`,notification_method:'in_app_only'})
}
module.exports={create,status}

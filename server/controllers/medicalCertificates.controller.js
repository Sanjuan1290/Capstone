const db=require('../db/connect')
const {writeAuditLog}=require('../utils/audit')
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode})
const parse=value=>typeof value==='string'?JSON.parse(value):value
async function context(req,conn=db,lock=false){
 // Owning doctor AND selected branch are checked on every read and issuance.
 const [[visit]]=await conn.query(`SELECT a.id AS appointment_id,a.patient_id,a.doctor_id,a.branch_id,a.status,
 DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS consultation_date,a.appointment_time,
 p.full_name AS patient_name,DATE_FORMAT(p.birthdate,'%Y-%m-%d') AS birthdate,p.sex,p.address,
 d.full_name AS doctor_name,d.prc_license,d.specialty,
 b.name AS branch_name,b.address AS branch_address,b.phone AS branch_phone
 FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id
 JOIN clinic_branches b ON b.id=a.branch_id
 WHERE a.id=? AND a.doctor_id=? AND a.branch_id=?${lock?' FOR UPDATE':''}`,[req.params.appointmentId,req.user.id,req.branchId])
 if(!visit)throw fail(404,'Consultation not found in this branch for this doctor.')
 if(!['in-progress','completed'].includes(visit.status))throw fail(409,'Start the consultation before issuing a certificate.')
 const [[clinical]]=await conn.query('SELECT id,diagnosis FROM consultations WHERE appointment_id=? AND doctor_id=? AND branch_id=?',[visit.appointment_id,req.user.id,req.branchId])
 const [[saved]]=await conn.query('SELECT id,document_json,issued_at FROM medical_certificates WHERE appointment_id=? AND doctor_id=? AND branch_id=?',[visit.appointment_id,req.user.id,req.branchId])
 return {visit:{...visit,consultation_id:clinical?.id||null,diagnosis:clinical?.diagnosis||'',recommendation:'',remarks:''},certificate:saved?{id:saved.id,...parse(saved.document_json),issued_at:saved.issued_at}:null}
}
const handle=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await fn(req))}catch(e){if(e.statusCode)return res.status(e.statusCode).json({message:e.message});next(e)}}
const get=handle(req=>context(req))
const issue=handle(async req=>{
 const fields={}
 for(const [key,required] of [['diagnosis',true],['recommendation',true],['remarks',false]]){
  const value=String(req.body?.[key]||'').trim()
  if(value.length>4000||required&&!value)throw fail(400,`Enter ${key} (up to 4,000 characters).`)
  fields[key]=value
 }
 const conn=await db.getConnection()
 try{
  await conn.beginTransaction()
  const record=await context(req,conn,true)
  if(record.certificate){await conn.commit();return {certificate:record.certificate,replayed:true}}
  // Server time and verified visit/doctor details only. Issuance never touches billing.
  const document={...record.visit,...fields,issuance_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
  const [result]=await conn.query('INSERT INTO medical_certificates (branch_id,appointment_id,consultation_id,doctor_id,document_json) VALUES (?,?,?,?,?)',[req.branchId,record.visit.appointment_id,record.visit.consultation_id,req.user.id,JSON.stringify(document)])
  await writeAuditLog({userId:req.user.id,userRole:'doctor',branchId:req.branchId,action:'clinical.medical_certificate_issued',entityType:'medical_certificate',entityId:result.insertId,newValues:{appointment_id:record.visit.appointment_id},ipAddress:req.ip},conn)
  await conn.commit();return {certificate:{id:result.insertId,...document},replayed:false}
 }catch(e){await conn.rollback();throw e}finally{conn.release()}
})
module.exports={context,get,issue}

const db = require('../db/connect')
const {listEligiblePromotions} = require('./billingServicePromotions')
const {listBillingCatalog} = require('./billing')
const respond = async (res, branchId, date, catalog, patientId) => {
 const services=catalog.map(service=>({id:Number(service.id),service_name:service.service_name,default_price:Number(service.default_price||0),clinic_type:service.clinic_type,has_included_items:(service.materials||[]).length>0}))
 const promotions=await listEligiblePromotions(db,branchId,date,services.map(s=>s.id),patientId)
 res.json({services,promotions})
}
const forDoctor = async (req,res) => {
 const [[appt]]=await db.query('SELECT id,appointment_date,patient_id FROM appointments WHERE id=? AND doctor_id=? AND branch_id=? LIMIT 1',[req.params.appointmentId,req.user.id,req.branchId])
 if(!appt)return res.status(404).json({message:'Appointment not found in this branch.'})
 const catalog=await listBillingCatalog({branchId:req.branchId})
 return respond(res,req.branchId,appt.appointment_date,catalog,appt.patient_id)
}
const forBill = async (req,res) => {
 const [[bill]]=await db.query(`SELECT a.appointment_date,a.clinic_type,a.patient_id FROM billing_records b JOIN appointments a ON a.id=b.appointment_id AND a.branch_id=b.branch_id WHERE b.id=? AND b.branch_id=? LIMIT 1`,[req.params.id,req.branchId])
 if(!bill)return res.status(404).json({message:'Bill not found in this branch.'})
 const catalog=await listBillingCatalog({branchId:req.branchId,clinicType:bill.clinic_type})
 return respond(res,req.branchId,bill.appointment_date,catalog,bill.patient_id)
}
module.exports={forDoctor,forBill}


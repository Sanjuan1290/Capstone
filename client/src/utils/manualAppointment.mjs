// Only validated primitives cross the API boundary.
export function manualAppointmentPayload(input) {
 const result={}
 for(const field of ['patient_id','doctor_id','requested_service_id']) {
  const v=input?.[field]
  if(!['number','string'].includes(typeof v)||!Number.isSafeInteger(Number(v))||Number(v)<=0) throw new Error('Select a valid patient, doctor, and service.')
  result[field]=Number(v)
 }
 for(const [field,max] of Object.entries({clinic_type:10,appointment_date:10,appointment_time:8,reason:255,notes:2000})) {
  const v=input?.[field]??''
  if(typeof v!=='string'||v.length>max) throw new Error('Check the appointment details and try again.')
  result[field]=v.trim()
 }
 if(!['medical','derma'].includes(result.clinic_type)||!/^\d{4}-\d{2}-\d{2}$/.test(result.appointment_date)||!/^\d{2}:\d{2}(:\d{2})?$/.test(result.appointment_time)) throw new Error('Choose a valid clinic, date, and time.')
 if(input.override_no_show_warning!==undefined&&typeof input.override_no_show_warning!=='boolean') throw new Error('Confirm the missed appointment warning before continuing.')
 result.override_no_show_warning=input.override_no_show_warning===true
 return result
}

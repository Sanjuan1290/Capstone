const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const assert = require('node:assert/strict'), express = require('express')
require('express-async-errors')
const directory = require('../../utils/superadminPatientDirectory')
const root = path.resolve(__dirname, '../..')
const load = (file, deps) => { const module = { exports: {} }; vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'), { module, Date, console, require: name => deps[name] || {} }); return module.exports }
function harness() {
  const patients = [
    { id:1,full_name:'Registered Active',is_walk_in:0,password:'synthetic-hash',is_banned:0 },
    { id:2,full_name:'Registered Banned',is_walk_in:0,password:'synthetic-hash',is_banned:1 },
    { id:3,full_name:'Online Guest',is_walk_in:1,password:null,consent_method:'guest_online',is_banned:0 },
    { id:4,full_name:'Historical Guest',is_walk_in:1,password:null,consent_method:null,is_banned:0 },
    { id:5,full_name:'Walk In Only',is_walk_in:1,password:null,consent_method:'walk_in',is_banned:0 },
    { id:6,full_name:'Converted Walk In',is_walk_in:1,password:'synthetic-existing-credentials',is_banned:0 },
  ].map(row => ({ ...row, phone:'63917000000'+row.id,email:`patient${row.id}@example.test`,gender:'Female',address:'Synthetic address',created_at:'2026-11-12 08:00:00',session_version:1 }))
  const history = [{id:101,patient_id:3,status:'pending',appointment_source:'guest_online'}, {id:102,patient_id:4,status:'confirmed',appointment_source:'guest_online'}, {id:103,patient_id:1,status:'no_show',appointment_source:'online'}, {id:104,patient_id:3,status:'no_show',appointment_source:'guest_online'}, {id:105,patient_id:5,status:'no_show',appointment_source:'walk_in'}, {id:106,patient_id:6,status:'completed',appointment_source:'online'}]
  const calls=[],writes=[],audits=[]
  const registered = row => !Number(row.is_walk_in) || Boolean(String(row.password || '').trim())
  const visible = row => registered(row) || row.consent_method === 'guest_online' || history.some(visit => visit.patient_id === row.id && visit.appointment_source === 'guest_online')
  const filtered = (sql, values) => {
    assert.ok(sql.includes(directory.DIRECTORY_PATIENT_SQL), 'Patient queries must use the common visibility guard')
    let rows = patients.filter(visible)
    if(sql.includes(' AND '+directory.GUEST_PATIENT_SQL)) rows = rows.filter(row => !registered(row))
    if(sql.includes(' AND '+directory.REGISTERED_PATIENT_SQL)) rows = rows.filter(registered)
    if(sql.includes('AND COALESCE(p.is_banned, 0) = 0')) rows = rows.filter(row => !row.is_banned)
    if(sql.includes('AND COALESCE(p.is_banned, 0) = 1')) rows = rows.filter(row => row.is_banned)
    if(sql.includes('LIKE LOWER(?)')) { const term = values[0].slice(1,-1).toLowerCase(); rows = rows.filter(row => `${row.full_name} ${row.email} ${row.phone}`.toLowerCase().includes(term)) }
    return rows
  }
  const project = row => ({id:row.id,full_name:row.full_name,email:row.email,phone:row.phone,is_banned:row.is_banned,account_type:registered(row)?'registered':'guest',created_at:row.created_at,total_appointments:history.filter(visit=>visit.patient_id===row.id).length,no_show_count:history.filter(visit=>visit.patient_id===row.id&&visit.status==='no_show').length})
  const db = {query:async(sql,values=[])=>{
    calls.push({sql,values})
    if(sql.includes('AS total_patients')) {
      assert.ok(sql.includes(directory.DIRECTORY_PATIENT_SQL)); assert.ok(sql.includes("visible_patient.consent_method = 'guest_online'"))
      const rows=patients.filter(visible)
      return [[{total_patients:rows.length,total_registered:rows.filter(registered).length,total_guests:rows.filter(row=>!registered(row)).length,active_accounts:rows.filter(row=>registered(row)&&!row.is_banned).length,banned_accounts:rows.filter(row=>registered(row)&&row.is_banned).length,total_no_shows:history.filter(visit=>visit.status==='no_show'&&rows.some(row=>row.id===visit.patient_id)).length}]]
    }
    if(sql.startsWith('SELECT COUNT(*) AS total FROM patients')) return [[{total:filtered(sql,values).length}]]
    if(sql.includes('FROM patients p')) {
      let rows=filtered(sql,values)
      if(sql.includes('p.id = ?')) {
        const row=rows.find(row=>row.id===values[0])
        return [[row&&{...project(row),gender:row.gender,address:row.address,banned_at:row.banned_at||null,completed_appointments:history.filter(visit=>visit.patient_id===row.id&&visit.status==='completed').length}].filter(Boolean)]
      }
      const limit=values.at(-2),offset=values.at(-1)
      return [rows.sort((a,b)=>a.full_name.localeCompare(b.full_name)).slice(offset,offset+limit).map(project)]
    }
    if(sql.startsWith('SELECT COUNT(*) AS total FROM appointments')) return [[{total:history.filter(row=>row.patient_id===values[0]).length}]]
    if(sql.includes('FROM appointments a')) return [history.filter(row=>row.patient_id===values[0]).map(row=>({...row,appointment_date:'2026-11-13',appointment_time:'10:00 AM',clinic_type:'medical',service_name:'Synthetic Service',doctor_name:'Synthetic Doctor',branch_name:'Synthetic Branch'}))]
    if(sql.startsWith('UPDATE patients p')) {
      const row=patients.find(row=>row.id===values[3]&&registered(row)&&Number(row.is_banned)===values[4])
      if(!row)return [{affectedRows:0}]
      row.is_banned=values[0];row.session_version++;writes.push({id:row.id,banned:row.is_banned});return [{affectedRows:1}]
    }
    throw Error('Unexpected directory fixture SQL: '+sql)
  }}
  const auth = load('middlewares/auth.middleware.js',{'../db/connect':db,'../utils/sessionSecurity':{verifySessionToken:async token=>{
    if(token==='superadmin-session')return {id:9,role:'admin',account_role:'superadmin'}
    if(token==='branch-admin-session')return {id:8,role:'admin',account_role:'admin'}
    throw Object.assign(Error('Invalid synthetic session'),{statusCode:401})
  }}})
  const router=load('routers/superadminPatients.router.js',{express,'../db/connect':db,'../middlewares/auth.middleware':auth,'../utils/superadminPatientDirectory':directory,'../utils/audit':{writeAuditLog:async entry=>audits.push(entry)}})
  const app=express();app.use(express.json(),require('cookie-parser')());app.use('/api/superadmin/patients',router)
  return {app,patients,history,calls,writes,audits}
}
module.exports={harness}

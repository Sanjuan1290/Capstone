// Audit API with the original Admin_AuditLogs response contract.
const db=require('../db/connect')
const {sanitizeAuditValue,writeAuditLog}=require('../utils/audit')
const {randomBytes}=require('crypto')
const {areaCaseSql,normalizeArea,knownAreas}=require('../utils/auditArea')
const displayOutcomeSql = `CASE WHEN al.action='auth.login_failed' OR al.action LIKE 'security.%_blocked' THEN 'failure' WHEN al.action LIKE '%needs_review' OR al.action LIKE '%verification_requested' THEN 'pending' ELSE al.outcome END`
const parseDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))?String(s):null
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0
const pageOpts=(query,defaultLimit=20)=>{const page=Math.max(1,Math.min(100000,Number(query.page)||1)),limit=Math.min(100,Math.max(1,Number(query.limit)||defaultLimit));return {page,limit,offset:(page-1)*limit}}
const maybeJson=value=>{if(typeof value!=='string')return sanitizeAuditValue(value);try{return sanitizeAuditValue(JSON.parse(value))}catch{return '[REDACTED]'}}
const privacy=(row,req)=>({...row,ip_address:['admin','superadmin'].includes(req.user?.account_role || req.user?.role) ? row.ip_address : null,old_values:maybeJson(row.old_values),new_values:maybeJson(row.new_values)})
function filters(req,archiveId=null){
 const parts=['al.branch_id=?',archiveId===null?'al.archive_id IS NULL':'al.archive_id=?',"al.action NOT IN ('auth.mfa_challenge_sent','auth.mfa_verified')"]
 const values=[req.branchId,...(archiveId===null?[]:[archiveId])]
 for(const [param,operator] of [['start_date','>='],['end_date','<=']]){const value=parseDate(req.query[param]);if(value){parts.push(`DATE(al.created_at) ${operator} ?`);values.push(value)}}
 if(req.query.user_role){parts.push('al.user_role=?');values.push(String(req.query.user_role).slice(0,20))}
 if(req.query.entity_type){parts.push('al.entity_type=?');values.push(String(req.query.entity_type).slice(0,80))}
 if(req.query.outcome && ['success','failure','denied','pending'].includes(req.query.outcome)){parts.push(`${displayOutcomeSql}=?`);values.push(req.query.outcome)}
 if(req.query.action){parts.push('al.action LIKE ?');values.push(`%${String(req.query.action).slice(0,100)}%`)}
 if(req.query.area){const area=normalizeArea(String(req.query.area));parts.push(knownAreas.includes(area)?`(${areaCaseSql()})=?`:'1=0');if(knownAreas.includes(area))values.push(area)}
 if(req.query.search){parts.push(`(al.action LIKE ? OR al.entity_type LIKE ? OR al.entity_id LIKE ? OR COALESCE(al.actor_name_snapshot,ad.full_name,st.full_name,dr.full_name,pt.full_name,'System') LIKE ? OR al.target_name_snapshot LIKE ? OR inv.name LIKE ? OR ap.full_name LIKE ? OR bp.full_name LIKE ?)`);const needle=`%${String(req.query.search).slice(0,120)}%`;values.push(needle,needle,needle,needle,needle,needle,needle,needle)}
 return {where:`WHERE ${parts.join(' AND ')}`,values}
}
const joins=`LEFT JOIN admins ad ON al.user_role IN ('admin','superadmin') AND ad.id=al.user_id
 LEFT JOIN staff st ON al.user_role='staff' AND st.id=al.user_id
 LEFT JOIN doctors dr ON al.user_role='doctor' AND dr.id=al.user_id
 LEFT JOIN patients pt ON al.user_role='patient' AND pt.id=al.user_id
 LEFT JOIN appointments apt ON al.entity_type='appointment' AND apt.id=CAST(al.entity_id AS UNSIGNED) AND apt.branch_id=al.branch_id
 LEFT JOIN patients ap ON ap.id=apt.patient_id
 LEFT JOIN doctors adr ON adr.id=apt.doctor_id
 LEFT JOIN inventory inv ON al.entity_type='inventory_item' AND inv.id=CAST(al.entity_id AS UNSIGNED) AND inv.branch_id=al.branch_id
 LEFT JOIN supply_request_groups g ON al.entity_type='supply_request' AND g.id=CAST(al.entity_id AS UNSIGNED) AND g.branch_id=al.branch_id
 LEFT JOIN doctors gd ON gd.id=g.doctor_id
 LEFT JOIN billing_records bill ON al.entity_type='billing_record' AND bill.id=CAST(al.entity_id AS UNSIGNED) AND bill.branch_id=al.branch_id
 LEFT JOIN patients bp ON bp.id=bill.patient_id
 LEFT JOIN doctors bd ON bd.id=bill.doctor_id
 LEFT JOIN doctors sd ON al.entity_type IN ('doctor_schedule','doctor_unavailable_date') AND sd.id=CAST(SUBSTRING_INDEX(al.entity_id,':',1) AS UNSIGNED) AND sd.branch_id=al.branch_id`
const select=`al.id,al.user_role,al.user_id,al.action,al.entity_type,al.entity_id,al.old_values,al.new_values,al.created_at,
 al.ip_address,al.outcome,al.actor_name_snapshot,al.target_name_snapshot,al.request_id,al.correlation_id,al.failure_reason_code,
 ${areaCaseSql()} AS area_code, ${displayOutcomeSql} AS display_outcome,
 COALESCE(al.actor_name_snapshot,CASE WHEN ad.id IS NOT NULL AND ad.account_role='superadmin' THEN 'Super Admin' ELSE COALESCE(ad.full_name,st.full_name,dr.full_name,pt.full_name,'System') END) performed_by,
 ap.full_name appointment_patient_name,adr.full_name appointment_doctor_name,apt.appointment_date,apt.appointment_time,
 inv.name inventory_item_name,gd.full_name supply_doctor_name,g.destination_location supply_destination,g.reason supply_reason,g.resolution_note supply_resolution_note,
 sd.full_name schedule_doctor_name,bp.full_name billing_patient_name,bd.full_name billing_doctor_name`
const readPage=async(req,res,archiveId=null)=>{
 const {page,limit,offset}=pageOpts(req.query),{where,values}=filters(req,archiveId),dir=req.query.direction==='asc'?'ASC':'DESC'
 const [[count]]=await db.query(`SELECT COUNT(*) total FROM audit_logs al ${joins} ${where}`,values)
 const [rows]=await db.query(`SELECT ${select} FROM audit_logs al ${joins} ${where} ORDER BY al.created_at ${dir},al.id ${dir} LIMIT ? OFFSET ?`,[...values,limit,offset])
 const total=Number(count.total||0),totalPages=Math.max(1,Math.ceil(total/limit))
 res.json({items:rows.map(row=>privacy(row,req)),pagination:{page,limit,total,totalPages,hasPrev:page>1,hasNext:page<totalPages}})
}
// Privacy-minimized CSV export: one branch, at most 1000 events, never raw payloads/IP.
const csvCell=value=>{
 let s=String(value??'').replace(/[\r\n\t]/g,' ')
 if (/^[=+\-@]/.test(s)) s="'"+s // Prevent spreadsheet formula execution.
 return '"'+s.replace(/"/g,'""')+'"'
}
const exportSummary=async(req,res)=>{
 const rows=[]
 for(let page=1;page<=10;page++){
  let result=null
  await readPage({...req,query:{...req.query,page,limit:100}},{json(value){result=value}})
  rows.push(...result.items)
  if(!result.pagination.hasNext||rows.length>=1000)break
 }
 await writeAuditLog({userId:req.user.id,userRole:req.user.account_role||req.user.role||'admin',
  action:'audit.exported',entityType:'audit_log',branchId:req.branchId,ipAddress:req.ip,
  newValues:{row_count:rows.length,area_code:req.query.area||'all'},requestId:req.id||null})
 const columns=['Audit Event ID','Recorded At','Area','Action','Result','User ID','Performed By','Role','Record Type','Record ID']
 const lines=[columns.map(csvCell).join(',')]
 for(const r of rows){lines.push([r.id,r.created_at,r.area_code,r.action,r.display_outcome||r.outcome,r.user_id,r.performed_by,r.user_role,r.entity_type,r.entity_id].map(csvCell).join(','))}
 res.setHeader('Content-Type','text/csv; charset=utf-8')
 res.setHeader('Content-Disposition','attachment; filename="clinic-audit-summary.csv"')
 res.setHeader('Cache-Control','private, no-store')
 res.send('\ufeff'+lines.join('\r\n'))
}
const archives=async(req,res)=>{
 const {page,limit,offset}=pageOpts(req.query,10)
 const [[count]]=await db.query('SELECT COUNT(DISTINCT archive_id) total FROM audit_logs WHERE branch_id=? AND archive_id IS NOT NULL',[req.branchId])
 const [rows]=await db.query(`SELECT ar.id,ar.archive_code,ar.cutoff_at,ar.archived_at,COUNT(al.id) log_count,adm.full_name archived_by FROM audit_logs al JOIN audit_log_archives ar ON ar.id=al.archive_id LEFT JOIN admins adm ON adm.id=ar.archived_by_admin_id WHERE al.branch_id=? GROUP BY ar.id,ar.archive_code,ar.cutoff_at,ar.archived_at,adm.full_name ORDER BY ar.archived_at DESC LIMIT ? OFFSET ?`,[req.branchId,limit,offset])
 const total=Number(count.total||0);res.json({items:rows,pagination:{page,limit,total,totalPages:Math.max(1,Math.ceil(total/limit))}})
}
const detail=async(req,res)=>{if(!id(req.params.id))return res.status(400).json({message:'Invalid audit archive.'});const [[archive]]=await db.query(`SELECT ar.id,ar.archive_code,ar.cutoff_at,ar.archived_at,COUNT(al.id) log_count FROM audit_log_archives ar JOIN audit_logs al ON al.archive_id=ar.id AND al.branch_id=? WHERE ar.id=? GROUP BY ar.id`,[req.branchId,req.params.id]);if(!archive)return res.status(404).json({message:'Archive not found in your branch.'});const capture={status(c){this.statusCode=c;return this},json(v){this.result=v}};await readPage(req,capture,Number(req.params.id));res.json({archive,...capture.result})}
// Archive only this branch's audit rows; preserve them and keep the batch readable.
const archiveBranch=async(req,res)=>{
 const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-1)
 const connection=await db.getConnection()
 try{
  await connection.beginTransaction()
  const [[count]]=await connection.query('SELECT COUNT(*) total FROM audit_logs WHERE branch_id=? AND archive_id IS NULL AND created_at<?',[req.branchId,cutoff])
  if(!Number(count.total)){await connection.rollback();return res.json({log_count:0,message:'No audit events are old enough to archive.'})}
  const code=`BR${req.branchId}-${Date.now()}-${randomBytes(4).toString('hex')}`
  const [result]=await connection.query('INSERT INTO audit_log_archives (archive_code,cutoff_at,log_count,archived_by_admin_id) VALUES (?,?,?,?)',[code,cutoff,Number(count.total),req.user.id])
  const [updated]=await connection.query('UPDATE audit_logs SET archive_id=?,archived_at=NOW() WHERE branch_id=? AND archive_id IS NULL AND created_at<?',[result.insertId,req.branchId,cutoff])
  await connection.query('UPDATE audit_log_archives SET log_count=? WHERE id=?',[updated.affectedRows,result.insertId])
  await writeAuditLog({userId:req.user.id,userRole:'admin',action:'audit.archived',entityType:'audit_archive',entityId:result.insertId,branchId:req.branchId,newValues:{log_count:updated.affectedRows},ipAddress:req.ip},connection)
  await connection.commit()
  res.json({id:result.insertId,log_count:updated.affectedRows,message:'Branch audit events archived.'})
 }catch(error){await connection.rollback();throw error}finally{connection.release()}
}
const registerBranchAudit=(router,{requireSuper,branchContext,requirePermission})=>{
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  router.get(`${prefix}/audit-logs/export`,...middle,requirePermission('audit_logs'),exportSummary)
  router.get(`${prefix}/audit-logs`,...middle,requirePermission('audit_logs'),(req,res)=>readPage(req,res))
  router.get(`${prefix}/audit-logs/archive`,...middle,requirePermission('audit_logs'),archives)
  router.post(`${prefix}/audit-logs/archive`,...middle,requirePermission('audit_logs'),archiveBranch)
  router.get(`${prefix}/audit-logs/archive/:id`,...middle,requirePermission('audit_logs'),detail)
  // Archive creation / permanent deletion requires its own organization-level
  // retention policy. Do not delegate the old global destructive controller.
 }
}
module.exports={registerBranchAudit,readPage,archives,detail,filters}


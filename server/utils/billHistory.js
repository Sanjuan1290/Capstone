const db=require('../db/connect')
const {getBillingRecordWithItems}=require('./billing')
const fail=(statusCode,message)=>Object.assign(new Error(message),{statusCode})
function activityTimeline(bill,{chargeRequests=[],discountRequests=[],attempts=[],refunds=[],audit=[],failedEvents=[]}={}){
 const events=[]
 const add=(key,at,label,detail='',actor=null)=>{if(at)events.push({key,at,label,detail,actor})}
 add('created',bill.created_at,'Bill created')
 add('confirmed',bill.finalized_at,'Bill confirmed')
 for(const r of chargeRequests){add(`charge-${r.id}`,r.created_at,'Charge reduction requested',`${r.requested_amount}: ${r.reason}`,r.requester_name||r.requester_role);add(`decision-${r.id}`,r.resolved_at,r.admin_note==='Authorized direct adjustment'?'Direct charge reduction':`Charge reduction ${r.status}`,r.admin_note||r.reason,r.admin_note==='Cancelled by requester'?r.requester_name:r.reviewer_name)}
 for(const r of discountRequests){add(`discount-${r.id}`,r.created_at,'Additional discount requested',r.reason,r.requester_name);add(`discount-decision-${r.id}`,r.resolved_at,`Additional discount ${r.status}`,r.admin_note,r.reviewer_name)}
 for(const a of attempts){add(`attempt-${a.id}`,a.created_at,'QR Ph attempt started');if(a.status!=='creating')add(`attempt-status-${a.id}`,a.updated_at,`QR Ph ${a.status}`,a.error_code||'')}
 for(const p of bill.payments||[]){add(`payment-${p.id}`,p.paid_at,'Payment recorded',`${p.receipt_number||''} · ${p.amount} · ${p.payment_method}`);add(`void-${p.id}`,p.voided_at,'Payment voided',p.void_reason)}
 for(const r of refunds)add(`refund-${r.id}`,r.refunded_at,'Refund recorded',`${r.amount} · ${r.reason||''}`,r.reviewer_name)
 for(const e of failedEvents)add(`failed-event-${e.event_id}`,e.created_at,'QR Ph payment failed',e.failure_message||e.error_code||'Provider did not include a failure reason.')
 for(const a of audit)add(`audit-${a.id}`,a.created_at,String(a.action).replace(/^billing\./,'').replaceAll('_',' '),'',a.actor_name_snapshot||a.user_role)
 return events.sort((a,b)=>String(a.at).localeCompare(String(b.at))||a.key.localeCompare(b.key))
}
async function readBillHistory(billingId,branchId,executor=db){
 const [[owner]]=await executor.query('SELECT id FROM billing_records WHERE id=? AND branch_id=?',[billingId,branchId])
 if(!owner)throw fail(404,'Bill not found in this branch.')
 const bill=await getBillingRecordWithItems(billingId,executor)
 if(!bill)throw fail(404,'Bill not found.')
 const [chargeRequests]=await executor.query(`SELECT ca.*,COALESCE(d.full_name,s.full_name,requester.full_name) AS requester_name,reviewer.full_name AS reviewer_name FROM billing_charge_adjustments ca
 LEFT JOIN doctors d ON ca.requester_role='doctor' AND d.id=ca.requester_user_id
 LEFT JOIN staff s ON ca.requester_role='staff' AND s.id=ca.requester_user_id
 LEFT JOIN admins requester ON ca.requester_role IN ('admin','superadmin') AND requester.id=ca.requester_user_id
 LEFT JOIN admins reviewer ON reviewer.id=ca.approved_by_admin_id WHERE ca.billing_id=? AND ca.branch_id=? ORDER BY ca.created_at,ca.id`,[billingId,branchId])
 const [discountRequests]=await executor.query(`SELECT r.*,s.full_name AS requester_name,a.full_name AS reviewer_name FROM billing_adjustment_requests r JOIN billing_records b ON b.id=r.billing_id AND b.branch_id=? LEFT JOIN staff s ON s.id=r.staff_id LEFT JOIN admins a ON a.id=r.resolved_by_admin_id WHERE r.billing_id=? ORDER BY r.created_at,r.id`,[branchId,billingId])
 const [attempts]=await executor.query('SELECT id,status,amount_centavos,error_code,created_at,updated_at,expires_at,settled_payment_id FROM payment_gateway_attempts WHERE billing_id=? AND branch_id=? ORDER BY created_at,id',[billingId,branchId])
 const [failedEvents]=await executor.query(`SELECT e.event_id,e.error_code,e.failure_message,e.created_at,e.attempt_id FROM payment_gateway_webhook_events e JOIN payment_gateway_attempts a ON a.id=e.attempt_id AND a.branch_id=? WHERE a.billing_id=? AND e.event_type='payment.failed' ORDER BY e.created_at,e.event_id`,[branchId,billingId])
 const [refunds]=await executor.query(`SELECT r.*,a.full_name AS reviewer_name FROM billing_payment_refunds r JOIN billing_records b ON b.id=r.billing_id AND b.branch_id=? LEFT JOIN admins a ON a.id=r.refunded_by_admin_id WHERE r.billing_id=? ORDER BY r.refunded_at,r.id`,[branchId,billingId])
 const [audit]=await executor.query(`SELECT id,action,user_role,actor_name_snapshot,created_at FROM audit_logs WHERE branch_id=? AND entity_type IN ('billing_record','billing') AND entity_id=? ORDER BY created_at,id`,[branchId,String(billingId)])
 const details={chargeRequests,discountRequests,attempts,refunds,audit,failedEvents}
 return {...bill,...details,timeline:activityTimeline(bill,details)}
}
module.exports={readBillHistory,activityTimeline}

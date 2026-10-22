// Domain-oriented notifications: aliases preserve existing server event names.
export const EVENT_TOPICS={
 'appointment_updated':'appointment.updated', 'queue_updated':'queue.updated',
 'consultation_saved':'appointment.updated','billing_paid':'billing.updated',
 'billing_finalized':'billing.updated','billing_reopened':'billing.updated',
 'billing_voided':'billing.updated','billing_payment_changed':'billing.updated',
 'billing_adjustment_resolved':'billing.updated','billing_adjustment_requested':'billing.updated',
 'cashier_closed':'billing.updated','cashier_reopened':'billing.updated',
 'inventory_updated':'inventory.updated','supply_request_resolved':'inventory.updated',
 'promotion_updated':'promotion.updated','schedule_updated':'schedule.updated',
 'notification_created':'notifications.updated',
}
export const normalizeClinicEvent=name=>EVENT_TOPICS[name]||String(name||'')
export const clinicEventAffects=(name,topics)=>{
 const canonical=normalizeClinicEvent(name)
 return canonical==='stream.reconnected'||topics.includes(canonical)||topics.includes('*')
}
export const sameActiveBranch=(data,pathname='')=>{
 const selected=String(pathname).match(/^\/superadmin\/branches\/(\d+)(?=\/|$)/)
 if(!selected||!data?.branch_id)return true
 return Number(selected[1])===Number(data.branch_id)
}

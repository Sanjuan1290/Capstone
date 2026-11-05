// A failed attempt belongs to the payment method, never to the whole bill.
const paymentViews={
 pending:"b.status IN ('draft','pending','ready','partially_paid') AND EXISTS (SELECT 1 FROM consultations completed WHERE completed.id=b.consultation_id AND completed.branch_id=b.branch_id AND completed.status='finalized')",
 failed:"b.status IN ('ready','partially_paid') AND b.total_amount>COALESCE(pay.paid_amount,0) AND (gateway.status='failed' OR (gateway.status IN ('creating','pending','review') AND gateway_failure.event_id IS NOT NULL))",
 paid:"b.status='paid' AND COALESCE(pay.paid_amount,0)>=b.total_amount"
}
const paymentViewPredicate=view=>Object.hasOwn(paymentViews,view)?paymentViews[view]:''
const gatewayJoin=`LEFT JOIN (SELECT billing_id,branch_id,MAX(id) AS id FROM payment_gateway_attempts GROUP BY billing_id,branch_id) latest_gateway ON latest_gateway.billing_id=b.id AND latest_gateway.branch_id=b.branch_id
 LEFT JOIN payment_gateway_attempts gateway ON gateway.id=latest_gateway.id
 LEFT JOIN (SELECT e.*,ROW_NUMBER() OVER(PARTITION BY e.attempt_id ORDER BY e.created_at DESC,e.event_id DESC) AS failure_order FROM payment_gateway_webhook_events e WHERE e.event_type='payment.failed') gateway_failure ON gateway_failure.attempt_id=gateway.id AND gateway_failure.failure_order=1`
const paymentViewColumns=`gateway.status AS attempt_status,COALESCE(gateway_failure.failure_message,gateway_failure.error_code,gateway.error_code) AS failure_reason,CASE WHEN gateway.status IN ('creating','pending','review','failed') THEN gateway_failure.event_id ELSE NULL END AS failed_event_id,COALESCE(gateway_failure.created_at,gateway.created_at) AS attempt_date,'qrph' AS attempted_method,
 (SELECT GROUP_CONCAT(receipt_number ORDER BY paid_at SEPARATOR ', ') FROM billing_payments receipts WHERE receipts.billing_id=b.id AND receipts.status='completed') AS receipt_numbers,
 (SELECT MAX(paid_at) FROM billing_payments latest_pay WHERE latest_pay.billing_id=b.id AND latest_pay.status='completed') AS latest_paid_at,
 (SELECT GROUP_CONCAT(service_name SEPARATOR ', ') FROM billing_items services WHERE services.billing_id=b.id AND services.item_type='service') AS services_performed,
 (SELECT COUNT(*) FROM billing_charge_adjustments changes WHERE changes.billing_id=b.id AND changes.branch_id=b.branch_id AND changes.status='pending') AS pending_charge_requests`
module.exports={paymentViewPredicate,gatewayJoin,paymentViewColumns}

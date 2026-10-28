'use strict'
// Fixed identifiers and aggregate counts only. No clinical/financial row values.
const queries=[]
for(const [table,field,target] of [
  ['appointments','doctor_id','doctors'],['queue','doctor_id','doctors'],['queue','appointment_id','appointments'],
  ['consultations','appointment_id','appointments'],['consultations','doctor_id','doctors'],
  ['billing_records','appointment_id','appointments'],['billing_records','consultation_id','consultations'],
  ['inventory_batches','inventory_id','inventory'],['payment_gateway_attempts','billing_id','billing_records'],
  ['supply_requests','doctor_id','doctors'],['supply_requests','inventory_id','inventory'],['appointments','promotion_id','clinic_promotions'],
])queries.push({name:`branch:${table}.${field}`,sql:`SELECT COUNT(*) AS violations FROM ${table} c JOIN ${target} p ON p.id=c.${field} WHERE c.branch_id<>p.branch_id`})
for(const table of ['consultations','billing_records','queue'])queries.push({name:`patient:${table}.appointment`,sql:`SELECT COUNT(*) AS violations FROM ${table} c JOIN appointments a ON a.id=c.appointment_id WHERE c.patient_id<>a.patient_id`})
for(const [table,col] of [['inventory','stock'],['inventory','stock_base'],['inventory_batches','quantity'],['inventory_location_batches','quantity'],['inventory_location_stock','quantity']])queries.push({name:`negative:${table}.${col}`,sql:`SELECT COUNT(*) AS violations FROM ${table} WHERE ${col}<0`})
queries.push(
  {name:'inventory_stock_vs_batches',sql:'SELECT COUNT(*) AS violations FROM inventory i LEFT JOIN (SELECT inventory_id,SUM(quantity) quantity FROM inventory_batches WHERE archived_at IS NULL GROUP BY inventory_id) b ON b.inventory_id=i.id WHERE ABS(i.stock_base-COALESCE(b.quantity,0))>0.0001'},
  {name:'batch_overallocation',sql:'SELECT COUNT(*) AS violations FROM inventory_batches b JOIN (SELECT batch_id,SUM(quantity) quantity FROM inventory_location_batches GROUP BY batch_id) l ON l.batch_id=b.id WHERE l.quantity>b.quantity+0.0001'},
  {name:'location_summary_mismatch',sql:'SELECT COUNT(*) AS violations FROM inventory_location_stock s LEFT JOIN (SELECT location_id,inventory_id,SUM(quantity) quantity FROM inventory_location_batches GROUP BY location_id,inventory_id) b ON b.location_id=s.location_id AND b.inventory_id=s.inventory_id WHERE ABS(s.quantity-COALESCE(b.quantity,0))>0.0001'},
  {name:'bill_total_arithmetic',sql:'SELECT COUNT(*) AS violations FROM billing_records WHERE ABS(total_amount-GREATEST(0,ROUND(subtotal-discount_amount,2)))>0.009'},
  {name:'bill_item_subtotal',sql:'SELECT COUNT(*) AS violations FROM billing_records b LEFT JOIN (SELECT billing_id,SUM(line_total) subtotal FROM billing_items GROUP BY billing_id) i ON i.billing_id=b.id WHERE ABS(b.subtotal-COALESCE(i.subtotal,0))>0.009'},
  {name:'bill_overcollection',sql:"SELECT COUNT(*) AS violations FROM billing_records b JOIN (SELECT billing_id,SUM(amount-COALESCE(refund_amount,0)) collected FROM billing_payments WHERE status='completed' GROUP BY billing_id) p ON p.billing_id=b.id WHERE p.collected>b.total_amount+0.009"},
  {name:'paid_bill_with_balance',sql:"SELECT COUNT(*) AS violations FROM billing_records b LEFT JOIN (SELECT billing_id,SUM(amount-COALESCE(refund_amount,0)) collected FROM billing_payments WHERE status='completed' GROUP BY billing_id) p ON p.billing_id=b.id WHERE b.status='paid' AND ABS(b.total_amount-COALESCE(p.collected,0))>0.009"},
  {name:'refund_overpayment',sql:'SELECT COUNT(*) AS violations FROM billing_payments WHERE refund_amount<0 OR refund_amount>amount'},
  {name:'gateway_active_owner',sql:'SELECT COUNT(*) AS violations FROM payment_gateway_attempts WHERE active_bill_id IS NOT NULL AND active_bill_id<>billing_id'},
  {name:'gateway_review_requires_attention',sql:"SELECT COUNT(*) AS violations FROM payment_gateway_attempts WHERE status='review'"},
  {name:'gateway_succeeded_payment_link',sql:"SELECT COUNT(*) AS violations FROM payment_gateway_attempts a LEFT JOIN billing_payments p ON p.id=a.settled_payment_id WHERE a.status='succeeded' AND (p.id IS NULL OR p.billing_id<>a.billing_id)"},
  {name:'consultation_completed_status',sql:"SELECT COUNT(*) AS violations FROM consultations c JOIN appointments a ON a.id=c.appointment_id WHERE c.status='finalized' AND a.status<>'completed'"},
)
module.exports=queries

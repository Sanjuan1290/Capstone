const cents=value=>Math.round((Number(value)||0)*100)
const net=payment=>payment?.status==='completed'?Math.max(0,cents(payment.amount)-cents(payment.refund_amount)):0
const timestamp=value=>Date.parse(typeof value==='string'&&/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/.test(value)?value.replace(' ','T')+'+08:00':value)
export function receiptPaymentTimeline(bill,payment){
 const recorded=(bill.payments||[]).some(row=>Number(row.id)===Number(payment.id))
 if(!recorded)return {previous_paid:null,paid_through:Number(bill.paid_amount)||0,balance:Number(bill.balance_amount)||0}
 const at=timestamp(payment.paid_at)
 const previous=(bill.payments||[]).filter(row=>timestamp(row.paid_at)<at||timestamp(row.paid_at)===at&&Number(row.id)<Number(payment.id)).reduce((sum,row)=>sum+net(row),0)
 const paid=previous+net(payment)
 return {previous_paid:previous/100,paid_through:paid/100,balance:Math.max(0,cents(bill.total_amount)-paid)/100}
}

export function billingPortal(pathname='') {
 const workspace=pathname.match(/^\/superadmin\/branches\/(\d+)(?:\/|$)/)
 if(workspace)return {base:`/superadmin/branches/${workspace[1]}`,api:`/api/branches/workspace/${workspace[1]}/legacy`,admin:true,superadmin:true}
 if(pathname.startsWith('/staff'))return {base:'/staff',api:'/api/staff',admin:false,superadmin:false}
 return {base:'/admin',api:'/api/branches/my/legacy',admin:true,superadmin:false}
}
export function billPaymentLabel(bill) {
 if(['voided','refunded'].includes(bill.status))return bill.status==='voided'?'Voided':'Refunded'
 const balance=Number(bill.balance_amount??Math.max(0,Number(bill.total_amount)-Number(bill.paid_amount)))
 if(bill.status==='paid'&&balance===0)return 'Paid in full'
 if(balance>0&&Number(bill.paid_amount)>0)return 'Partially paid'
 if(Number(bill.pending_charge_requests)>0)return 'Awaiting charge approval'
 if(['creating','pending'].includes(bill.attempt_status))return 'Processing QR payment'
 if(bill.attempt_status==='review')return 'Payment needs review'
 if(bill.attempt_status==='failed'&&balance>0)return 'Payment attempt failed'
 if(['draft','pending'].includes(bill.status))return 'Awaiting checkout review'
 return 'Awaiting payment'
}

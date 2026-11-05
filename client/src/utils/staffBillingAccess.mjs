// Navigation never grants a financial action; the API and route guards do.
export const STAFF_BILLING_TABS=Object.freeze(['payments','history'])
export const staffBillingBasePath=({checkout=false}={})=>checkout?'/staff/checkout':'/staff/billing'
export function resolveStaffBillingTab(requested,{checkout=false,billing=false}={}){
 if(!checkout&&!billing)return null
 return ['history','transactions'].includes(requested)?'history':'payments'
}
export function staffBillingVisibleTabs({checkout=false,billing=false}={}){
 return checkout||billing?[...STAFF_BILLING_TABS]:[]
}

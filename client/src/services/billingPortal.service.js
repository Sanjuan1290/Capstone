import {billingPortal} from '../utils/billingPortal.mjs'
export function billingPortalApi(pathname) {
 const portal=billingPortal(pathname)
 const request=async(path,options={})=>{
  const response=await fetch(`${portal.api}${path}`,{credentials:'include',...options,headers:{'Content-Type':'application/json',...(portal.superadmin?{'X-Admin-Portal':'superadmin'}:{}),...options.headers}})
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw Object.assign(new Error(data.message||'Unable to load billing.'),data)
  return data
 }
 return {portal,list:params=>request(`/billing?${new URLSearchParams(params)}`),history:id=>request(`/billing/${id}/history`)}
}

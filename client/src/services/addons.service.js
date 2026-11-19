import { getAdminApiBase } from './admin.service'
const request=async(url,body,method='POST')=>{
 const res=await fetch(url,{credentials:'include',...(body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})})
 const data=await res.json()
 if(!res.ok)throw new Error(data.message||'Add-on request failed.')
 return data
}
export const listAddons=()=>request(`${getAdminApiBase()}/billing/addons`)
export const saveAddon=(body,id)=>request(`${getAdminApiBase()}/billing/addons${id?`/${id}`:''}`,body,id?'PUT':'POST')
const billBase=()=>window.location.pathname.startsWith('/staff')?'/api/staff':getAdminApiBase()
export const getBillAddons=id=>request(`${billBase()}/billing/${id}/addons`)
export const confirmBillAddon=(id,body)=>request(`${billBase()}/billing/${id}/addons`,body)

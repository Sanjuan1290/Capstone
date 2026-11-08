import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {NavLink} from 'react-router-dom'
import {MdAdd,MdRefresh,MdBusiness,MdEdit,MdChevronRight,MdWarningAmber,MdPhone,MdEmail,MdLocationOn,MdMedicalServices} from 'react-icons/md'
import {fetchJson,PageHead,Card,Pill,Modal,Field,Banner,Empty,Loading,SearchInput,PrimaryButton,SecondaryButton} from './shared'
import {useToast} from '../../../components/ui/ToastProvider'
import {normalizePhilippinePhone,validateBranchForm} from '../../../utils/philippinePhone'

const initial=()=>({name:'',address:'',phone:'',email:'',offers_medical:true,offers_derma:true,is_active:true,copy_setup_from_branch_id:null,setup_mode:'standard'})
const messageOf=(error,fallback)=>error?.message||fallback
const countLabel=(value)=>Number(value||0).toLocaleString('en-PH')

export const SuperAdminBranches=()=>{
 const toast=useToast()
 const [rows,setRows]=useState([]),[ready,setReady]=useState([])
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[readinessError,setReadinessError]=useState('')
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[clinicFilter,setClinicFilter]=useState('all'),[readinessFilter,setReadinessFilter]=useState('all')
 const [modal,setModal]=useState(null),[form,setForm]=useState(initial),[saving,setSaving]=useState(false),[fieldErrors,setFieldErrors]=useState({})
 const [confirm,setConfirm]=useState(null),[readinessDetails,setReadinessDetails]=useState(null),[createdBranch,setCreatedBranch]=useState(null)
 const savingRef=useRef(false)

 const load=useCallback(async()=>{
  setLoading(true);setError('');setReadinessError('')
  const [branchesResult,readinessResult]=await Promise.allSettled([fetchJson('/'),fetchJson('/analytics/readiness')])
  if(branchesResult.status==='fulfilled'&&Array.isArray(branchesResult.value))setRows(branchesResult.value)
  else setError(messageOf(branchesResult.reason,'Unable to load clinic branches.'))
  if(readinessResult.status==='fulfilled'&&Array.isArray(readinessResult.value))setReady(readinessResult.value)
  else {setReady([]);setReadinessError(messageOf(readinessResult.reason,'Branch readiness is temporarily unavailable.'))}
  setLoading(false)
 },[])
 useEffect(()=>{load()},[load])

 const check=useCallback(id=>ready.find(v=>Number(v.id)===Number(id)),[ready])
 const displayed=useMemo(()=>rows.filter(branch=>{
  const active=Number(branch.is_active)===1
  const readiness=check(branch.id)
  const query=`${branch.name||''} ${branch.address||''} ${branch.phone||''} ${branch.email||''}`.toLowerCase()
  const statusMatches=filter==='all'||(filter==='active'&&active)||(filter==='inactive'&&!active)
  const clinicMatches=clinicFilter==='all'||(clinicFilter==='medical'&&Number(branch.offers_medical)===1)||(clinicFilter==='derma'&&Number(branch.offers_derma)===1)
  const readinessMatches=readinessFilter==='all'||(readinessFilter==='ready'&&Boolean(readiness?.ready))||(readinessFilter==='needs'&&active&&readiness&&!readiness.ready)||(readinessFilter==='unavailable'&&(Boolean(readinessError)||!readiness))||(readinessFilter==='inactive'&&!active)
  return statusMatches&&clinicMatches&&readinessMatches&&query.includes(search.trim().toLowerCase())
 }),[rows,ready,check,filter,clinicFilter,readinessFilter,readinessError,search])
 const counts=useMemo(()=>({total:rows.length,active:rows.filter(b=>Number(b.is_active)===1).length,inactive:rows.filter(b=>Number(b.is_active)!==1).length,needs:ready.filter(b=>Number(b.is_active)===1&&!b.ready).length,bookable:ready.filter(b=>Number(b.is_active)===1&&b.ready).length}),[rows,ready])

 const open=(branch=null)=>{
  setForm(branch?{...branch,name:branch.name||'',address:branch.address||'',phone:branch.phone||'',email:branch.email||'',offers_medical:Boolean(Number(branch.offers_medical)),offers_derma:Boolean(Number(branch.offers_derma)),is_active:Boolean(Number(branch.is_active))}:initial())
  setFieldErrors({});setError('');setModal(branch?.id||'new')
 }
 const closeForm=()=>{if(!saving){setModal(null);setFieldErrors({});setError('')}}
 const save=async event=>{
  event.preventDefault()
  if(savingRef.current)return
  const validation=validateBranchForm(form)
  setFieldErrors(validation)
  if(Object.keys(validation).length)return
  let normalizedPhone
  try{normalizedPhone=normalizePhilippinePhone(form.phone)}catch(e){setFieldErrors(prev=>({...prev,phone:e.message}));return}
  savingRef.current=true;setSaving(true);setError('')
  const editing=modal!=='new'
  const payload={...form,name:String(form.name||'').trim(),address:String(form.address||'').trim()||null,phone:normalizedPhone,email:String(form.email||'').trim().toLowerCase()||null}
  try{
   const result=await fetchJson(editing?`/${modal}`:'/',{method:editing?'PUT':'POST',body:JSON.stringify(payload)})
   if(!editing&&result?.id)setCreatedBranch({id:result.id,name:payload.name,is_active:payload.is_active})
   setModal(null);setFieldErrors({});toast.success(editing?'Branch details updated successfully.':'Clinic branch created successfully.')
   await load()
  }catch(e){
   setError(messageOf(e,'Unable to save branch details. Please try again.'))
   if(e?.field)setFieldErrors(prev=>({...prev,[e.field]:e.message}))
  }finally{savingRef.current=false;setSaving(false)}
 }
 const setActive=async branch=>{
  if(!branch||savingRef.current)return
  savingRef.current=true;setSaving(true);setError('')
  try{
   const active=!Boolean(Number(branch.is_active))
   await fetchJson(`/${branch.id}/status`,{method:'PATCH',body:JSON.stringify({is_active:active})})
   toast.success(active?'Branch reactivated successfully.':'Branch deactivated. Historical records were preserved.')
   setConfirm(null);await load()
  }catch(e){setError(messageOf(e,'Unable to update branch status. Please try again.'));setConfirm(null)}
  finally{savingRef.current=false;setSaving(false)}
 }

 return <div className="space-y-6">
  <PageHead title="Clinic Branches" description="Manage clinic locations, contact information, services and online booking readiness." action={<><SecondaryButton onClick={load} disabled={loading}><MdRefresh/> Refresh</SecondaryButton><PrimaryButton onClick={()=>open()}><MdAdd/> Create Branch</PrimaryButton></>}/>

  <div className="grid gap-3 grid-cols-2 xl:grid-cols-5">
   <Card><p className="text-xs font-semibold text-slate-500">Total Branches</p><p className="mt-1 text-2xl font-black tabular-nums">{countLabel(counts.total)}</p></Card>
   <Card><p className="text-xs font-semibold text-slate-500">Active</p><p className="mt-1 text-2xl font-black text-emerald-700 tabular-nums">{countLabel(counts.active)}</p></Card>
   <Card><p className="text-xs font-semibold text-slate-500">Inactive</p><p className="mt-1 text-2xl font-black text-slate-600 tabular-nums">{countLabel(counts.inactive)}</p></Card>
   <Card><p className="text-xs font-semibold text-slate-500">Ready for Booking</p><p className="mt-1 text-2xl font-black text-emerald-700 tabular-nums">{readinessError?'—':countLabel(counts.bookable)}</p></Card>
   <Card><p className="text-xs font-semibold text-slate-500">Needs Setup</p><p className="mt-1 text-2xl font-black text-amber-700 tabular-nums">{readinessError?'—':countLabel(counts.needs)}</p></Card>
  </div>

  <Card>
   <div className="grid gap-3 lg:grid-cols-4">
    <div className="lg:col-span-2"><SearchInput value={search} onChange={setSearch} placeholder="Search branch name, address or contact details"/></div>
    <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Branch Status</span><select aria-label="Filter branch status" className="form-control w-full" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
    <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Clinic Type</span><select aria-label="Filter clinic type" className="form-control w-full" value={clinicFilter} onChange={e=>setClinicFilter(e.target.value)}><option value="all">All Clinic Types</option><option value="medical">General Medicine</option><option value="derma">Dermatology</option></select></label>
    <label className="block lg:col-span-2"><span className="mb-1 block text-xs font-semibold text-slate-600">Booking Readiness</span><select aria-label="Filter booking readiness" className="form-control w-full" value={readinessFilter} onChange={e=>setReadinessFilter(e.target.value)}><option value="all">All Readiness</option><option value="ready">Ready for Booking</option><option value="needs">Needs Setup</option><option value="inactive">Inactive</option><option value="unavailable">Status Unavailable</option></select></label>
    <div className="flex items-end text-xs text-slate-500 lg:col-span-2">Showing {displayed.length} of {rows.length} branches · {counts.active} active · {counts.inactive} inactive</div>
   </div>
  </Card>

  {error&&<Banner onRetry={load}>{error}</Banner>}
  {readinessError&&<Banner type="warning" onRetry={load} title="Booking readiness unavailable">Branch contact and status information can still be viewed. Readiness indicators will return when the service responds. {readinessError}</Banner>}
  {loading?<Loading cards={3}/>:displayed.length?<div className="grid gap-4 xl:grid-cols-2">{displayed.map(branch=>{
   const readiness=check(branch.id),active=Number(branch.is_active)===1
   const services=[Number(branch.offers_medical)===1?'General Medicine':null,Number(branch.offers_derma)===1?'Dermatology':null].filter(Boolean)
   const readinessLabel=readinessError?'Status unavailable':!readiness?'Status unavailable':!active?'Inactive':readiness.ready?'Ready for Booking':'Needs Setup'
   const readinessTone=readinessError||!readiness?'neutral':!active?'neutral':readiness.ready?'success':'warning'
   return <Card key={branch.id}>
    <div className="flex items-start gap-3">
     <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><MdBusiness size={24}/></span>
     <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-slate-900 break-words">{branch.name}</h2><Pill tone={active?'success':'neutral'}>{active?'Active':'Inactive'}</Pill></div>
      <div className="mt-2 space-y-1.5 text-sm text-slate-600">
       <p className="flex items-start gap-2"><MdLocationOn className="mt-0.5 shrink-0 text-slate-400"/><span>{branch.address||'Address not provided'}</span></p>
       <p className="flex items-center gap-2"><MdPhone className="shrink-0 text-slate-400"/><span>{branch.phone||'Contact number not provided'}</span></p>
       <p className="flex items-center gap-2 min-w-0"><MdEmail className="shrink-0 text-slate-400"/><span className="break-all">{branch.email||'Email not provided'}</span></p>
      </div>
     </div>
    </div>
    <div className="my-4 grid grid-cols-3 divide-x rounded-xl bg-slate-50 py-3 text-center"><div><strong className="block text-xl tabular-nums">{countLabel(branch.admins)}</strong><span className="text-xs text-slate-500">Admins</span></div><div><strong className="block text-xl tabular-nums">{countLabel(branch.doctors)}</strong><span className="text-xs text-slate-500">Doctors</span></div><div><strong className="block text-xl tabular-nums">{countLabel(branch.staff)}</strong><span className="text-xs text-slate-500">Staff</span></div></div>
    <div className="flex flex-wrap items-center gap-2"><Pill tone={readinessTone}>{readinessLabel}</Pill><span className="inline-flex items-center gap-1 text-xs text-slate-600"><MdMedicalServices className="text-slate-400"/>{services.join(' · ')||'No clinic services enabled'}</span></div>
    {active&&readiness&&!readiness.ready&&Array.isArray(readiness.missing)&&readiness.missing.length>0&&<div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"><p>{readiness.missing.join(' · ')}</p><button type="button" onClick={()=>setReadinessDetails({branch,readiness})} className="mt-1 font-bold underline">Review setup requirements</button></div>}
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
     {active?<NavLink className="button-primary inline-flex items-center gap-1" to={`/superadmin/branches/${branch.id}`}>Manage Branch <MdChevronRight/></NavLink>:<button type="button" disabled aria-label={`Manage ${branch.name} (inactive)`} title="Reactivate the branch to manage it" className="button-primary inline-flex cursor-not-allowed items-center gap-1 opacity-50">Manage Branch <MdChevronRight/></button>}
     <SecondaryButton disabled={!active} title={!active?'Reactivate the branch to edit details':undefined} onClick={()=>open(branch)}><MdEdit/> Edit Details</SecondaryButton>
     <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600"><span>{active?'Active':'Inactive'}</span><input type="checkbox" role="switch" aria-label={`Change ${branch.name} availability`} disabled={saving} checked={active} onChange={()=>setConfirm(branch)} className="h-5 w-9 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed"/></label>
    </div>
   </Card>
  })}</div>:!error?<Card><Empty icon={MdBusiness} title={search||filter!=='all'||clinicFilter!=='all'||readinessFilter!=='all'?'No matching branches':'No branches yet'} description={search||filter!=='all'||clinicFilter!=='all'||readinessFilter!=='all'?'Try changing your search or filters.':'Create the first branch to begin managing clinic operations.'} action={<PrimaryButton onClick={()=>open()}><MdAdd/> Create Branch</PrimaryButton>}/></Card>:null}

  <Modal open={modal!==null} title={modal==='new'?'Create Clinic Branch':'Edit Branch Details'} description="Set up this location. Each branch has its own appointments, doctors and inventory." wide onClose={closeForm}>
   <form onSubmit={save} className="space-y-5">
    <section className="space-y-3"><div><h3 className="text-sm font-bold text-slate-900">01. Branch Information</h3><p className="text-xs text-slate-500">Enter the official name and physical location of this clinic.</p></div>
     <Field label="Branch Name" required><input id="branch-name" className="form-control mt-1" maxLength={180} required value={form.name} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name?'branch-name-error':undefined} onChange={e=>{setForm(f=>({...f,name:e.target.value}));setFieldErrors(v=>({...v,name:''}))}}/>{fieldErrors.name&&<span id="branch-name-error" className="mt-1 block text-xs text-rose-700" role="alert">{fieldErrors.name}</span>}</Field>
     <Field label="Complete Address" help="Building, street, barangay, city or municipality, province and postal code."><textarea id="branch-address" className="form-control mt-1 min-h-24 resize-y" maxLength={255} value={form.address||''} aria-invalid={Boolean(fieldErrors.address)} aria-describedby={fieldErrors.address?'branch-address-error':undefined} placeholder="Enter the complete branch address" onChange={e=>{setForm(f=>({...f,address:e.target.value}));setFieldErrors(v=>({...v,address:''}))}}/>{fieldErrors.address&&<span id="branch-address-error" className="mt-1 block text-xs text-rose-700" role="alert">{fieldErrors.address}</span>}</Field>
    </section>
    <section className="space-y-3 border-t border-slate-100 pt-4"><div><h3 className="text-sm font-bold text-slate-900">02. Contact Information</h3><p className="text-xs text-slate-500">Use contact details patients can use to reach this branch.</p></div>
     <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Contact Number" help="Philippine mobile or landline number. Example: 0917 123 4567 or (02) 8123 4567."><input id="branch-phone" type="tel" inputMode="tel" autoComplete="tel" className="form-control mt-1" maxLength={32} value={form.phone||''} aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone?'branch-phone-error':undefined} placeholder="09XX XXX XXXX or +63..." onChange={e=>{setForm(f=>({...f,phone:e.target.value}));setFieldErrors(v=>({...v,phone:''}))}}/>{fieldErrors.phone&&<span id="branch-phone-error" className="mt-1 block text-xs text-rose-700" role="alert">{fieldErrors.phone}</span>}</Field>
      <Field label="Email Address" help="Optional. Use a valid email address."><input id="branch-email" type="email" autoComplete="email" className="form-control mt-1" maxLength={160} value={form.email||''} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email?'branch-email-error':undefined} placeholder="branch@example.com" onChange={e=>{setForm(f=>({...f,email:e.target.value}));setFieldErrors(v=>({...v,email:''}))}}/>{fieldErrors.email&&<span id="branch-email-error" className="mt-1 block text-xs text-rose-700" role="alert">{fieldErrors.email}</span>}</Field>
     </div>
    </section>
    {modal==='new'&&<section className="space-y-3 border-t border-slate-100 pt-4"><div><h3 className="text-sm font-bold text-slate-900">03. Initial Branch Setup</h3><p className="text-xs text-slate-500">Choose how the new branch should be initialized.</p></div>
     <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4"><legend className="px-1 text-sm font-bold text-slate-900">Setup Template</legend>{[
      ['blank','Start with Blank Clinic Setup','Core storage, booking and payment records only. Add clinical categories and services later.'],
      ['standard','Use Standard Clinic Setup (Recommended)','Default service categories, visit reasons and cancellation reasons, plus core settings. No services or prices copied.'],
      ['copy','Copy Setup from Existing Branch','Copy eligible services, prices, categories, reasons and discounts. Services that need consumables are inactive until reviewed.'],
     ].map(([value,title,description])=><label key={value} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${form.setup_mode===value?'border-emerald-500 bg-emerald-50':'border-slate-200'}`}><input type="radio" name="setup-mode" className="mt-1" checked={form.setup_mode===value} onChange={()=>setForm(f=>({...f,setup_mode:value,copy_setup_from_branch_id:null}))}/><span className="min-w-0"><strong className="block text-sm text-slate-900">{title}</strong><span className="mt-1 block text-xs text-slate-600">{description}</span></span></label>)}
      {form.setup_mode==='copy'&&<Field label="Source Branch" required help="Only active branches can be copied. Patient records, staff, stock quantities, receipts and payment credentials are never copied."><select className="form-control mt-1" required value={form.copy_setup_from_branch_id||''} onChange={e=>setForm(f=>({...f,copy_setup_from_branch_id:e.target.value||null}))}><option value="">Select an active source branch</option>{rows.filter(b=>Number(b.is_active)).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
      <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600" role="status"><strong>Setup preview:</strong> {form.setup_mode==='blank'?'Essential technical settings and empty clinical catalogs.':form.setup_mode==='standard'?'Stockrooms, booking/payment defaults, categories, visit reasons and cancellation reasons.':'Core settings plus selected branch catalogs, service prices and discount presets. Consumables need local reassignment.'} Assign staff and doctors and complete readiness checks before taking bookings.</div>
     </fieldset>
    </section>}
    <section className="space-y-3 border-t border-slate-100 pt-4"><div><h3 className="text-sm font-bold text-slate-900">{modal==='new'?'04.':'03.'} Services Offered</h3><p className="text-xs text-slate-500">Choose the clinic departments available at this location.</p></div>
     <div className="grid gap-3 sm:grid-cols-2"><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={Boolean(form.offers_medical)} onChange={e=>setForm(f=>({...f,offers_medical:e.target.checked}))} className="mt-1 h-4 w-4 accent-emerald-600"/><span><strong className="block text-sm">General Medicine</strong><span className="text-xs text-slate-500">Medical consultations and general medical services.</span></span></label><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={Boolean(form.offers_derma)} onChange={e=>setForm(f=>({...f,offers_derma:e.target.checked}))} className="mt-1 h-4 w-4 accent-emerald-600"/><span><strong className="block text-sm">Dermatology</strong><span className="text-xs text-slate-500">Dermatologic consultations and procedures.</span></span></label></div>
     {modal==='new'&&<div className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div><p className="text-sm font-semibold">Branch Status</p><p className="text-xs text-slate-500">{form.is_active?'Active — branch setup can proceed.':'Inactive — patient bookings will be blocked.'}</p></div><label className="inline-flex items-center gap-2 text-sm"><span>{form.is_active?'Active':'Inactive'}</span><input aria-label="Branch active" type="checkbox" role="switch" checked={Boolean(form.is_active)} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} className="h-5 w-9 accent-emerald-600"/></label></div>}
    </section>
    {error&&<Banner title="Branch was not saved">{error}</Banner>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4"><SecondaryButton disabled={saving} onClick={closeForm}>Cancel</SecondaryButton><button className="button-primary" type="submit" disabled={saving}>{saving?'Saving…':modal==='new'?'Create Branch':'Save Changes'}</button></div>
   </form>
  </Modal>

  <Modal open={Boolean(createdBranch)} title="Branch Created — Complete Setup" description="Review the branch configuration before opening it for bookings." onClose={()=>setCreatedBranch(null)}><div className="space-y-3"><p className="text-sm text-slate-600">Configure each area for {createdBranch?.name} before enabling online booking. Inactive branches must be reactivated from Clinic Branches first.</p>{createdBranch?.is_active&&[['Assign branch administrator and doctors','accounts'],['Review services and pricing','system-setup/billing/services'],['Configure doctor schedules','doctor-schedules'],['Verify inventory locations','inventory'],['Review booking readiness','']].map(([label,path])=><NavLink key={label} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700 hover:border-emerald-500" onClick={()=>setCreatedBranch(null)} to={`/superadmin/branches/${createdBranch.id}${path?'/'+path:''}`}>{label}<MdChevronRight/></NavLink>)}{createdBranch&&!createdBranch.is_active&&<Banner type="info">This branch is inactive. Reactivate it using the switch on the Clinic Branches page before accessing setup actions.</Banner>}<div className="flex justify-end border-t pt-3"><SecondaryButton onClick={()=>setCreatedBranch(null)}>Close</SecondaryButton></div></div></Modal>

  <Modal open={Boolean(readinessDetails)} title={readinessDetails?.branch?.name||'Branch Readiness'} description="Check what is needed before this branch can accept online bookings." onClose={()=>setReadinessDetails(null)}><div className="space-y-4"><div className="flex items-center justify-between"><span className="font-semibold">Booking Readiness</span><Pill tone={readinessDetails?.readiness?.ready?'success':'warning'}>{readinessDetails?.readiness?.ready?'Ready':'Setup Incomplete'}</Pill></div><p className="text-sm text-slate-600">An active branch can still be unavailable for online booking if doctors, schedules or services are not configured.</p>{(readinessDetails?.readiness?.missing||[]).length?<ul className="space-y-2">{readinessDetails.readiness.missing.map(item=><li className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" key={item}><MdWarningAmber className="mt-0.5 shrink-0 text-amber-700"/><span>{item}</span></li>)}</ul>:<Banner type="success" title="Ready for Online Booking">No missing setup requirements were reported.</Banner>}<div className="flex justify-end gap-2 border-t pt-4"><SecondaryButton onClick={()=>setReadinessDetails(null)}>Close</SecondaryButton>{readinessDetails?.branch&&<NavLink onClick={()=>setReadinessDetails(null)} to={`/superadmin/branches/${readinessDetails.branch.id}`} className="button-primary">Manage Branch</NavLink>}</div></div></Modal>

  <Modal open={Boolean(confirm)} onClose={()=>setConfirm(null)} title={`${Number(confirm?.is_active)?'Deactivate':'Reactivate'} Branch?`} description={confirm?.name}><div className="space-y-4">{Number(confirm?.is_active)?<Banner type="warning" title="Operational impact">New bookings will be blocked for this branch. Historical appointments, medical records, billing and stock history remain intact. Branches with upcoming appointments must resolve them before deactivation.</Banner>:<Banner type="info">This branch will be enabled. Online booking remains unavailable until doctors, schedules and services are configured.</Banner>}<div className="flex justify-end gap-2"><SecondaryButton onClick={()=>setConfirm(null)}>Cancel</SecondaryButton><button className={`button-secondary ${Number(confirm?.is_active)?'!bg-rose-600 !text-white':''}`} disabled={saving} onClick={()=>setActive(confirm)}>{saving?'Working…':Number(confirm?.is_active)?'Deactivate Branch':'Reactivate Branch'}</button></div></div></Modal>
 </div>
}

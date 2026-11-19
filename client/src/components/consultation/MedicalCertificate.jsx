import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../ui/Modal'
import { getMedicalCertificate, issueMedicalCertificate } from '../../services/doctor.service'
import { certificateParagraphs, downloadMedicalCertificate, renderMedicalCertificatePages } from '../../utils/medicalCertificatePdf.mjs'

function CertificatePreview({certificate}){
 const [view,setView]=useState({pages:[],error:''})
 useEffect(()=>{
  let active=true
  renderMedicalCertificatePages(certificate).then(pages=>{
   if(active)setView({pages:pages.map(page=>page.toDataURL('image/png')),error:''})
  }).catch(error=>{if(active)setView({pages:[],error:error.message})})
  return ()=>{active=false}
 },[certificate])
 return <article aria-label="Certificate preview" aria-busy={!view.pages.length&&!view.error} className="overflow-hidden rounded border border-slate-200 bg-slate-100 p-2">
  {view.error?<p role="alert" className="p-4 text-rose-700">{view.error}</p>:!view.pages.length?<p className="p-4 text-sm">Preparing certificate preview…</p>:view.pages.map((page,index)=><img key={index} src={page} alt={`Medical certificate page ${index+1} of ${view.pages.length}`} className="mx-auto mb-2 block h-auto w-full max-w-[816px] bg-white shadow-sm last:mb-0"/>)}
  <div className="sr-only">{certificateParagraphs(certificate).map(([text],index)=><p key={index}>{text}</p>)}</div>
 </article>
}
export default function MedicalCertificate({appointmentId,diagnosis=''}){
 const [open,setOpen]=useState(false),[record,setRecord]=useState(null),[form,setForm]=useState({diagnosis:'',recommendation:'',remarks:''}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false)
 const submitting=useRef(false)
 const show=async()=>{setOpen(true);setLoading(true);setError('');setPreview(false);setRecord(null);try{const data=await getMedicalCertificate(appointmentId);setRecord(data);setForm({diagnosis:data.certificate?.diagnosis||diagnosis||data.visit.diagnosis||'',recommendation:data.certificate?.recommendation||'',remarks:data.certificate?.remarks||''})}catch(e){setError(e.message)}finally{setLoading(false)}}
 const issue=async()=>{if(submitting.current)return;submitting.current=true;setBusy(true);setError('');try{const data=await issueMedicalCertificate(appointmentId,form);setRecord(r=>({...r,certificate:data.certificate}));setPreview(true)}catch(e){setError(e.message)}finally{submitting.current=false;setBusy(false)}}
 const download=async()=>{setBusy(true);setError('');try{await downloadMedicalCertificate(record.certificate)}catch(e){setError(e.message||'PDF could not be downloaded.')}finally{setBusy(false)}}
 const certificate=record?.certificate
 const display=useMemo(()=>certificate||{...record?.visit,...form},[certificate,record,form])
 return <><button type="button" className="button-secondary" onClick={show}>Issue Medical Certificate</button><Modal open={open} onClose={()=>!busy&&setOpen(false)} closeDisabled={busy} title="Medical Certificate" description="Issue at the doctor’s discretion. The clinic downloads and delivers the PDF to the patient; billing is handled independently." size="lg"><div className="space-y-4">{error&&<p role="alert" className="text-rose-700">{error}</p>}{loading?<p>Loading consultation details…</p>:record&&<><div className="rounded-xl bg-slate-50 p-3 text-sm"><p><strong>Patient:</strong> {display.patient_name}</p><p><strong>Issuing doctor:</strong> {display.doctor_name} · PRC {display.prc_license||'Not recorded'}</p><p><strong>Original consultation:</strong> {display.consultation_date}</p><p><strong>Issuance date:</strong> {display.issuance_date||'Today, on issuance (Philippine time)'}</p></div>{!certificate&&<>{['diagnosis','recommendation','remarks'].map(key=><label key={key} className="block form-label capitalize">{key}{key!=='remarks'?' *':''}<textarea maxLength={4000} rows={3} className="form-control mt-1" value={form[key]} onChange={e=>{setForm({...form,[key]:e.target.value});setPreview(false)}}/></label>)}<button className="button-secondary" onClick={()=>setPreview(true)}>Preview Certificate</button></>}{(preview||certificate)&&<CertificatePreview key={certificate?.id||'preview'} certificate={display}/>}{certificate?<div className="space-y-3"><p className="text-sm text-emerald-800">Issued certificate MC-{certificate.id}. The saved document retains the original visit and issuance details.</p><button className="button-primary" disabled={busy} onClick={download}>{busy?'Preparing PDF…':'Download PDF'}</button></div>:<button className="button-primary" disabled={busy||!preview||!form.diagnosis.trim()||!form.recommendation.trim()} onClick={issue}>{busy?'Issuing…':'Issue Medical Certificate'}</button>}</>}</div></Modal></>
}

import {useCallback,useEffect,useState} from 'react'
import {useLocation} from 'react-router-dom'
import {getBillingTaxSettings,saveBillingTaxSettings} from '../../services/admin.service'

export default function BillingTaxSettings(){
  const location=useLocation(),staff=location.pathname.startsWith('/staff')
  const [settings,setSettings]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false)
  const load=useCallback(async()=>{
    setError('')
    try{setSettings(await getBillingTaxSettings())}catch(e){setError(e.message||'Unable to load tax settings.')}
  },[])
  useEffect(()=>{if(!staff)void load()},[load,staff])
  if(staff)return <p className="rounded-2xl border bg-white p-5">Tax settings are managed by authorized Admins.</p>
  const update=patch=>{setSettings(current=>({...current,...patch}));setSaved(false)}
  const save=async event=>{
    event.preventDefault();setSaving(true);setError('');setSaved(false)
    try{
      const result=await saveBillingTaxSettings({tax_name:settings.tax_name.trim(),tax_percentage:settings.tax_percentage,expected_version:settings.version})
      setSettings(result);setSaved(true)
    }catch(e){setError(e.message||'Unable to save tax settings.')}finally{setSaving(false)}
  }
  return <section className="max-w-3xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label="Tax Settings">
    <div><h2 className="text-xl font-bold text-slate-900">Tax Settings</h2><p className="mt-1 text-sm text-slate-500">Applies to new bills. Set the percentage to 0 for no tax.</p></div>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}{!settings&&<button type="button" className="ml-2 underline" onClick={load}>Try Again</button>}</p>}
    {!settings?!error&&<p role="status" className="text-sm text-slate-500">Loading tax settings...</p>:<form onSubmit={save} className="space-y-5">
      <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2">
        <label><span className="form-label">Tax Name</span><input required className="form-control mt-1.5" maxLength={80} value={settings.tax_name} onChange={event=>update({tax_name:event.target.value})}/></label>
        <label><span className="form-label">Tax Percentage</span><input required className="form-control mt-1.5" type="number" min="0" max="100" step="0.01" value={settings.tax_percentage} onChange={event=>update({tax_percentage:event.target.value})}/></label>
      </fieldset>
      <button type="submit" className="button-primary" disabled={saving}>{saving?'Saving...':'Save Tax Settings'}</button>
      {saved&&<p role="status" className="text-sm text-emerald-700">Tax settings saved.</p>}
    </form>}
  </section>
}

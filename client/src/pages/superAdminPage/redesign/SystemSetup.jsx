import { useEffect, useState } from 'react'
import { PageHead, Banner, Card } from './shared'

const ENDPOINT = '/api/admin/system-setup/doctor-notifications'
const CREDITS_ENDPOINT = '/api/admin/system-setup/sms-credits'
const SEMAPHORE_URL = 'https://semaphore.co/'
const initial = { send_email: true, send_sms: false }
const loadJson = async (options) => {
  const response = await fetch(ENDPOINT, {
    credentials: 'include',
    ...options,
    headers: { 'X-Admin-Portal':'superadmin', ...(options?.body ? {'Content-Type':'application/json'} : {}) },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`)
  return data
}

export const SuperAdminSystemSetup = () => {
  const [settings,setSettings] = useState(initial)
  const [original,setOriginal] = useState(initial)
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [message,setMessage] = useState('')
  const [credits,setCredits] = useState(null)
  const [creditsLoading,setCreditsLoading] = useState(false)
  const [creditsError,setCreditsError] = useState('')
  useEffect(() => {
    let active = true
    loadJson().then(data => {
      if (!active) return
      const current={send_email:Boolean(data.send_email),send_sms:Boolean(data.send_sms)}
      setSettings(current);setOriginal(current)
    }).catch(err => {if(active)setError(err.message)}).finally(() => {if(active)setLoading(false)})
    return () => {active=false}
  },[])
  const loadCredits = async (refresh = false) => {
    setCreditsLoading(true);setCreditsError('')
    try {
      const response=await fetch(`${CREDITS_ENDPOINT}${refresh?'?refresh=1':''}`,{
        credentials:'include',headers:{'X-Admin-Portal':'superadmin'},
      })
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.message||'SMS credits could not be loaded.')
      setCredits(result)
    }catch(err){setCreditsError(err.message)}
    finally{setCreditsLoading(false)}
  }
  useEffect(()=>{void loadCredits()},[])
  const dirty = settings.send_email!==original.send_email || settings.send_sms!==original.send_sms
  const save = async (event) => {
    event.preventDefault()
    if (!dirty || saving) return
    setSaving(true);setError('');setMessage('')
    try {
      const data=await loadJson({method:'PUT',body:JSON.stringify(settings)})
      const current={send_email:Boolean(data.send_email),send_sms:Boolean(data.send_sms)}
      setSettings(current);setOriginal(current);setMessage(data.message || 'Settings saved.')
    } catch (err) {setError(err.message)}
    finally {setSaving(false)}
  }
  return <div className="space-y-6">
    <PageHead title="System Setup" description="Choose how doctors are notified when a clinic confirms an appointment. These settings apply to all branches." />
    <Card title="Doctor Appointment Notifications" description="The doctor will still receive an in-app notification when an appointment is confirmed.">
      <form onSubmit={save} className="space-y-4">
        {[
          ['send_email','Email doctor','Send an email to the doctor when an appointment is confirmed.'],
          ['send_sms','SMS doctor','Send an SMS to the doctor when an appointment is confirmed. SMS may cost money.'],
        ].map(([field,title,description]) => <label key={field} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
          <span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{title}</span><span className="mt-1 block text-xs text-slate-600">{description}</span></span>
          <input type="checkbox" role="switch" aria-label={title} disabled={loading||saving||Boolean(error&&loading)} checked={settings[field]} onChange={event=>{setSettings(current=>({...current,[field]:event.target.checked}));setMessage('')}} className="h-5 w-5 shrink-0 accent-teal-700" />
        </label>)}
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Semaphore SMS Credits">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Semaphore SMS Credits</h3>
              <p className="mt-1 text-xs text-slate-600">Credits shared by clinic SMS messages, including patient verification and appointment messages.</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-500">Remaining credits</p>
              <p className="text-2xl font-black text-slate-900" aria-live="polite">{creditsLoading&&!credits?'Loading…':credits?Number(credits.credit_balance).toLocaleString('en-PH'):'—'}</p>
            </div>
          </div>
          {credits?.stale && <p className="mt-2 text-xs text-amber-800" role="status">Showing the last known balance. Semaphore is temporarily unavailable.</p>}
          {credits?.checked_at && <p className="mt-2 text-xs text-slate-500">Last checked: {new Date(credits.checked_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>}
          {creditsError && <p className="mt-2 text-xs text-rose-700" role="alert">{creditsError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="button-secondary" onClick={()=>{void loadCredits(true)}} disabled={creditsLoading}>{creditsLoading?'Checking…':'Refresh Balance'}</button>
            <a href={SEMAPHORE_URL} target="_blank" rel="noopener noreferrer" className="button-secondary inline-flex items-center justify-center">Buy SMS Credits on Semaphore</a>
          </div>
          <p className="mt-2 text-xs text-slate-500">Balance checks are limited to reduce API requests. OTP messages may use more than one credit.</p>
        </section>
        <p className="text-xs text-slate-500">Only new confirmations are affected. Already confirmed appointments are not sent again. Messages contain date, time and branch; doctors open the portal for patient details.</p>
        {loading && <p role="status" className="text-sm text-slate-600">Loading settings…</p>}
        {error && <Banner type="error" title="Could not save or load settings">{error}</Banner>}
        {message && <Banner type="success" title="Saved">{message}</Banner>}
        <div className="flex flex-wrap items-center gap-3"><button className="button-primary" type="submit" disabled={loading||saving||!dirty}>{saving?'Saving…':'Save Changes'}</button><button type="button" className="button-secondary" disabled={loading||saving||!dirty} onClick={()=>{setSettings(original);setError('');setMessage('')}}>Cancel Changes</button></div>
      </form>
    </Card>
  </div>
}

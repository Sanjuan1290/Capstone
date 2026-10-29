import { useEffect, useState } from 'react'
import { MdPayments, MdQrCode2, MdRefresh } from 'react-icons/md'
import { getBillingPaymentSettings, updateBillingPaymentSettings } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { LoadingState, ErrorState } from '../../components/ui/PageState'
import BillingSetupNav from '../../components/billing/BillingSetupNav'

// Manual GCash/Maya uploads and bank transfers are no longer available for NEW payments.
// Existing historical records remain in the database and reporting paths.
const Toggle = ({ checked, onChange, label, disabled=false }) => (
  <button type="button" onClick={() => onChange(!checked)} disabled={disabled} role="switch" aria-checked={checked}
    aria-label={label} className={`relative inline-flex h-7 w-12 items-center rounded-full transition disabled:opacity-40 ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
)
const Admin_BillingPaymentMethods = () => {
  const toast = useToast()
  const [settings,setSettings]=useState(null)
  const [cash,setCash]=useState(true)
  const [qrph,setQrph]=useState(false)
  const [qrphSupported,setQrphSupported]=useState(false)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [dirty,setDirty]=useState(false)
  const load=async()=>{setLoading(true);setError('');try{
    const data=await getBillingPaymentSettings();setSettings(data||{});setCash(Number(data?.cash_enabled??1)===1);setQrph(Number(data?.qrph_enabled||0)===1);setQrphSupported(data?.qrph_enabled!==undefined);setDirty(false)
  }catch(e){setError(e.message||'Unable to load payment settings.')}
  finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  const save=async()=>{if(!cash&&!qrph)return toast.error('Enable Cash or QR Ph before saving.')
    setSaving(true);try{await updateBillingPaymentSettings({ ...settings, cash_enabled:cash?1:0, qrph_enabled:qrph?1:0, gcash_enabled:0,maya_enabled:0,bank_transfer_enabled:0 });await load();toast.success('Payment settings saved.')}
    catch(e){toast.error(e.message||'Could not save payment settings.')}
    finally{setSaving(false)}}
  return <div className="mx-auto w-full max-w-7xl space-y-5">
    <div className="flex items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-amber-500"/> Payment Methods</h1><p className="text-sm text-slate-500">New payments support Cash and gateway-verified QR Ph only.</p></div><button className="button-secondary" disabled={loading||saving} onClick={load}><MdRefresh/> Refresh</button></div>
    <BillingSetupNav/>
    {loading?<LoadingState label="Loading payment methods..."/>:error?<ErrorState message={error} onRetry={load}/>:<>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm flex items-start justify-between gap-4"><div><h2 className="font-bold text-slate-900">Cash</h2><p className="text-sm text-slate-500">Cash collection and change calculation.</p></div><Toggle checked={cash} label="Enable Cash" onChange={v=>{setCash(v);setDirty(true)}}/></div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 font-bold text-slate-900"><MdQrCode2 className="text-sky-600"/> QR Ph — PayMongo</h2><p className="mt-1 text-sm text-slate-500">QR payments are generated, verified, and reconciled by PayMongo. Staff cannot manually mark QR Ph as paid.</p><p className="mt-2 text-xs text-amber-700">{qrphSupported ? 'Enable QR Ph only after the PayMongo backend and webhook are ready. Switching it off does not cancel pending payment attempts.' : 'QR Ph activation requires the reviewed branch-settings migration.'}</p></div><Toggle checked={qrph} disabled={!qrphSupported} onChange={v=>{setQrph(v);setDirty(true)}} label="Enable QR Ph"/></div>
      <div className="flex items-center justify-between rounded-2xl border bg-white p-3 shadow-sm"><span className="text-sm font-semibold text-slate-500">{dirty?'Unsaved changes':'All changes saved'}</span><div className="flex gap-2"><button className="button-secondary" disabled={!dirty||saving} onClick={load}>Discard</button><button className="button-primary" disabled={!dirty||saving||(!cash&&!qrph)} onClick={save}>{saving?'Saving…':'Save Changes'}</button></div></div>
    </>}
  </div>
}
export default Admin_BillingPaymentMethods

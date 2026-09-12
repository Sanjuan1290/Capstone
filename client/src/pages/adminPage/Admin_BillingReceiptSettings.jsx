import { useEffect, useState } from 'react'
import { MdPrint, MdReceiptLong, MdRefresh } from 'react-icons/md'
import { getBillingAdjustmentRequests, getClinicSettings, updateClinicSettings } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { LoadingState, ErrorState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingSetupNav from '../../components/billing/BillingSetupNav'

const Admin_BillingReceiptSettings = () => {
  const toast = useToast()
  const [form, setForm] = useState({ clinic_name: '', address: '', phone: '', email: '', report_footer: '', receipt_footer: '' })
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try { const [settings, pending] = await Promise.all([getClinicSettings(), getBillingAdjustmentRequests({ status: 'pending' })]); setForm((current) => ({ ...current, ...settings })); setPendingCount(Array.isArray(pending) ? pending.length : 0) }
    catch (err) { const message = err.message || 'Could not load receipt settings.'; setError(message); toast.error(message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const save = async () => { setSaving(true); try { const saved = await updateClinicSettings(form); setForm((current) => ({ ...current, ...saved })); toast.success('Receipt settings saved.') } catch (err) { toast.error(err.message || 'Receipt settings could not be saved.') } finally { setSaving(false) } }

  return <div className="mx-auto w-full max-w-7xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdReceiptLong className="text-amber-500" /> Receipt Settings</h1><p className="mt-1 text-sm text-slate-500">Configure the clinic information printed on payment receipts.</p></div><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div>
    <AdminBillingNav pendingApprovals={pendingCount} /><BillingSetupNav />
    {loading ? <LoadingState label="Loading receipt settings..." /> : error ? <ErrorState message={error} onRetry={load} /> : <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"><div><h2 className="font-black text-slate-900">Receipt Information</h2><p className="mt-1 text-sm text-slate-500">These fields use the clinic's shared settings, so changes stay consistent across official documents.</p></div><label className="block"><span className="form-label">Clinic Name *</span><input className="form-control mt-1.5" value={form.clinic_name || ''} onChange={(e) => update('clinic_name', e.target.value)} /></label><label className="block"><span className="form-label">Address</span><input className="form-control mt-1.5" value={form.address || ''} onChange={(e) => update('address', e.target.value)} /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="form-label">Phone</span><input className="form-control mt-1.5" value={form.phone || ''} onChange={(e) => update('phone', e.target.value)} /></label><label><span className="form-label">Email</span><input type="email" className="form-control mt-1.5" value={form.email || ''} onChange={(e) => update('email', e.target.value)} /></label></div><label className="block"><span className="form-label">Receipt Footer</span><textarea rows={3} className="form-control mt-1.5 resize-none" value={form.receipt_footer || ''} onChange={(e) => update('receipt_footer', e.target.value)} placeholder="Thank you for choosing our clinic." /></label><div className="flex justify-end"><button className="button-primary" disabled={saving || !String(form.clinic_name || '').trim()} onClick={save}>{saving ? 'Saving…' : 'Save Receipt Settings'}</button></div></section>
      <aside className="lg:sticky lg:top-24 lg:self-start"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black text-slate-900">Receipt Preview</h2><MdPrint className="text-slate-400" /></div><div className="mt-5 border-y border-dashed border-slate-300 py-5 text-center"><p className="text-base font-black text-slate-900">{form.clinic_name || 'Clinic Name'}</p><p className="mt-1 text-xs text-slate-500">{form.address || 'Clinic address'}</p><p className="text-xs text-slate-500">{form.phone || 'Phone number'}</p></div><div className="space-y-2 py-5 text-sm"><div className="flex justify-between"><span>Receipt</span><strong>OR-20260911-0001</strong></div><div className="flex justify-between"><span>Patient</span><strong>Sample Patient</strong></div><div className="flex justify-between"><span>Payment</span><strong>Cash</strong></div><div className="flex justify-between border-t border-slate-100 pt-3 text-base"><span className="font-black">Amount</span><strong>₱1,200.00</strong></div></div><p className="border-t border-dashed border-slate-300 pt-4 text-center text-xs text-slate-500">{form.receipt_footer || 'Receipt footer appears here.'}</p></div></aside>
    </div>}
  </div>
}
export default Admin_BillingReceiptSettings

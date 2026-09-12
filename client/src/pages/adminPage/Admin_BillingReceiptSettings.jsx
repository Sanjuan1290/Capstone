import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdPrint, MdReceiptLong, MdRefresh } from 'react-icons/md'
import { getBillingAdjustmentRequests, getClinicSettings, updateClinicSettings } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { LoadingState, ErrorState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingSetupNav from '../../components/billing/BillingSetupNav'
import { printBillingReceipt } from '../../utils/billingReceipt'

const Admin_BillingReceiptSettings = () => {
  const toast = useToast()
  const [form, setForm] = useState({ clinic_name: '', address: '', phone: '', email: '', report_footer: '', receipt_title: 'PAYMENT RECEIPT', receipt_footer: '' })
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [settings, pending] = await Promise.all([getClinicSettings(), getBillingAdjustmentRequests({ status: 'pending', page: 1, limit: 1 })])
      setForm((current) => ({ ...current, ...settings, receipt_title: settings?.receipt_title || 'PAYMENT RECEIPT' }))
      setPendingCount(Number(pending?.pagination?.total ?? pending?.items?.length ?? pending?.length ?? 0))
      setDirty(false)
    } catch (err) { const message = err.message || 'Could not load receipt settings.'; setError(message); toast.error(message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const beforeUnload = (event) => { if (!dirty) return; event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', beforeUnload); return () => window.removeEventListener('beforeunload', beforeUnload) }, [dirty])

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setDirty(true) }
  const save = async () => {
    setSaving(true)
    try {
      const saved = await updateClinicSettings(form)
      setForm((current) => ({ ...current, ...saved }))
      setDirty(false)
      toast.success('Receipt settings saved.')
    } catch (err) { toast.error(err.message || 'Receipt settings could not be saved.') }
    finally { setSaving(false) }
  }

  const preview = () => printBillingReceipt({
    clinicSettings: form,
    bill: {
      id: 'PREVIEW', patient_name: 'Sample Patient', doctor_name: 'Sample Doctor', total_amount: 1200, paid_amount: 1200, balance_amount: 0,
      items: [{ id: 1, service_name: 'Sample Clinic Service', quantity: 1, unit_price: 1200, line_total: 1200 }],
    },
    payment: { receipt_number: 'PREVIEW-0001', payment_method: 'cash', amount: 1200, refund_amount: 0, status: 'completed', paid_at: new Date().toISOString() },
    onPopupBlocked: () => toast.warning('Allow pop-ups to open the receipt preview.'),
  })

  return <div className="mx-auto w-full max-w-7xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdReceiptLong className="text-amber-500" /> Receipt Settings</h1><p className="mt-1 text-sm text-slate-500">Configure receipt-specific wording without silently changing the clinic's shared identity.</p></div><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div>
    <AdminBillingNav pendingApprovals={pendingCount} /><BillingSetupNav />
    {loading ? <LoadingState label="Loading receipt settings..." /> : error ? <ErrorState message={error} onRetry={load} /> : <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="font-black text-slate-900">Clinic Information</h2><p className="mt-1 text-sm text-slate-500">These details are shared across the system and are read-only here.</p></div>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"><p className="font-black text-slate-900">{form.clinic_name || 'Clinic Name'}</p><p className="mt-1">{form.address || 'No address configured'}</p><p className="mt-1">{form.phone || 'No phone configured'}{form.email ? ` · ${form.email}` : ''}</p><Link to="/admin/clinic-settings" className="mt-3 inline-flex font-bold text-amber-700">Edit Clinic Profile →</Link></div>
        <div className="border-t border-slate-100 pt-5"><h2 className="font-black text-slate-900">Receipt Content</h2><p className="mt-1 text-sm text-slate-500">These settings belong specifically to Billing receipts.</p></div>
        <label className="block"><span className="form-label">Receipt Title *</span><input className="form-control mt-1.5" value={form.receipt_title || ''} onChange={(e) => update('receipt_title', e.target.value)} placeholder="PAYMENT RECEIPT" /><p className="mt-1.5 text-xs text-slate-500">Use the document name your clinic intends. The system no longer hardcodes “Official Payment Receipt.”</p></label>
        <label className="block"><span className="form-label">Receipt Footer</span><textarea rows={3} className="form-control mt-1.5 resize-none" value={form.receipt_footer || ''} onChange={(e) => update('receipt_footer', e.target.value)} placeholder="Thank you for choosing our clinic." /></label>
        <div className="flex flex-wrap justify-end gap-2"><button className="button-secondary" onClick={preview}><MdPrint /> Open Exact Receipt Preview</button><button className="button-primary" disabled={saving || !dirty || !String(form.receipt_title || '').trim()} onClick={save}>{saving ? 'Saving…' : 'Save Receipt Settings'}</button></div>
      </section>
      <aside className="lg:sticky lg:top-24 lg:self-start"><div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black text-slate-900">Preview Notes</h2><MdPrint className="text-slate-400" /></div><p className="mt-4 text-sm leading-relaxed text-slate-600">The preview button uses the <strong>same receipt renderer</strong> used for real receipt printing, with sample patient/payment data. This prevents the setup preview and actual printed receipt from drifting apart.</p><div className="mt-4 rounded-xl bg-violet-50 p-3 text-sm text-violet-800">Refunded or voided payments automatically print a visible <strong>REFUNDED</strong>, <strong>PARTIALLY REFUNDED</strong>, or <strong>VOIDED</strong> status on the receipt.</div>{dirty && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">● Unsaved receipt changes</div>}</div></aside>
    </div>}
  </div>
}
export default Admin_BillingReceiptSettings

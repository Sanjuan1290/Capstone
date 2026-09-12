import { useEffect, useState } from 'react'
import { MdAdd, MdDiscount, MdEdit, MdRefresh } from 'react-icons/md'
import { getBillingAdjustmentRequests, getDiscountPresets, saveDiscountPreset } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import Modal from '../../components/ui/Modal'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingSetupNav from '../../components/billing/BillingSetupNav'
import { formatMoney } from '../../utils/billingUi'

const blank = { label: '', discount_type: 'percentage', value: 0, requires_reference: true, requires_admin_approval: false, is_active: true, sort_order: 0 }
const asBool = (value) => Boolean(Number(value))

const Admin_BillingDiscounts = () => {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [discounts, pending] = await Promise.all([getDiscountPresets(), getBillingAdjustmentRequests({ status: 'pending' })])
      setRows(Array.isArray(discounts) ? discounts : []); setPendingCount(Number(pending?.pagination?.total ?? pending?.items?.length ?? pending?.length ?? 0))
    } catch (err) { const message = err.message || 'Could not load discounts.'; setError(message); toast.error(message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setEditor({ id: null }); setForm(blank) }
  const openEdit = (row) => { setEditor(row); setForm({ label: row.label || '', discount_type: row.discount_type || 'fixed', value: Number(row.value || 0), requires_reference: asBool(row.requires_reference), requires_admin_approval: asBool(row.requires_admin_approval), is_active: asBool(row.is_active), sort_order: Number(row.sort_order || 0) }) }
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const save = async () => {
    if (!form.label.trim()) { toast.error('Discount name is required.'); return }
    if (form.discount_type === 'percentage' && Number(form.value || 0) > 100) { toast.error('Percentage discount cannot exceed 100%.'); return }
    setSaving(true)
    try { await saveDiscountPreset({ ...form, label: form.label.trim() }, editor?.id || null); toast.success(editor?.id ? 'Discount updated.' : 'Discount added.'); setEditor(null); await load() }
    catch (err) { toast.error(err.message || 'Discount could not be saved.') }
    finally { setSaving(false) }
  }

  return <div className="mx-auto w-full max-w-7xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdDiscount className="text-amber-500" /> Discounts</h1><p className="mt-1 text-sm text-slate-500">Control reusable discount rules, required references, and Admin approval.</p></div><div className="flex gap-2"><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button><button className="button-primary" onClick={openNew}><MdAdd /> Add Discount</button></div></div>
    <AdminBillingNav pendingApprovals={pendingCount} /><BillingSetupNav />
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">{loading ? <div className="p-5"><LoadingState label="Loading discounts..." /></div> : error ? <div className="p-5"><ErrorState message={error} onRetry={load} /></div> : rows.length === 0 ? <div className="p-5"><EmptyState title="No discount rules" description="Create a discount rule for Staff to apply during bill review." /></div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Discount</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Value</th><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Approval</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id}><td className="px-5 py-4 font-black text-slate-800">{row.label}</td><td className="px-5 py-4 capitalize">{row.discount_type}</td><td className="px-5 py-4 font-bold">{row.discount_type === 'percentage' ? `${Number(row.value || 0)}%` : Number(row.value || 0) ? formatMoney(row.value) : 'Entered at checkout'}</td><td className="px-5 py-4">{asBool(row.requires_reference) ? 'Required' : 'No'}</td><td className="px-5 py-4">{asBool(row.requires_admin_approval) ? 'Admin required' : 'No approval'}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${asBool(row.is_active) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{asBool(row.is_active) ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-4 text-right"><button className="button-secondary" onClick={() => openEdit(row)}><MdEdit /> Edit</button></td></tr>)}</tbody></table></div>}</section>

    <Modal open={Boolean(editor)} onClose={() => !saving && setEditor(null)} closeDisabled={saving} title={editor?.id ? 'Edit Discount' : 'Add Discount'} description="Keep this form short; complex billing setup stays on dedicated pages." size="md"><div className="space-y-4"><label className="block"><span className="form-label">Name *</span><input className="form-control mt-1.5" value={form.label} onChange={(e) => update('label', e.target.value)} placeholder="e.g. Senior Citizen" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="form-label">Type</span><select className="form-control mt-1.5" value={form.discount_type} onChange={(e) => update('discount_type', e.target.value)}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label><label><span className="form-label">Default Value</span><input type="number" min="0" max={form.discount_type === 'percentage' ? 100 : undefined} step="0.01" className="form-control mt-1.5" value={form.value} onChange={(e) => update('value', e.target.value)} /><span className="form-helper">{form.discount_type === 'percentage' ? 'Percentage must be between 0% and 100%.' : 'Use 0 when Staff should enter the amount during review; Admin approval will be required.'}</span>{form.discount_type === 'percentage' && Number(form.value || 0) > 100 && <span className="mt-1 block text-xs font-bold text-rose-700">Percentage discount cannot exceed 100%.</span>}</label></div><div className="space-y-2 rounded-2xl bg-slate-50 p-4">{[['requires_reference','Require ID / reference'],['requires_admin_approval','Require Admin approval'],['is_active','Active and available at checkout']].map(([key,label]) => <label key={key} className="flex items-center gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={Boolean(form[key])} onChange={(e) => update(key, e.target.checked)} /> {label}</label>)}</div><label className="block"><span className="form-label">Sort Order</span><input type="number" className="form-control mt-1.5" value={form.sort_order} onChange={(e) => update('sort_order', e.target.value)} /></label><div className="flex justify-end gap-2"><button className="button-secondary" disabled={saving} onClick={() => setEditor(null)}>Cancel</button><button className="button-primary" disabled={saving || !form.label.trim() || (form.discount_type === 'percentage' && Number(form.value || 0) > 100)} onClick={save}>{saving ? 'Saving…' : 'Save Discount'}</button></div></div></Modal>
  </div>
}
export default Admin_BillingDiscounts

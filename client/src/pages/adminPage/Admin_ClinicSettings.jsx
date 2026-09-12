import { useEffect, useState } from 'react'
import { MdBusiness, MdSave } from 'react-icons/md'
import { getClinicSettings, updateClinicSettings } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'

const EMPTY = { clinic_name: 'CARAIT MEDICAL AND DERMATOLOGY CLINIC', address: '', phone: '', email: '', report_footer: '', receipt_footer: '' }

const Admin_ClinicSettings = () => {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    getClinicSettings().then((data) => setForm({ ...EMPTY, ...(data || {}) })).catch((error) => toast.error(error.message || 'Could not load clinic settings.')).finally(() => setLoading(false))
  }, [toast])
  const save = async () => {
    if (!form.clinic_name.trim()) return toast.error('Clinic name is required.')
    setSaving(true)
    try { setForm({ ...EMPTY, ...(await updateClinicSettings(form)) }); toast.success('Clinic settings saved.') }
    catch (error) { toast.error(error.message || 'Could not save clinic settings.') }
    finally { setSaving(false) }
  }
  const field = (key) => ({ value: form[key] || '', onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })) })
  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading clinic settings…</div>
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdBusiness className="text-amber-500" /> Clinic Settings</h1><p className="mt-1 text-sm text-slate-500">Use one source for clinic branding on reports, receipts, prescriptions, and public-facing text.</p></div>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="md:col-span-2"><span className="form-label">Clinic Name *</span><input className="form-control mt-1.5" {...field('clinic_name')} /></label>
          <label className="md:col-span-2"><span className="form-label">Address</span><input className="form-control mt-1.5" {...field('address')} placeholder="Clinic address" /></label>
          <label><span className="form-label">Phone</span><input className="form-control mt-1.5" {...field('phone')} placeholder="Clinic phone number" /></label>
          <label><span className="form-label">Email</span><input type="email" className="form-control mt-1.5" {...field('email')} placeholder="Clinic email" /></label>
          <label className="md:col-span-2"><span className="form-label">Report Footer</span><textarea rows="3" className="form-control mt-1.5" {...field('report_footer')} placeholder="Optional footer shown on printed reports" /></label>
          <label className="md:col-span-2"><span className="form-label">Receipt Footer</span><textarea rows="3" className="form-control mt-1.5" {...field('receipt_footer')} placeholder="Optional receipt message" /></label>
        </div>
        <div className="mt-6 flex justify-end"><button type="button" className="button-primary" disabled={saving} onClick={save}><MdSave /> {saving ? 'Saving…' : 'Save Clinic Settings'}</button></div>
      </section>
    </div>
  )
}

export default Admin_ClinicSettings




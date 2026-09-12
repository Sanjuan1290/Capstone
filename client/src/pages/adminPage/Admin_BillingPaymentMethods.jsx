import { useEffect, useState } from 'react'
import { MdAccountBalance, MdCloudUpload, MdDeleteOutline, MdPayments, MdQrCode2, MdRefresh } from 'react-icons/md'
import {
  getBillingAdjustmentRequests,
  getBillingPaymentSettings,
  getPaymentQrUploadScanStatus,
  updateBillingPaymentSettings,
  uploadPaymentQrImage,
} from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { LoadingState, ErrorState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingSetupNav from '../../components/billing/BillingSetupNav'

const emptyForm = {
  cash_enabled: true,
  gcash_enabled: true,
  maya_enabled: true,
  bank_transfer_enabled: true,
  gcash_qr_url: '',
  maya_qr_url: '',
  gcash_qr_scan_status: 'legacy',
  maya_qr_scan_status: 'legacy',
  gcash_qr_security_token: '',
  maya_qr_security_token: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
}

const asEnabled = (value) => value === undefined || value === null ? true : Boolean(Number(value))

const Toggle = ({ checked, onChange, label }) => <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`} role="switch" aria-checked={checked} aria-label={label}><span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} /></button>

const ProviderCard = ({ provider, label, enabled, setEnabled, form, setForm, uploading, status, onUpload, onRemove }) => {
  const urlKey = `${provider}_qr_url`
  const scanKey = `${provider}_qr_scan_status`
  const scanStatus = form[scanKey]
  const okay = scanStatus === 'approved'
  return <section className={`rounded-3xl border bg-white p-5 shadow-sm ${enabled ? 'border-slate-200' : 'border-slate-100 opacity-75'}`}>
    <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><MdQrCode2 className="text-xl text-sky-600" /><h2 className="font-black text-slate-900">{label}</h2></div><p className="mt-1 text-sm text-slate-500">Show {label} as an option during patient checkout.</p></div><Toggle checked={enabled} onChange={setEnabled} label={`Enable ${label}`} /></div>
    {enabled && <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr]">
      <div className="flex min-h-44 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">{form[urlKey] ? <img src={form[urlKey]} alt={`${label} QR code`} className="max-h-40 max-w-full rounded-lg object-contain" /> : <div className="text-center text-slate-400"><MdQrCode2 className="mx-auto text-5xl" /><p className="mt-2 text-xs font-bold">No QR uploaded</p></div>}</div>
      <div className="space-y-3"><div className={`rounded-xl px-3 py-2 text-xs font-bold ${okay ? 'bg-emerald-50 text-emerald-700' : scanStatus === 'bypassed' ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>{okay ? '✓ QR image verified' : scanStatus === 'bypassed' ? '⚠ QR image saved without malware verification' : form[urlKey] ? 'QR image saved' : 'Upload a QR image to help staff collect digital payments.'}</div>{status?.message && <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${status.tone === 'danger' ? 'bg-rose-50 text-rose-700' : status.tone === 'warning' ? 'bg-amber-50 text-amber-800' : status.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{status.message}</div>}<div className="flex flex-wrap gap-2"><label className="button-secondary cursor-pointer"><MdCloudUpload /> {uploading === provider ? 'Uploading…' : form[urlKey] ? 'Replace QR' : 'Upload QR'}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={Boolean(uploading)} onChange={(event) => onUpload(provider, event)} /></label>{form[urlKey] && <button type="button" className="button-secondary text-rose-700" disabled={Boolean(uploading)} onClick={() => onRemove(provider)}><MdDeleteOutline /> Remove</button>}</div><details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"><summary className="cursor-pointer font-bold text-slate-600">Technical security details</summary><p className="mt-2">Scan status: <strong>{scanStatus || 'legacy'}</strong>. New uploads are scanned before they are attached when the scanner is available.</p></details></div>
    </div>}
  </section>
}

const Admin_BillingPaymentMethods = () => {
  const toast = useToast()
  const [form, setForm] = useState(emptyForm)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')
  const [uploadStatus, setUploadStatus] = useState({ gcash: null, maya: null })
  const [scanWarning, setScanWarning] = useState(null)
  const [pendingScan, setPendingScan] = useState(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [settings, pending] = await Promise.all([getBillingPaymentSettings(), getBillingAdjustmentRequests({ status: 'pending' })])
      setForm({ ...emptyForm, ...settings, cash_enabled: asEnabled(settings?.cash_enabled), gcash_enabled: asEnabled(settings?.gcash_enabled), maya_enabled: asEnabled(settings?.maya_enabled), bank_transfer_enabled: asEnabled(settings?.bank_transfer_enabled), gcash_qr_security_token: '', maya_qr_security_token: '' })
      setPendingCount(Array.isArray(pending) ? pending.length : 0)
    } catch (err) { const message = err.message || 'Could not load payment methods.'; setError(message); toast.error(message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const setStatus = (provider, value) => setUploadStatus((current) => ({ ...current, [provider]: value }))
  const applyResult = (provider, result) => setForm((current) => ({ ...current, [`${provider}_qr_url`]: result.url, [`${provider}_qr_scan_status`]: result.scan_status, [`${provider}_qr_security_token`]: result.security_token || '' }))

  const handleUpload = async (provider, event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    setScanWarning(null); setPendingScan(null); setUploading(provider); setStatus(provider, { tone: 'info', message: 'Uploading and checking image security…' })
    try {
      const result = await uploadPaymentQrImage(file, provider, { scanMode: 'scan', onStatus: (value) => setStatus(provider, value) })
      applyResult(provider, result); toast.success(`${provider === 'gcash' ? 'GCash' : 'Maya'} QR verified.`)
    } catch (err) {
      if (err.code === 'SCAN_UNAVAILABLE' || err.code === 'SCAN_LIMIT_REACHED') {
        setScanWarning({ provider, file, message: err.message, bypass_token: err.bypass_token || '' }); setStatus(provider, { tone: 'warning', message: 'QR verification is temporarily unavailable. Review the warning below.' })
      } else if (err.code === 'SCAN_PENDING') {
        setPendingScan({ provider, file, asset_id: err.asset_id, url: err.url, public_id: err.public_id, scan_token: err.scan_token }); setStatus(provider, { tone: 'info', message: 'QR verification is still processing.' })
      } else { setStatus(provider, { tone: 'danger', message: err.message || 'QR upload failed.' }); toast.error(err.message || 'QR upload failed.') }
    } finally { setUploading('') }
  }

  const checkPending = async () => {
    if (!pendingScan) return
    const { provider, asset_id: assetId, url, public_id: publicId, scan_token: scanToken } = pendingScan
    setUploading(provider)
    try {
      const result = await getPaymentQrUploadScanStatus(provider, assetId, scanToken)
      if (result.status === 'approved') { applyResult(provider, { url: result.secure_url || url, scan_status: 'approved', security_token: result.security_token }); setPendingScan(null); setStatus(provider, { tone: 'success', message: 'QR image verified.' }); toast.success('QR image verified.') }
      else if (result.status === 'rejected') { setPendingScan(null); setStatus(provider, { tone: 'danger', message: 'Unsafe image detected. Upload blocked.' }) }
      else if (result.status === 'unavailable') { setPendingScan(null); setScanWarning({ provider, file: pendingScan.file, message: result.message, bypass_token: result.bypass_token || '' }); setStatus(provider, { tone: 'warning', message: 'QR verification is temporarily unavailable.' }) }
      else setStatus(provider, { tone: 'info', message: 'QR verification is still processing.' })
    } catch (err) { toast.error(err.message || 'Could not check QR verification.') }
    finally { setUploading('') }
  }

  const bypassScan = async () => {
    if (!scanWarning?.file || !scanWarning?.provider || !scanWarning?.bypass_token) return
    const { provider, file, bypass_token: bypassToken } = scanWarning
    setUploading(provider); setScanWarning(null)
    try { const result = await uploadPaymentQrImage(file, provider, { scanMode: 'bypass', bypassToken, onStatus: (value) => setStatus(provider, value) }); applyResult(provider, result); toast.warning('QR saved without malware verification.') }
    catch (err) { toast.error(err.message || 'QR upload failed.') }
    finally { setUploading('') }
  }

  const removeQr = (provider) => setForm((current) => ({ ...current, [`${provider}_qr_url`]: '', [`${provider}_qr_scan_status`]: 'legacy', [`${provider}_qr_security_token`]: '' }))

  const save = async () => {
    setSaving(true)
    try {
      const saved = await updateBillingPaymentSettings(form)
      setForm((current) => ({ ...current, ...saved, cash_enabled: asEnabled(saved?.cash_enabled), gcash_enabled: asEnabled(saved?.gcash_enabled), maya_enabled: asEnabled(saved?.maya_enabled), bank_transfer_enabled: asEnabled(saved?.bank_transfer_enabled), gcash_qr_security_token: '', maya_qr_security_token: '' }))
      toast.success('Payment methods saved.')
    } catch (err) { toast.error(err.message || 'Payment methods could not be saved.') }
    finally { setSaving(false) }
  }

  return <div className="mx-auto w-full max-w-7xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-amber-500" /> Payment Methods</h1><p className="mt-1 text-sm text-slate-500">Choose exactly what Staff can accept during Checkout.</p></div><button className="button-secondary" onClick={load} disabled={loading || saving}><MdRefresh /> Refresh</button></div>
    <AdminBillingNav pendingApprovals={pendingCount} /><BillingSetupNav />
    {loading ? <LoadingState label="Loading payment methods..." /> : error ? <ErrorState message={error} onRetry={load} /> : <>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="font-black text-slate-900">Cash</h2><p className="mt-1 text-sm text-slate-500">Allow Staff to collect cash and calculate change.</p></div><Toggle checked={form.cash_enabled} onChange={(value) => update('cash_enabled', value)} label="Enable Cash" /></div></section>
      <div className="grid gap-5 xl:grid-cols-2"><ProviderCard provider="gcash" label="GCash" enabled={form.gcash_enabled} setEnabled={(value) => update('gcash_enabled', value)} form={form} setForm={setForm} uploading={uploading} status={uploadStatus.gcash} onUpload={handleUpload} onRemove={removeQr} /><ProviderCard provider="maya" label="Maya" enabled={form.maya_enabled} setEnabled={(value) => update('maya_enabled', value)} form={form} setForm={setForm} uploading={uploading} status={uploadStatus.maya} onUpload={handleUpload} onRemove={removeQr} /></div>
      {(pendingScan || scanWarning) && <section className={`rounded-2xl border p-4 text-sm ${scanWarning ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`}><p className="font-black">{scanWarning ? 'QR verification unavailable' : 'QR verification still processing'}</p><p className="mt-1">{scanWarning?.message || 'The uploaded image is quarantined until verification finishes.'}</p><div className="mt-3 flex flex-wrap gap-2">{pendingScan && <button className="button-primary" disabled={Boolean(uploading)} onClick={checkPending}>Check Again</button>}{scanWarning && <><button className="button-secondary" disabled={Boolean(uploading)} onClick={() => setScanWarning(null)}>Cancel</button><button className="button-primary" disabled={Boolean(uploading) || !scanWarning.bypass_token} onClick={bypassScan}>Save Without Verification</button></>}</div></section>}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><MdAccountBalance className="mt-0.5 text-xl text-sky-600" /><div><h2 className="font-black text-slate-900">Bank Transfer</h2><p className="mt-1 text-sm text-slate-500">Display account details during checkout and require a reference number.</p></div></div><Toggle checked={form.bank_transfer_enabled} onChange={(value) => update('bank_transfer_enabled', value)} label="Enable Bank Transfer" /></div>{form.bank_transfer_enabled && <div className="mt-5 grid gap-4 md:grid-cols-3"><label><span className="form-label">Bank Name</span><input className="form-control mt-1.5" value={form.bank_name || ''} onChange={(e) => update('bank_name', e.target.value)} /></label><label><span className="form-label">Account Name</span><input className="form-control mt-1.5" value={form.bank_account_name || ''} onChange={(e) => update('bank_account_name', e.target.value)} /></label><label><span className="form-label">Account Number</span><input className="form-control mt-1.5" value={form.bank_account_number || ''} onChange={(e) => update('bank_account_number', e.target.value)} /></label></div>}</section>
      <div className="sticky bottom-4 z-10 flex justify-end"><button className="button-primary min-w-40 shadow-lg" disabled={saving || Boolean(uploading)} onClick={save}>{saving ? 'Saving…' : 'Save Changes'}</button></div>
    </>}
  </div>
}

export default Admin_BillingPaymentMethods

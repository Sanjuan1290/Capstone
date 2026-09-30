import { useRef, useState } from 'react'
import { MdClose, MdOpenInNew, MdUpload } from 'react-icons/md'

const DiscountProofField = ({ billingId, value, onChange, uploadFn, disabled = false }) => {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState(null)
  const [bypassPrompt, setBypassPrompt] = useState(null)

  const upload = async (file, options = {}) => {
    if (!file || !uploadFn || !billingId) return
    setUploading(true)
    setStatus({ tone: 'info', message: 'Preparing upload…' })
    try {
      const result = await uploadFn(file, billingId, { ...options, onStatus: setStatus })
      onChange?.({ url: result.url || result.secure_url || '', security_token: result.security_token || '' })
      setBypassPrompt(null)
      setStatus({ tone: result.scan_status === 'bypassed' ? 'warning' : 'success', message: result.scan_status === 'bypassed' ? 'Uploaded without malware scanning.' : 'Upload complete. Security scan passed.' })
    } catch (error) {
      if ((error.code === 'SCAN_UNAVAILABLE' || error.code === 'SCAN_LIMIT_REACHED') && error.bypass_token) {
        setBypassPrompt({ file, bypass_token: error.bypass_token })
        setStatus({ tone: 'warning', message: error.message || 'Security scanner unavailable. You may continue only if this proof image is trusted.' })
      } else {
        setBypassPrompt(null)
        setStatus({ tone: 'danger', message: error.message || 'Discount proof upload failed.' })
      }
    } finally {
      setUploading(false)
    }
  }

  const toneClass = status?.tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status?.tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : status?.tone === 'danger'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-sky-200 bg-sky-50 text-sky-700'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="form-label">Reference / ID Proof *</span>
        {value?.url && !disabled && <button type="button" className="text-xs font-bold text-rose-600" onClick={() => { onChange?.({ url: '', security_token: '' }); setStatus(null) }}><MdClose className="mr-1 inline" /> Remove</button>}
      </div>
      {value?.url ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <img src={value.url} alt="Discount reference proof" className="h-24 w-32 rounded-xl border border-slate-200 bg-slate-50 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800">Proof image uploaded</p>
            <a href={value.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-violet-700">View full image <MdOpenInNew /></a>
            {!disabled && <button type="button" className="button-secondary mt-2" disabled={uploading} onClick={() => inputRef.current?.click()}><MdUpload /> {uploading ? 'Uploading…' : 'Replace Image'}</button>}
          </div>
        </div>
      ) : (
        <button type="button" className="button-secondary w-full justify-center" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}><MdUpload /> {uploading ? 'Uploading…' : 'Upload Reference / ID Proof'}</button>
      )}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden" disabled={disabled || uploading} onChange={(event) => { const file = event.currentTarget.files?.[0] || null; event.currentTarget.value = ''; void upload(file) }} />
      <p className="text-[11px] text-slate-400">PNG or JPG, up to 5 MB. The image is security scanned before it is attached.</p>
      {status?.message && <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${toneClass}`}>{status.message}</div>}
      {bypassPrompt && !disabled && <button type="button" className="button-secondary w-full justify-center" disabled={uploading} onClick={() => void upload(bypassPrompt.file, { scanMode: 'bypass', bypassToken: bypassPrompt.bypass_token })}>Upload Trusted Image Without Scan</button>}
    </div>
  )
}

export default DiscountProofField

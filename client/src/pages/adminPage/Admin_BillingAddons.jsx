import { useEffect, useRef, useState } from 'react'
import { MdAdd, MdCheck, MdEdit, MdInfoOutline, MdMedicalServices } from 'react-icons/md'
import { listAddons, saveAddon } from '../../services/addons.service'
import BillingSetupNav from '../../components/billing/BillingSetupNav'
import ToggleSwitch from '../../components/ui/ToggleSwitch'
import { formatMoney } from '../../utils/billingUi'

const blank = { name: '', default_price: '', is_active: 1 }

export default function Admin_BillingAddons() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(blank)
  const [id, setId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const nameInput = useRef(null)
  const active = Number(form.is_active) === 1

  const load = async () => {
    setLoading(true)
    try { setRows(await listAddons()); setError('') }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await saveAddon(form, id)
      setId(null)
      setForm(blank)
      await load()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const edit = (row) => {
    setId(row.id)
    setForm({ name: row.name, default_price: row.default_price, is_active: row.is_active })
    nameInput.current?.focus()
  }

  return (
    <div className="space-y-6">
      <BillingSetupNav />
      <div>
        <h2 className="text-xl font-black text-slate-900">Add-ons</h2>
        <p className="mt-1 text-sm text-slate-500">Create reusable items such as Medical Certificate, then attach them to services. Billing selects and confirms each charge.</p>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <form onSubmit={submit} aria-labelledby="addon-form-heading" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <fieldset disabled={busy} className="min-w-0">
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><MdMedicalServices aria-hidden="true" className="text-xl" /></span>
              <div>
                <h3 id="addon-form-heading" className="font-bold text-slate-900">{id ? 'Edit add-on' : 'Create add-on'}</h3>
                <p className="mt-0.5 text-xs text-slate-500">Set a default price and availability.</p>
              </div>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-12">
              <label className="min-w-0 lg:col-span-5">
                <span className="form-label">Name</span>
                <input ref={nameInput} required maxLength={120} className="form-control mt-2" placeholder="e.g. Medical Certificate" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="min-w-0 lg:col-span-3">
                <span className="form-label">Default Price (₱)</span>
                <input required type="number" min="0" max="99999999.99" step="0.01" className="form-control mt-2" placeholder="0.00" value={form.default_price} onChange={event => setForm({ ...form, default_price: event.target.value })} />
              </label>
              <div className="lg:col-span-4">
                <p className="form-label">Availability</p>
                <div className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3">
                  <span className={`text-sm font-bold ${active ? 'text-emerald-700' : 'text-slate-500'}`}>{active ? 'Active' : 'Inactive'}</span>
                  <ToggleSwitch checked={active} label="Add-on active" describedBy="addon-availability-help" disabled={busy} onChange={checked => setForm({ ...form, is_active: checked ? 1 : 0 })} />
                </div>
                <p id="addon-availability-help" className="mt-2 text-xs text-slate-500">{active ? 'Available for new billing charges.' : 'Unavailable for new billing charges.'}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="flex max-w-xl items-start gap-2 text-xs leading-relaxed text-slate-500"><MdInfoOutline aria-hidden="true" className="mt-0.5 shrink-0 text-base" /><span>₱0.00 is valid for a free or included item. Deactivating an add-on stops new charges; existing charges keep their saved price.</span></p>
            <div className="flex shrink-0 flex-wrap gap-2">
              {id && <button type="button" className="button-secondary" onClick={() => { setId(null); setForm(blank) }}>Cancel</button>}
              <button type="submit" className="button-primary" disabled={busy}>{id ? <MdCheck aria-hidden="true" /> : <MdAdd aria-hidden="true" />}{busy ? 'Saving…' : id ? 'Save Changes' : 'Create Add-on'}</button>
            </div>
          </div>
        </fieldset>
      </form>

      <section aria-labelledby="addon-library-heading" className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 id="addon-library-heading" className="text-sm font-bold text-slate-800">Add-on library</h3>
          {!loading && <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-bold text-slate-600">{rows.length}</span>}
        </div>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? <p role="status" className="p-6 text-sm text-slate-500">Loading add-ons…</p> : rows.length ? rows.map(row => (
            <div key={row.id} className={`grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6 ${id === row.id ? 'bg-amber-50/50' : ''}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><MdMedicalServices aria-hidden="true" className="text-xl" /></span>
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-slate-900">{row.name}</p>
                  <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${Number(row.is_active) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${Number(row.is_active) === 1 ? 'bg-emerald-600' : 'bg-slate-400'}`} />{Number(row.is_active) === 1 ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Default price</p>
                <p className="mt-1 text-base font-bold tabular-nums text-slate-900">{formatMoney(row.default_price)}</p>
              </div>
              <button type="button" className="button-secondary justify-self-start sm:justify-self-end" disabled={busy} onClick={() => edit(row)}><MdEdit aria-hidden="true" />Edit</button>
            </div>
          )) : <div className="px-5 py-10 text-center"><MdMedicalServices aria-hidden="true" className="mx-auto mb-3 text-3xl text-slate-300" /><p className="text-sm font-bold text-slate-700">No add-ons yet</p><p className="mt-1 text-sm text-slate-500">Create your first add-on above, then enable it on a service.</p></div>}
        </div>
      </section>
    </div>
  )
}

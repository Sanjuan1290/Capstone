import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  MdAdd,
  MdCategory,
  MdEdit,
  MdInventory2,
  MdLocalShipping,
  MdPlace,
  MdRefresh,
  MdSettings,
  MdSwapVert,
} from 'react-icons/md'
import Admin_PatientBooking from './Admin_PatientBooking'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import { useToast } from '../../components/ui/ToastProvider'
import {
  getSystemSetup,
  saveBillingServiceCategory,
  saveInventoryLocationType,
  saveInventoryMovementReason,
  saveInventorySupplier,
  saveInventoryUom,
} from '../../services/admin.service'

const TABS = [
  { key: 'visits', label: 'Patient Visits', Icon: MdSettings },
  { key: 'service_categories', label: 'Service Categories', Icon: MdCategory },
  { key: 'uoms', label: 'Units of Measure', Icon: MdInventory2 },
  { key: 'suppliers', label: 'Suppliers', Icon: MdLocalShipping },
  { key: 'location_types', label: 'Storage Classifications', Icon: MdPlace },
  { key: 'movement_reasons', label: 'Movement Reasons', Icon: MdSwapVert },
]

const clinicLabel = (value) => value === 'derma' ? 'Dermatology' : 'General Medicine'
const parseSupplierClinics = (value) => String(value || '').split(',').map((entry) => entry.trim()).filter((entry) => ['medical','derma'].includes(entry))
const supplierClinicLabel = (value) => {
  const clinics = parseSupplierClinics(value)
  return clinics.length ? clinics.map(clinicLabel).join(', ') : '—'
}

const ReferenceManager = ({ type, rows, onReload }) => {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)


  const nameMaxLength = {
    service_categories: 120,
    uoms: 80,
    suppliers: 160,
    location_types: 80,
    movement_reasons: 120,
  }[type] || 120

  const config = useMemo(() => ({
    service_categories: {
      title: 'Service Category',
      plural: 'Service Categories',
      singular: 'service category',
      save: saveBillingServiceCategory,
      description: 'Categories only group actual services. They are shown alphabetically in Add Service; create bookable services separately under Billing → Setup → Services & Pricing.',
    },
    uoms: {
      title: 'Unit of Measure',
      plural: 'Units of Measure',
      singular: 'unit',
      save: saveInventoryUom,
      description: 'Reusable measurement options for inventory items.',
    },
    suppliers: {
      title: 'Supplier',
      plural: 'Suppliers',
      singular: 'supplier',
      save: saveInventorySupplier,
      description: 'Reusable supplier/company records with clinic assignment and contact details.',
    },
    location_types: {
      title: 'Storage Classification',
      plural: 'Storage Classifications',
      singular: 'storage classification',
      save: saveInventoryLocationType,
      description: 'Reusable Storage Classifications assigned directly to inventory items. Add at least one before creating inventory items.',
    },
    movement_reasons: {
      title: 'Movement Reason',
      plural: 'Movement Reasons',
      singular: 'movement reason',
      save: saveInventoryMovementReason,
      description: 'Reusable reasons shown when recording Stock In or Stock Out. Built-in codes stay protected so existing inventory history remains valid.',
    },
  }[type]), [type])

  const pagination = useClientPagination(rows, { initialPageSize: 10, resetDeps: [type] })

  const close = () => {
    setEditing(null)
    setForm({})
  }

  const open = (row = null) => {
    setEditing(row)
    if (type === 'service_categories') {
      setForm({
        name: row?.name || '',
        clinic_type: row?.clinic_type || 'medical',
        is_active: row ? Number(row.is_active) : 1,
      })
    }
    if (type === 'uoms') {
      setForm({
        name: row?.name || '',
        abbreviation: row?.abbreviation || '',
        is_active: row ? Number(row.is_active) : 1,
        sort_order: row?.sort_order ?? 0,
        allow_decimal_quantity: row ? Number(row.allow_decimal_quantity || 0) : 0,
        decimal_precision: row ? Number(row.decimal_precision || 0) : 0,
      })
    }
    if (type === 'suppliers') {
      setForm({
        name: row?.name || '',
        contact_person: row?.contact_person || '',
        contact_number: row?.contact_number || '',
        address: row?.address || '',
        clinics: parseSupplierClinics(row?.category),
        is_active: row ? Number(row.is_active) : 1,
      })
    }
    if (type === 'location_types') {
      setForm({
        name: row?.name || '',
        is_active: row ? Number(row.is_active) : 1,
        sort_order: row?.sort_order ?? 0,
      })
    }
    if (type === 'movement_reasons') {
      setForm({
        name: row?.name || '',
        movement_type: row?.movement_type || 'in',
        requires_batch: row ? Number(row.requires_batch) : 0,
        is_active: row ? Number(row.is_active) : 1,
        is_system: row ? Number(row.is_system) : 0,
        code: row?.code || '',
      })
    }
  }

  const save = async () => {
    if (!String(form.name || '').trim()) return toast.warning(`Enter a ${config.singular} name.`)
    if (type === 'suppliers' && !(form.clinics || []).length) return toast.warning('Select at least one clinic.')
    setSaving(true)
    try {
      await config.save({ ...form, name: String(form.name).trim() }, editing?.id || null)
      toast.success(`${config.title} ${editing ? 'updated' : 'added'}.`)
      close()
      await onReload()
    } catch (err) {
      toast.error(err.message || `Could not save ${config.singular}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="font-black text-slate-900">{config.plural}</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">{config.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {type === 'service_categories' && <Link className="button-secondary" to="/admin/billing/setup/services">Manage Services & Pricing</Link>}
          <button className="button-primary" onClick={() => open()}><MdAdd /> Add {config.title}</button>
        </div>
      </div>

      {!rows.length ? (
        <div className="p-5"><EmptyState title={`No ${config.plural.toLowerCase()} yet`} description="Add the first reusable option." /></div>
      ) : (
        <div>
          <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Name</th>
                {type === 'service_categories' && <th className="px-5 py-3">Clinic</th>}
                {type === 'service_categories' && <th className="px-5 py-3">Used By</th>}
                {type === 'uoms' && <><th className="px-5 py-3">Abbreviation</th><th className="px-5 py-3">Quantity Precision</th></>}
                {type === 'suppliers' && <th className="px-5 py-3">Contact</th>}
                {type === 'suppliers' && <th className="px-5 py-3">Address</th>}
                {type === 'suppliers' && <th className="px-5 py-3">Clinic</th>}
                {type === 'movement_reasons' && <th className="px-5 py-3">Movement</th>}
                {type === 'movement_reasons' && <th className="px-5 py-3">Batch Rule</th>}
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagination.pageItems.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 font-semibold text-slate-800">{row.name}</td>
                  {type === 'service_categories' && <td className="px-5 py-4 text-slate-500">{clinicLabel(row.clinic_type)}</td>}
                  {type === 'service_categories' && <td className="px-5 py-4 text-slate-500">{Number(row.service_count || 0)} service{Number(row.service_count || 0) === 1 ? '' : 's'}</td>}
                  {type === 'uoms' && <><td className="px-5 py-4 text-slate-500">{row.abbreviation || '—'}</td><td className="px-5 py-4 text-slate-500">{Number(row.allow_decimal_quantity) === 1 ? `Up to ${Number(row.decimal_precision || 2)} decimal place${Number(row.decimal_precision || 2) === 1 ? '' : 's'}` : 'Whole units only'}</td></>}
                  {type === 'suppliers' && <td className="px-5 py-4 text-slate-500"><p className="font-semibold text-slate-700">{row.contact_person || '—'}</p><p className="mt-1 text-xs">{row.contact_number || 'No contact number'}</p></td>}
                  {type === 'suppliers' && <td className="max-w-xs px-5 py-4 text-slate-500">{row.address || '—'}</td>}
                  {type === 'suppliers' && <td className="px-5 py-4 text-slate-500">{supplierClinicLabel(row.category)}</td>}
                  {type === 'movement_reasons' && <td className="px-5 py-4 text-slate-500"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.movement_type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{row.movement_type === 'in' ? 'Stock In' : 'Stock Out'}</span>{Number(row.is_system) === 1 && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">System</span>}</td>}
                  {type === 'movement_reasons' && <td className="px-5 py-4 text-slate-500">{Number(row.requires_batch) === 1 ? 'Exact batch required' : 'Standard batch flow'}</td>}
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(row.is_active) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {Number(row.is_active) === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right"><button className="button-secondary" onClick={() => open(row)}><MdEdit /> Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pagination {...pagination} total={rows.length} pageSizeOptions={[10, 25, 50]} />
        </div>
      )}

      <Modal open={Boolean(editing) || Boolean(form.name !== undefined && Object.keys(form).length)} onClose={close} title={`${editing ? 'Edit' : 'Add'} ${config.title}`} size="md">
        <div className="space-y-4">
          <label className="block">
            <span className="form-label">{type === 'suppliers' ? 'Company / Supplier Name *' : 'Name *'}</span>
            <input maxLength={nameMaxLength} className="form-control mt-1.5" value={form.name || ''} onChange={(e) => setForm((value) => ({ ...value, name: e.target.value }))} />
          </label>

          {type === 'service_categories' && (
            <>
              <label className="block">
                <span className="form-label">Clinic *</span>
                <select className="form-control mt-1.5" value={form.clinic_type || 'medical'} disabled={Boolean(editing && Number(editing.service_count || 0) > 0)} onChange={(e) => setForm((value) => ({ ...value, clinic_type: e.target.value }))}>
                  <option value="medical">General Medicine</option>
                  <option value="derma">Dermatology</option>
                </select>
                {editing && Number(editing.service_count || 0) > 0 && <p className="mt-1 text-xs text-slate-400">Clinic is locked because this category is already used by {Number(editing.service_count)} service{Number(editing.service_count) === 1 ? '' : 's'}. You can still rename or deactivate it.</p>}
              </label>
            </>
          )}

          {type === 'uoms' && (
            <>
              <label className="block">
                <span className="form-label">Abbreviation</span>
                <input maxLength={30} className="form-control mt-1.5" value={form.abbreviation || ''} onChange={(e) => setForm((value) => ({ ...value, abbreviation: e.target.value }))} placeholder="e.g. cap, pc, mL" />
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  checked={Number(form.allow_decimal_quantity) === 1}
                  onChange={(e) => setForm((value) => ({ ...value, allow_decimal_quantity: e.target.checked ? 1 : 0, decimal_precision: e.target.checked ? Math.max(1, Number(value.decimal_precision || 2)) : 0 }))}
                />
                <span>
                  <strong className="text-sm text-slate-800">Allow decimal quantities</strong>
                  <span className="mt-0.5 block text-xs text-slate-500">Leave off for countable units such as pieces, tablets, capsules, boxes, or vials. Turn on only for measured units such as mL, grams, or meters.</span>
                </span>
              </label>
              {Number(form.allow_decimal_quantity) === 1 && (
                <label className="block">
                  <span className="form-label">Decimal Places *</span>
                  <select className="form-control mt-1.5" value={Math.max(1, Number(form.decimal_precision || 2))} onChange={(e) => setForm((value) => ({ ...value, decimal_precision: Number(e.target.value) }))}>
                    <option value={1}>1 decimal place (0.1)</option>
                    <option value={2}>2 decimal places (0.01)</option>
                    <option value={3}>3 decimal places (0.001)</option>
                    <option value={4}>4 decimal places (0.0001)</option>
                  </select>
                </label>
              )}
            </>
          )}

          {type === 'suppliers' && (
            <>
              <label className="block">
                <span className="form-label">Contact Person / Spokesperson</span>
                <input maxLength={160} className="form-control mt-1.5" value={form.contact_person || ''} onChange={(e) => setForm((value) => ({ ...value, contact_person: e.target.value }))} placeholder="e.g. Juan Dela Cruz" />
              </label>
              <label className="block">
                <span className="form-label">Contact Number</span>
                <input maxLength={80} className="form-control mt-1.5" value={form.contact_number || ''} onChange={(e) => setForm((value) => ({ ...value, contact_number: e.target.value }))} placeholder="Mobile or landline" />
              </label>
              <label className="block">
                <span className="form-label">Address</span>
                <textarea maxLength={255} rows={3} className="form-control mt-1.5 resize-none" value={form.address || ''} onChange={(e) => setForm((value) => ({ ...value, address: e.target.value }))} placeholder="Supplier/company address" />
              </label>
              <fieldset className="block">
                <legend className="form-label">Clinic *</legend>
                <p className="mt-1 text-xs text-slate-500">Select every clinic this supplier can provide items for.</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {[
                    { value: 'medical', label: 'General Medicine' },
                    { value: 'derma', label: 'Dermatology' },
                  ].map((clinic) => {
                    const checked = (form.clinics || []).includes(clinic.value)
                    return (
                      <label key={clinic.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition ${checked ? 'border-amber-300 bg-amber-50 text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                          checked={checked}
                          onChange={(e) => setForm((value) => {
                            const current = new Set(value.clinics || [])
                            if (e.target.checked) current.add(clinic.value)
                            else current.delete(clinic.value)
                            return { ...value, clinics: Array.from(current) }
                          })}
                        />
                        <span>{clinic.label}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            </>
          )}

          {type === 'movement_reasons' && (
            <>
              <label className="block">
                <span className="form-label">Movement Type *</span>
                <select
                  className="form-control mt-1.5"
                  value={form.movement_type || 'in'}
                  disabled={Boolean(editing && Number(form.is_system) === 1)}
                  onChange={(e) => setForm((value) => ({ ...value, movement_type: e.target.value }))}
                >
                  <option value="in">Stock In</option>
                  <option value="out">Stock Out</option>
                </select>
                {editing && Number(form.is_system) === 1 && <p className="mt-1 text-xs text-slate-400">Built-in reasons keep their Stock In / Stock Out type so existing inventory history remains consistent.</p>}
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input type="checkbox" className="mt-1" checked={Number(form.requires_batch) === 1} onChange={(e) => setForm((value) => ({ ...value, requires_batch: e.target.checked ? 1 : 0 }))} />
                <span><strong className="text-sm text-slate-800">Require exact batch selection</strong><span className="mt-0.5 block text-xs text-slate-500">Use this for reasons where the specific lot must remain traceable, such as expired, damaged, wastage, or returns.</span></span>
              </label>
              {editing && form.code && <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">Internal code: <code className="font-bold text-slate-700">{form.code}</code>. The code is kept stable and is not edited from System Setup.</div>}
            </>
          )}

          <label className="block">
            <span className="form-label">Status</span>
            <select className="form-control mt-1.5" value={Number(form.is_active) === 0 ? 0 : 1} onChange={(e) => setForm((value) => ({ ...value, is_active: Number(e.target.value) }))}>
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
          </label>

          <div className="flex justify-end gap-2">
            <button className="button-secondary" disabled={saving} onClick={close}>Cancel</button>
            <button className="button-primary" disabled={saving || !String(form.name || '').trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

const Admin_SystemSetup = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const validTab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'visits'
  const [tab, setTab] = useState(validTab)
  const [data, setData] = useState({ service_categories: [], uoms: [], suppliers: [], location_types: [], movement_reasons: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setData(await getSystemSetup())
    } catch (err) {
      setError(err.message || 'Could not load System Setup.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (validTab !== tab) setTab(validTab)
  }, [validTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'visits') load()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectTab = (key) => {
    setTab(key)
    if (key === 'visits') setSearchParams({})
    else setSearchParams({ tab: key })
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdSettings className="text-amber-500" /> System Setup</h1>
          <p className="mt-1 text-sm text-slate-500">Manage patient visit options, service categories, reusable inventory reference data, and Stock In / Stock Out movement reasons from one place.</p>
        </div>
        {tab !== 'visits' && <button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button>}
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => selectTab(key)} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === key ? 'bg-[#0b1a2c] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Icon /> {label}
          </button>
        ))}
      </div>

      {tab === 'visits' ? (
        <Admin_PatientBooking embedded />
      ) : loading ? (
        <LoadingState label="Loading System Setup..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <ReferenceManager type={tab} rows={data[tab] || []} onReload={load} />
      )}
    </div>
  )
}

export default Admin_SystemSetup





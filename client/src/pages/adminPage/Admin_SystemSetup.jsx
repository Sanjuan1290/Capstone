import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  MdAdd,
  MdCategory,
  MdEdit,
  MdInventory2,
  MdLocalShipping,
  MdPlace,
  MdRefresh,
  MdSettings,
} from 'react-icons/md'
import Admin_PatientBooking from './Admin_PatientBooking'
import Modal from '../../components/ui/Modal'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import { useToast } from '../../components/ui/ToastProvider'
import {
  getSystemSetup,
  saveBillingServiceCategory,
  saveInventoryLocationType,
  saveInventorySupplier,
  saveInventoryUom,
} from '../../services/admin.service'

const TABS = [
  { key: 'visits', label: 'Patient Visits', Icon: MdSettings },
  { key: 'service_categories', label: 'Service Categories', Icon: MdCategory },
  { key: 'uoms', label: 'Units of Measure', Icon: MdInventory2 },
  { key: 'suppliers', label: 'Suppliers', Icon: MdLocalShipping },
  { key: 'location_types', label: 'Location Types', Icon: MdPlace },
]

const clinicLabel = (value) => value === 'derma' ? 'Dermatology' : 'General Medicine'

const ReferenceManager = ({ type, rows, onReload }) => {
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const config = useMemo(() => ({
    service_categories: {
      title: 'Service Category',
      plural: 'Service Categories',
      singular: 'service category',
      save: saveBillingServiceCategory,
      description: 'These categories appear in Add Service. Deactivate a category to prevent new services from using it while keeping existing services intact.',
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
      description: 'Reusable suppliers grouped by clinic.',
    },
    location_types: {
      title: 'Location Type',
      plural: 'Location Types',
      singular: 'location type',
      save: saveInventoryLocationType,
      description: 'Reusable storage-location classifications.',
    },
  }[type]), [type])

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
        sort_order: row?.sort_order ?? 0,
      })
    }
    if (type === 'uoms') {
      setForm({
        name: row?.name || '',
        abbreviation: row?.abbreviation || '',
        is_active: row ? Number(row.is_active) : 1,
        sort_order: row?.sort_order ?? 0,
      })
    }
    if (type === 'suppliers') {
      setForm({
        name: row?.name || '',
        category: row?.category || 'medical',
        is_active: row ? Number(row.is_active) : 1,
      })
    }
    if (type === 'location_types') {
      setForm({
        name: row?.name || '',
        code: row?.code || '',
        is_active: row ? Number(row.is_active) : 1,
        sort_order: row?.sort_order ?? 0,
      })
    }
  }

  const save = async () => {
    if (!String(form.name || '').trim()) return toast.warning(`Enter a ${config.singular} name.`)
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
        <button className="button-primary" onClick={() => open()}><MdAdd /> Add {config.title}</button>
      </div>

      {!rows.length ? (
        <div className="p-5"><EmptyState title={`No ${config.plural.toLowerCase()} yet`} description="Add the first reusable option." /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Name</th>
                {type === 'service_categories' && <th className="px-5 py-3">Clinic</th>}
                {type === 'service_categories' && <th className="px-5 py-3">Order</th>}
                {type === 'service_categories' && <th className="px-5 py-3">Used By</th>}
                {type === 'uoms' && <th className="px-5 py-3">Abbreviation</th>}
                {type === 'suppliers' && <th className="px-5 py-3">Clinic</th>}
                {type === 'location_types' && <th className="px-5 py-3">Internal Code</th>}
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 font-semibold text-slate-800">{row.name}</td>
                  {type === 'service_categories' && <td className="px-5 py-4 text-slate-500">{clinicLabel(row.clinic_type)}</td>}
                  {type === 'service_categories' && <td className="px-5 py-4 text-slate-500">{Number(row.sort_order || 0)}</td>}
                  {type === 'service_categories' && <td className="px-5 py-4 text-slate-500">{Number(row.service_count || 0)} service{Number(row.service_count || 0) === 1 ? '' : 's'}</td>}
                  {type === 'uoms' && <td className="px-5 py-4 text-slate-500">{row.abbreviation || '—'}</td>}
                  {type === 'suppliers' && <td className="px-5 py-4 text-slate-500">{clinicLabel(row.category)}</td>}
                  {type === 'location_types' && <td className="px-5 py-4 font-mono text-xs text-slate-500">{row.code}</td>}
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
      )}

      <Modal open={Boolean(editing) || Boolean(form.name !== undefined && Object.keys(form).length)} onClose={close} title={`${editing ? 'Edit' : 'Add'} ${config.title}`} size="md">
        <div className="space-y-4">
          <label className="block">
            <span className="form-label">Name *</span>
            <input className="form-control mt-1.5" value={form.name || ''} onChange={(e) => setForm((value) => ({ ...value, name: e.target.value }))} />
          </label>

          {type === 'service_categories' && (
            <>
              <label className="block">
                <span className="form-label">Clinic *</span>
                <select className="form-control mt-1.5" value={form.clinic_type || 'medical'} disabled={Boolean(editing && Number(editing.service_count || 0) > 0)} onChange={(e) => setForm((value) => ({ ...value, clinic_type: e.target.value }))}>
                  <option value="medical">General Medicine</option>
                  <option value="derma">Dermatology</option>
                </select>
                {editing && Number(editing.service_count || 0) > 0 && <p className="mt-1 text-xs text-slate-400">Clinic is locked because this category is already used by {Number(editing.service_count)} service{Number(editing.service_count) === 1 ? '' : 's'}. You can still rename, reorder, or deactivate it.</p>}
              </label>
              <label className="block">
                <span className="form-label">Display Order</span>
                <input type="number" min="0" step="1" className="form-control mt-1.5" value={form.sort_order ?? 0} onChange={(e) => setForm((value) => ({ ...value, sort_order: Number(e.target.value) || 0 }))} />
                <p className="mt-1 text-xs text-slate-400">Lower numbers appear first in the Add Service category list.</p>
              </label>
            </>
          )}

          {type === 'uoms' && (
            <label className="block">
              <span className="form-label">Abbreviation</span>
              <input className="form-control mt-1.5" value={form.abbreviation || ''} onChange={(e) => setForm((value) => ({ ...value, abbreviation: e.target.value }))} placeholder="e.g. cap, pc, mL" />
            </label>
          )}

          {type === 'suppliers' && (
            <label className="block">
              <span className="form-label">Clinic *</span>
              <select className="form-control mt-1.5" value={form.category || 'medical'} onChange={(e) => setForm((value) => ({ ...value, category: e.target.value }))}>
                <option value="medical">General Medicine</option>
                <option value="derma">Dermatology</option>
              </select>
            </label>
          )}

          {type === 'location_types' && (
            <label className="block">
              <span className="form-label">Internal Code</span>
              <input className="form-control mt-1.5" value={form.code || ''} onChange={(e) => setForm((value) => ({ ...value, code: e.target.value }))} placeholder="Generated from the name for new types" />
              <p className="mt-1 text-xs text-slate-400">Once used by a storage location, the internal code cannot be changed.</p>
            </label>
          )}

          <label className="block">
            <span className="form-label">Status</span>
            <select className="form-control mt-1.5" value={Number(form.is_active) === 0 ? 0 : 1} onChange={(e) => setForm((value) => ({ ...value, is_active: Number(e.target.value) }))}>
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
          </label>

          <div className="flex justify-end gap-2">
            <button className="button-secondary" onClick={close}>Cancel</button>
            <button className="button-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
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
  const [data, setData] = useState({ service_categories: [], uoms: [], suppliers: [], location_types: [] })
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
          <p className="mt-1 text-sm text-slate-500">Manage patient visit options, service categories, and reusable inventory reference data from one place.</p>
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

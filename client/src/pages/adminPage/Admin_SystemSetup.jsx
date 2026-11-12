import useClinicRefresh from '../../hooks/useClinicRefresh'
import { useEffect, useMemo, useRef, useState } from 'react'
import { portalBaseForPath } from '../../utils/branchPortalPath.mjs'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdWarningAmber,
  MdRefresh,
  MdSettings,
} from 'react-icons/md'
import Admin_PatientBooking from './Admin_PatientBooking'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import SystemSetupTabs, { SYSTEM_SETUP_TABS } from '../../components/system/SystemSetupTabs'
import StockRoomsManager from '../../components/system/StockRoomsManager'
import QueueDisplaySecurity from '../../components/system/QueueDisplaySecurity'
import SetupTableActions, { SETUP_ACTION_BUTTON, SETUP_ACTION_CELL } from '../../components/system/SetupTableActions'
import useClientPagination from '../../hooks/useClientPagination'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import { useToast } from '../../components/ui/ToastProvider'
import {
  getSystemSetup,
  deleteAppointmentCancellationReason,
  saveAppointmentCancellationReason,
  deleteBillingServiceCategory,
  deleteInventorySupplier,
  deleteInventoryLocationType,
  deleteInventoryMovementReason,
  saveBillingServiceCategory,
  saveInventoryLocationType,
  saveInventoryMovementReason,
  saveInventorySupplier,
} from '../../services/admin.service'

const TABS = SYSTEM_SETUP_TABS.filter((item) => !['billing_setup', 'location_types'].includes(item.key))

const clinicLabel = (value) => value === 'derma' ? 'Dermatology' : 'General Medicine'
const parseSupplierClinics = (value) => String(value || '').split(',').map((entry) => entry.trim()).filter((entry) => ['medical','derma'].includes(entry))
const supplierClinicLabel = (value) => {
  const clinics = parseSupplierClinics(value)
  return clinics.length ? clinics.map(clinicLabel).join(', ') : '—'
}

const ReferenceManager = ({ type, rows, onReload, portalBase = '/admin' }) => {
  const referenceLocation = useLocation()
  const superAdminMode = referenceLocation.pathname.startsWith('/superadmin/')
  const workspaceBranch = referenceLocation.pathname.match(/^\/superadmin\/branches\/(\d+)(?:\/|$)/)
  const globalSetup = superAdminMode && !workspaceBranch
  const canEditReference = (row) => type !== 'movement_reasons' || (globalSetup
    ? row.branch_id == null
    : row.branch_id != null && (!workspaceBranch || Number(row.branch_id) === Number(workspaceBranch[1])))
  const canRemoveReference = (row) => canEditReference(row) && !(type === 'movement_reasons' && Number(row.is_system) === 1)
  const getUsage = (row) => Number(type === 'service_categories' ? row.service_count : type === 'cancellation_reasons' ? row.appointment_count : row.usage_count || 0)
  const deleteAction = (row) => getUsage(row) > 0 ? 'Deactivate' : 'Delete'
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')


  const nameMaxLength = {
    service_categories: 120,
    suppliers: 160,
    location_types: 80,
    movement_reasons: 120,
    cancellation_reasons: 120,
  }[type] || 120

  const config = useMemo(() => ({
    cancellation_reasons: {
      title: 'Reason for Cancellation',
      plural: 'Reasons for Cancellation',
      singular: 'cancellation reason',
      save: saveAppointmentCancellationReason,
      description: 'Reusable reasons shown whenever a Patient, Admin, or Staff member cancels an appointment. “Other” is always available separately and requires an explanation.',
    },
    service_categories: {
      title: 'Service Category',
      plural: 'Service Categories',
      singular: 'service category',
      save: saveBillingServiceCategory,
      description: 'Categories only group actual services. They are shown alphabetically in Add Service; create bookable services under System Setup → Services & Pricing Setup → Services & Pricing.',
    },
    suppliers: {
      title: 'Supplier',
      plural: 'Suppliers',
      singular: 'supplier',
      save: saveInventorySupplier,
      description: 'Reusable supplier/company records with clinic assignment and contact details.',
    },
    location_types: {
      title: 'Storage Location',
      plural: 'Storage Locations',
      singular: 'storage location',
      save: saveInventoryLocationType,
      description: 'Reusable Storage Locations assigned directly to inventory items. Add at least one before creating inventory items.',
    },
    movement_reasons: {
      title: 'Movement Reason',
      plural: 'Movement Reasons',
      singular: 'movement reason',
      save: saveInventoryMovementReason,
      description: 'Add Stock In / Stock Out reasons for this clinic. Shared reasons are read-only. Changes to this clinic do not affect other branches.',
    },
  }[type]), [type])

  const pagination = useClientPagination(rows, { initialPageSize: 10, resetDeps: [type] })

  const close = () => {
    setEditing(null)
    setForm({})
  }

  const open = (row = null) => {
    setEditing(row)
    if (type === 'cancellation_reasons') {
      setForm({
        name: row?.label || '',
        is_active: row ? Number(row.is_active) : 1,
      })
    }
    if (type === 'service_categories') {
      setForm({
        name: row?.name || '',
        clinic_type: row?.clinic_type || 'medical',
        is_active: row ? Number(row.is_active) : 1,
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
        is_active: row ? Number(row.is_active) : 1,
        is_system: row ? Number(row.is_system) : 0,
      })
    }
  }

  const save = async () => {
    if (!String(form.name || '').trim()) return toast.warning(`Enter a ${config.singular} name.`)
    if (type === 'suppliers' && !(form.clinics || []).length) return toast.warning('Select at least one clinic.')
    setSaving(true)
    try {
      const payload = type === 'cancellation_reasons'
        ? { label: String(form.name).trim(), is_active: form.is_active }
        : { ...form, name: String(form.name).trim() }
      await config.save(payload, editing?.id || null)
      toast.success(`${config.title} ${editing ? 'updated' : 'added'}.`)
      close()
      await onReload()
    } catch (err) {
      toast.error(err.message || `Could not save ${config.singular}.`)
    } finally {
      setSaving(false)
    }
  }


  const requestDelete = (row) => {
    if (!canEditReference(row)) return
    setDeleteError('')
    setDeleteTarget(row)
  }

  const referencePayload = (row,isActive) => type === 'cancellation_reasons'
    ? {label:row.label,is_active:isActive}
    : type === 'suppliers'
      ? {name:row.name,contact_person:row.contact_person,contact_number:row.contact_number,address:row.address,clinics:parseSupplierClinics(row.category),is_active:isActive}
      : {...row,is_active:isActive}

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const handlers = {
        service_categories: deleteBillingServiceCategory,
        cancellation_reasons: deleteAppointmentCancellationReason,
        suppliers: deleteInventorySupplier,
        location_types: deleteInventoryLocationType,
        movement_reasons: deleteInventoryMovementReason,
      }
      let result
      if (getUsage(deleteTarget) > 0) {
        result = await config.save(referencePayload(deleteTarget,0),deleteTarget.id)
        if (Number(result?.is_active) !== 0) throw new Error('The server did not confirm deactivation.')
      } else {
        result = await handlers[type](deleteTarget.id)
        if (result?.deleted !== true && result?.deactivated !== true) throw new Error('The server returned an outdated removal response. Check that the updated backend has deployed successfully, then refresh this list.')
      }
      toast.success(result?.message || (result?.deleted ? `${config.title} permanently deleted.` : `${config.title} deactivated.`))
      setDeleteTarget(null)
      await onReload()
    } catch (err) {
      setDeleteError(err.message || `Could not update ${config.singular}.`)
      toast.error(err.message || `Could not update ${config.singular}.`)
    } finally {
      setDeleting(false)
    }
  }

  const reactivate = async (row) => {
    try {
      const result = await config.save(referencePayload(row,1),row.id)
      if(Number(result?.is_active)!==1) throw new Error('The server did not confirm reactivation.')
      toast.success(`${config.title} reactivated.`)
      await onReload()
    } catch(err) { toast.error(err.message || `Could not reactivate ${config.singular}.`) }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="font-black text-slate-900">{config.plural}</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">{config.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {type === 'service_categories' && <Link className="button-secondary" to={`${portalBase}/system-setup/billing/services`}>Manage Services & Pricing</Link>}
          {<button type="button" className="button-primary" onClick={() => open()}><MdAdd /> {type === 'movement_reasons' && !globalSetup ? 'Add Branch Reason' : `Add ${config.title}`}</button>}
        </div>
      </div>

      {!rows.length ? (
        <div className="p-5"><EmptyState title={`No ${config.plural.toLowerCase()} yet`} description={type === 'movement_reasons' ? 'You can add Stock In or Stock Out reasons for this clinic. Shared Super Admin reasons will also appear here when available.' : 'Add the first reusable option.'} /></div>
      ) : (
        <div>
          <div className="overflow-x-auto">
          <table className={`w-full text-sm ${type === 'suppliers' ? 'min-w-[1160px]' : type === 'movement_reasons' ? 'min-w-[830px]' : 'min-w-[820px]'}`}>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Name</th>
                {type === 'cancellation_reasons' && <><th className="px-5 py-3">Used By</th></>}
                {type === 'service_categories' && <th className="px-5 py-3">Clinic</th>}
                {type === 'service_categories' && <th className="px-5 py-3">Used By</th>}
                {type === 'suppliers' && <th className="px-5 py-3">Contact</th>}
                {type === 'suppliers' && <th className="px-5 py-3">Address</th>}
                {type === 'suppliers' && <th className="px-5 py-3">Clinic</th>}
                {type === 'movement_reasons' && <th className="px-5 py-3">Movement</th>}
                <th className="min-w-[100px] px-5 py-3">Status</th>
                <th className={SETUP_ACTION_CELL}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagination.pageItems.map((row) => (
                <tr key={row.id} className="align-middle">
                  <td className="min-w-[180px] px-5 py-4 font-semibold text-slate-800 break-words">{row.label || row.name}{type === 'movement_reasons' && <span className="ml-2 text-xs font-normal text-slate-400">{row.branch_id == null ? 'Shared' : 'This clinic'}</span>}</td>
                  {type === 'cancellation_reasons' && <><td className="px-5 py-4 text-slate-500">{Number(row.appointment_count || 0)} appointment{Number(row.appointment_count || 0) === 1 ? '' : 's'}</td></>}
                  {type === 'service_categories' && <td className="px-5 py-4 text-slate-500">{clinicLabel(row.clinic_type)}</td>}
                  {type === 'service_categories' && <td className="px-5 py-4 text-slate-500">{Number(row.service_count || 0)} service{Number(row.service_count || 0) === 1 ? '' : 's'}</td>}
                  {type === 'suppliers' && <td className="px-5 py-4 text-slate-500"><p className="font-semibold text-slate-700">{row.contact_person || '—'}</p><p className="mt-1 text-xs">{row.contact_number || 'No contact number'}</p></td>}
                  {type === 'suppliers' && <td className="max-w-xs px-5 py-4 text-slate-500">{row.address || '—'}</td>}
                  {type === 'suppliers' && <td className="px-5 py-4 text-slate-500">{supplierClinicLabel(row.category)}</td>}
                  {type === 'movement_reasons' && <td className="px-5 py-4 text-slate-500"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.movement_type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{row.movement_type === 'in' ? 'Stock In' : 'Stock Out'}</span></td>}
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(row.is_active) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {Number(row.is_active) === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className={SETUP_ACTION_CELL}>
                    <SetupTableActions
                      note={!canEditReference(row) ? (globalSetup ? 'Managed by branch' : 'Shared · read only') : null}
                      primary={canEditReference(row) ? <button type="button" className={SETUP_ACTION_BUTTON} onClick={() => open(row)}><MdEdit /> Edit</button> : null}
                      secondary={canRemoveReference(row) && Number(row.is_active) === 0 && getUsage(row) > 0
                        ? <button type="button" className={SETUP_ACTION_BUTTON} onClick={() => reactivate(row)}>Reactivate</button>
                        : canRemoveReference(row) && (Number(row.is_active) === 1 || getUsage(row) === 0)
                          ? <button type="button" className={`${SETUP_ACTION_BUTTON} ${getUsage(row) === 0 ? '!border-rose-200 !text-rose-600 hover:!bg-rose-50' : ''}`} onClick={() => requestDelete(row)}><MdDelete /> {deleteAction(row)}</button>
                          : null}
                    />
                  </td>
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

      <Modal open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} title={`${deleteTarget ? deleteAction(deleteTarget) : 'Remove'} ${config.title}`} size="sm">
        {deleteTarget && <div className="space-y-4">
          <div className={`flex items-start gap-3 rounded-2xl border p-4 ${getUsage(deleteTarget) > 0 ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'}`}>
            <MdWarningAmber className="mt-0.5 shrink-0 text-xl" />
            <div>
              <p className="font-bold text-slate-900">{deleteTarget.label || deleteTarget.name}</p>
              <p className="mt-1 text-sm text-slate-600">{getUsage(deleteTarget) > 0
                ? `This record has ${getUsage(deleteTarget)} linked or potentially linked record(s). Deactivating hides it from new selections but keeps historical records.`
                : 'The record has no known references. Permanent deletion cannot be undone. The server checks again before deleting.'}</p>
            </div>
          </div>
          {deleteError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="button-secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button type="button" className={getUsage(deleteTarget) > 0 ? 'button-primary' : 'button-primary !bg-rose-600 hover:!bg-rose-700'} disabled={deleting} onClick={confirmDelete}>{deleting ? 'Saving…' : `${deleteAction(deleteTarget)} ${config.title}`}</button>
          </div>
        </div>}
      </Modal>
    </section>
  )
}

const Admin_SystemSetup = () => {
  const location = useLocation()
  const portalBase = portalBaseForPath(location.pathname)
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const validTab = TABS.some((item) => item.key === requestedTab) ? requestedTab : 'visits'
  const [tab, setTab] = useState(validTab)
  const [data, setData] = useState({ cancellation_reasons: [], service_categories: [], suppliers: [], location_types: [], movement_reasons: [] })
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)

  const load = async () => {
    const version = ++requestVersion.current
    setLoading(true)
    try {
      const result = await getSystemSetup()
      if (version !== requestVersion.current) return
      setData(result)
      setLoaded(true)
      setError('')
    } catch (err) {
      if (version === requestVersion.current) setError(err.message || 'Could not refresh System Setup.')
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }

  useClinicRefresh(load,['service.updated','settings.updated'],{fallbackMs:90000,skip:()=>['visits','stock_rooms','queue_security'].includes(tab)})

  useEffect(() => {
    if (validTab !== tab) setTab(validTab)
  }, [validTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!['visits', 'stock_rooms', 'queue_security'].includes(tab)) load()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdSettings className="text-amber-500" /> System Setup</h1>
          <p className="mt-1 text-sm text-slate-500">Manage patient visit options, cancellation reasons, services and pricing setup, service categories, reusable inventory reference data, and Stock In / Stock Out movement reasons from one place.</p>
        </div>
        {!['visits', 'stock_rooms', 'queue_security'].includes(tab) && <button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button>}
      </div>

      <SystemSetupTabs />

      {loaded && loading && <p role="status" className="text-xs text-slate-500">Updating list…</p>}
      {loaded && error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error} <button type="button" className="underline" onClick={load}>Retry</button></div>}
      {tab === 'visits' ? (
        <Admin_PatientBooking embedded />
      ) : tab === 'stock_rooms' ? (
        <StockRoomsManager />
      ) : tab === 'queue_security' ? (
        <QueueDisplaySecurity />
      ) : loading && !loaded ? (
        <LoadingState label="Loading System Setup..." />
      ) : error && !loaded ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <ReferenceManager type={tab} rows={data[tab] || []} onReload={load} portalBase={portalBase} />
      )}
    </div>
  )
}

export default Admin_SystemSetup





import { useCallback, useEffect, useState } from 'react'
import { MdHistory, MdRefresh, MdSearch, MdVisibility, MdEventAvailable, MdInventory2, MdSwapHoriz, MdCalendarMonth, MdPayments, MdSettings, MdSecurity } from 'react-icons/md'
import { getAuditLogs } from '../../services/admin.service'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { useToast } from '../../components/ui/ToastProvider'

const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-PH', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '—'

const formatDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', {
  month: 'short', day: 'numeric', year: 'numeric',
}) : '—'

const parseValue = (value) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return value }
}

const titleCase = (value) => String(value || '')
  .replace(/[._-]+/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase())

const roleLabel = (role) => ({ admin: 'Administrator', staff: 'Staff', doctor: 'Doctor', patient: 'Patient', system: 'System' }[role] || titleCase(role))

const moduleMeta = (type, action = '') => {
  if (String(action).startsWith('auth.') || String(action).startsWith('security.') || ['admin', 'staff', 'doctor', 'patient'].includes(type)) return { label: 'Account & Security', Icon: MdSecurity }
  if (type === 'appointment') return { label: 'Appointments', Icon: MdEventAvailable }
  if (['doctor_schedule', 'doctor_unavailable_date'].includes(type)) return { label: 'Doctor Schedule', Icon: MdCalendarMonth }
  if (type === 'inventory_item') return { label: 'Inventory', Icon: MdInventory2 }
  if (type === 'supply_request') return { label: 'Stock Transfers', Icon: MdSwapHoriz }
  if (String(type).startsWith('billing') || type === 'cashier_closing' || type === 'discount_preset' || type === 'clinic_payment_settings') return { label: 'Billing', Icon: MdPayments }
  if (type === 'billing_service') return { label: 'Service Catalog', Icon: MdPayments }
  if (type === 'clinic_settings') return { label: 'Clinic Settings', Icon: MdSettings }
  if (type === 'report') return { label: 'Reports', Icon: MdHistory }
  if (type === 'consultation') return { label: 'Clinical Records', Icon: MdEventAvailable }
  return { label: titleCase(type || 'System'), Icon: MdHistory }
}

const AREA_OPTIONS = [
  { value: 'account_security', label: 'Account & Security' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'doctor_schedule', label: 'Doctor Schedule' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'stock_transfers', label: 'Stock Transfers' },
  { value: 'billing', label: 'Billing' },
  { value: 'service_catalog', label: 'Service Catalog' },
  { value: 'clinical', label: 'Clinical Records' },
  { value: 'reports', label: 'Reports' },
  { value: 'clinic_settings', label: 'Clinic Settings' },
]

const quantityLabel = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-PH') : value
}

const auditPresentation = (row) => {
  const oldValues = parseValue(row.old_values) || {}
  const newValues = parseValue(row.new_values) || {}
  const actor = row.performed_by || 'System'
  const action = String(row.action || '')
  const appointmentPatient = row.appointment_patient_name || newValues.patient_name || 'the patient'
  const appointmentDoctor = row.appointment_doctor_name || newValues.doctor_name
  const itemName = row.inventory_item_name || row.supply_item_name || newValues.item_name || newValues.material_name || 'inventory item'
  const scheduleDoctor = row.schedule_doctor_name || newValues.doctor_name || 'the doctor'
  const supplyDoctor = row.supply_doctor_name || newValues.doctor_name || 'the doctor'
  const supplyQty = row.supply_quantity ?? newValues.qty_requested ?? newValues.quantity
  const supplyDestination = row.supply_destination || newValues.destination_location
  const statusChange = oldValues.status && newValues.status ? `${titleCase(oldValues.status)} → ${titleCase(newValues.status)}` : null
  const details = []
  let description = `${actor} ${titleCase(action).toLowerCase()}.`

  switch (action) {
    case 'auth.login_success':
      description = `${actor} logged in to the ${roleLabel(row.user_role)} Portal.`
      break
    case 'auth.login_failed':
      description = row.entity_id ? `A failed login attempt was recorded for ${actor}.` : `A failed ${roleLabel(row.user_role).toLowerCase()} login attempt was recorded.`
      break
    case 'auth.logout':
      description = `${actor} logged out.`
      break
    case 'password_changed':
    case 'first_password_change_completed':
      description = `${actor} changed the account password.`
      break
    case 'security.phone_changed':
      description = `${actor} changed the patient mobile number.`
      break
    case 'security.clinical_upload_scan_bypass_authorized':
      description = `${actor} continued a clinical image upload without malware scanning after the scanner became unavailable.`
      break
    case 'security.clinical_upload_blocked':
      description = `The malware scanner blocked an unsafe clinical image uploaded by ${actor}.`
      break
    case 'security.payment_qr_scan_bypass_authorized':
      description = `${actor} continued a ${titleCase(newValues.provider || 'payment')} QR upload without malware scanning after the scanner became unavailable.`
      break
    case 'security.payment_qr_upload_blocked':
      description = `The malware scanner blocked an unsafe ${titleCase(newValues.provider || 'payment')} QR image uploaded by ${actor}.`
      break
    case 'appointment.created':
      description = `${actor} created an appointment for ${appointmentPatient}.`
      break
    case 'appointment.confirmed':
      description = oldValues.status === 'pending'
        ? `${actor} accepted ${appointmentPatient}'s appointment.`
        : `${actor} confirmed ${appointmentPatient}'s appointment.`
      break
    case 'appointment.cancelled':
      description = oldValues.status === 'pending'
        ? `${actor} declined ${appointmentPatient}'s appointment.`
        : `${actor} cancelled ${appointmentPatient}'s appointment.`
      break
    case 'appointment.no_show':
      description = `${actor} marked ${appointmentPatient}'s appointment as No Show.`
      break
    case 'appointment.rescheduled':
      description = `${actor} rescheduled ${appointmentPatient}'s appointment.`
      break
    case 'schedule.updated':
      description = `${actor} changed ${scheduleDoctor}'s ${newValues.day_of_week || 'weekly'} availability.`
      break
    case 'schedule.unavailable_date_saved':
      description = `${actor} marked ${scheduleDoctor} unavailable on ${formatDate(newValues.unavailable_date)}.`
      break
    case 'schedule.unavailable_date_removed':
      description = `${actor} restored ${scheduleDoctor}'s availability on ${formatDate(newValues.unavailable_date)}.`
      break
    case 'inventory.item_created':
      description = `${actor} added ${itemName} to inventory.`
      break
    case 'inventory.item_deleted':
      description = `${actor} removed ${newValues.item_name || oldValues.item_name || oldValues.name || itemName} from inventory.`
      break
    case 'inventory.stock_moved': {
      const direction = newValues.type === 'in' ? 'stocked in' : newValues.type === 'out' ? 'stocked out' : 'updated stock for'
      const qty = quantityLabel(newValues.quantity ?? newValues.qty)
      description = `${actor} ${direction} ${qty ? `${qty} ` : ''}${itemName}.`
      break
    }
    case 'supply.request_created':
      description = `${actor} requested ${quantityLabel(newValues.qty_requested)} ${itemName}${newValues.destination_location ? ` for ${newValues.destination_location}` : ''}.`
      break
    case 'supply.request_approved':
      description = `${actor} approved ${supplyDoctor}'s stock transfer request${supplyQty ? ` for ${quantityLabel(supplyQty)} ${itemName}` : ''}${supplyDestination ? ` to ${supplyDestination}` : ''}.`
      break
    case 'supply.request_rejected':
      description = `${actor} rejected ${supplyDoctor}'s stock transfer request${supplyQty ? ` for ${quantityLabel(supplyQty)} ${itemName}` : ''}.`
      break
    case 'billing.draft_updated':
      description = `${actor} updated the billing draft${row.billing_patient_name ? ` for ${row.billing_patient_name}` : ''}.`
      break
    case 'billing.finalized':
      description = `${actor} finalized the bill${row.billing_patient_name ? ` for ${row.billing_patient_name}` : ''}.`
      break
    case 'billing.payment_received':
      description = `${actor} recorded a payment${newValues.payment_amount ? ` of ₱${Number(newValues.payment_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : ''}.`
      break
    case 'billing.payment_voided':
      description = `${actor} voided a billing payment.`
      break
    case 'billing.payment_refunded':
      description = `${actor} refunded a billing payment${newValues.refund_delta ? ` by ₱${Number(newValues.refund_delta).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : ''}.`
      break
    case 'billing.adjustment_approved':
      description = `${actor} approved billing adjustment request #${row.entity_id}.`
      break
    case 'billing.adjustment_rejected':
      description = `${actor} rejected billing adjustment request #${row.entity_id}.`
      break
    case 'catalog.service_created':
      description = `${actor} added ${newValues.service_name || 'a service'} to the Service Catalog.`
      break
    case 'catalog.service_updated':
      description = `${actor} updated ${newValues.service_name || 'a Service Catalog item'}.`
      break
    case 'billing.payment_settings_updated':
      description = `${actor} updated Billing payment settings.`
      break
    case 'reports.exported':
      description = `${actor} exported a clinic report.`
      break
    case 'settings.clinic_updated':
      description = `${actor} updated Clinic Settings.`
      break
    case 'account.staff_created':
      description = `${actor} created the staff account for ${newValues.full_name || 'a staff member'}.`
      break
    case 'account.staff_updated':
      description = `${actor} updated the staff account for ${newValues.full_name || 'a staff member'}.`
      break
    case 'account.doctor_created':
      description = `${actor} created the doctor account for ${newValues.full_name || 'a doctor'}.`
      break
    case 'account.doctor_updated':
      description = `${actor} updated the doctor account for ${newValues.full_name || 'a doctor'}.`
      break
    case 'clinical.consultation_finalized':
      description = `${actor} finalized consultation #${row.entity_id}.`
      break
    case 'clinical.consultation_amended':
      description = `${actor} amended consultation #${row.entity_id}.`
      break
    default:
      description = `${actor} ${String(action || 'performed an action').replace(/[._]/g, ' ')}.`
  }

  if (appointmentPatient && row.entity_type === 'appointment') details.push(['Patient', appointmentPatient])
  if (appointmentDoctor) details.push(['Doctor', appointmentDoctor])
  if (row.appointment_date) details.push(['Schedule', `${formatDate(row.appointment_date)}${row.appointment_time ? ` · ${row.appointment_time}` : ''}`])
  if (statusChange) details.push(['Status', statusChange])

  if (action === 'schedule.updated') {
    details.push(['Doctor', scheduleDoctor])
    details.push(['Day', newValues.day_of_week || '—'])
    details.push(['Availability', Number(newValues.is_active) === 0 ? 'Unavailable' : `${newValues.start_time || '—'} – ${newValues.end_time || '—'}`])
  }
  if (action.startsWith('schedule.unavailable_date')) {
    details.push(['Doctor', scheduleDoctor])
    details.push(['Date', formatDate(newValues.unavailable_date)])
    if (newValues.reason) details.push(['Reason', newValues.reason])
  }

  if (action === 'inventory.stock_moved') {
    details.push(['Item', itemName])
    details.push(['Movement', newValues.type === 'in' ? 'Stock In' : newValues.type === 'out' ? 'Stock Out' : titleCase(newValues.movement_type || 'Stock Update')])
    details.push(['Quantity', quantityLabel(newValues.quantity ?? newValues.qty) || '—'])
    if (newValues.movement_type) details.push(['Reason', titleCase(newValues.movement_type)])
    if (newValues.note) details.push(['Note', newValues.note])
  }

  if (action.startsWith('supply.request_')) {
    details.push(['Requested by', supplyDoctor])
    details.push(['Item', itemName])
    if (supplyQty) details.push(['Quantity', quantityLabel(supplyQty)])
    if (supplyDestination) details.push(['Destination', supplyDestination])
    if (row.supply_reason || newValues.reason) details.push(['Request Reason', row.supply_reason || newValues.reason])
    if (row.supply_resolution_note || newValues.resolution_note) details.push(['Resolution Note', row.supply_resolution_note || newValues.resolution_note])
  }

  if (newValues.reason && !details.some(([label]) => label.includes('Reason'))) details.push(['Reason', newValues.reason])

  return { ...moduleMeta(row.entity_type, action), description, details, oldValues, newValues }
}

const Admin_AuditLogs = () => {
  const toast = useToast()
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ search: '', start_date: '', end_date: '', user_role: '', area: '', action: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await getAuditLogs({ ...filters, page, limit: 20 })) }
    catch (error) { toast.error(error.message || 'Could not load audit logs.') }
    finally { setLoading(false) }
  }, [filters, page, toast])

  useEffect(() => { load() }, [load])

  const update = (key, value) => { setPage(1); setFilters((prev) => ({ ...prev, [key]: value })) }
  const selectedPresentation = selected ? auditPresentation(selected) : null

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdHistory className="text-amber-500" /> Audit Logs</h1>
          <p className="mt-1 text-sm text-slate-500">A clear history of important clinic actions. Technical MFA handshake events are kept securely but hidden from this activity feed.</p>
        </div>
        <button type="button" className="button-secondary" onClick={load}><MdRefresh /> Refresh</button>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative md:col-span-2"><MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-11" placeholder="Search activity, person, item, or reference…" value={filters.search} onChange={(e) => update('search', e.target.value)} /></label>
          <input type="date" className="form-control" value={filters.start_date} onChange={(e) => update('start_date', e.target.value)} aria-label="Start date" />
          <input type="date" className="form-control" value={filters.end_date} onChange={(e) => update('end_date', e.target.value)} aria-label="End date" />
          <select className="form-control" value={filters.user_role} onChange={(e) => update('user_role', e.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="staff">Staff</option><option value="doctor">Doctor</option><option value="patient">Patient</option><option value="system">System</option></select>
          <select className="form-control" value={filters.area} onChange={(e) => update('area', e.target.value)}><option value="">All areas</option>{AREA_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Date / Time</th><th className="px-3 py-3">Activity</th><th className="px-3 py-3">Area</th><th className="px-3 py-3">Performed By</th><th className="px-3 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="5" className="p-10 text-center text-slate-400">Loading audit activity…</td></tr> : data.items?.length ? data.items.map((row) => {
                const presentation = auditPresentation(row)
                const Icon = presentation.Icon
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-4 text-slate-500">{formatDateTime(row.created_at)}</td>
                    <td className="max-w-[540px] px-3 py-4"><p className="font-semibold leading-relaxed text-slate-900">{presentation.description}</p></td>
                    <td className="px-3 py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"><Icon className="text-sm" />{presentation.label}</span></td>
                    <td className="px-3 py-4"><p className="font-medium text-slate-700">{row.performed_by || 'System'}</p><p className="text-xs text-slate-400">{roleLabel(row.user_role || 'system')}</p></td>
                    <td className="px-3 py-4 text-right"><button type="button" className="button-secondary" onClick={() => setSelected(row)}><MdVisibility /> Details</button></td>
                  </tr>
                )
              }) : <tr><td colSpan="5" className="p-10 text-center text-slate-400">No audit events match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={data.pagination?.page || page} totalPages={data.pagination?.totalPages || 1} total={data.pagination?.total || 0} pageSize={data.pagination?.limit || 20} onPageChange={setPage} disabled={loading} />
      </section>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Activity Details" description={selected ? `${formatDateTime(selected.created_at)} · ${selected.performed_by || 'System'}` : ''} size="xl">
        {selected && selectedPresentation && <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Activity</p>
            <p className="mt-2 text-lg font-black leading-relaxed text-slate-900">{selectedPresentation.description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Performed By</p><p className="mt-1 font-bold text-slate-900">{selected.performed_by || 'System'}</p><p className="text-xs text-slate-500">{roleLabel(selected.user_role)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Area</p><p className="mt-1 font-bold text-slate-900">{selectedPresentation.label}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Date / Time</p><p className="mt-1 font-bold text-slate-900">{formatDateTime(selected.created_at)}</p></div>
          </div>

          {selectedPresentation.details.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Recorded Details</h3>
              <dl className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {selectedPresentation.details.map(([label, value], index) => (
                  <div key={`${label}-${index}`} className="grid gap-1 border-b border-slate-100 px-4 py-3 last:border-0 sm:grid-cols-[180px_1fr]">
                    <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                    <dd className="break-words text-sm font-medium text-slate-700">{String(value ?? '—')}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-700">Technical Details</summary>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Action Code</p><p className="mt-1 break-all font-mono text-xs text-slate-600">{selected.action}</p></div>
              <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reference</p><p className="mt-1 font-mono text-xs text-slate-600">{selected.entity_type}{selected.entity_id ? ` #${selected.entity_id}` : ''}</p></div>
              <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">IP Address</p><p className="mt-1 font-mono text-xs text-slate-600">{selected.ip_address || 'Not recorded'}</p></div>
            </div>
          </details>
        </div>}
      </Modal>
    </div>
  )
}

export default Admin_AuditLogs




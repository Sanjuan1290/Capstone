import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MdAdd, MdArrowBack, MdDelete, MdInventory2, MdSearch, MdWarningAmber } from 'react-icons/md'
import {
  getInventoryItems,
  getInventoryLocations,
  getTransferAppointments,
  getAppointmentInventoryReadiness,
  submitRequest,
} from '../../services/doctor.service'
import { useToast } from '../../components/ui/ToastProvider'
import { LoadingState, ErrorState } from '../../components/ui/PageState'

const stockUnit = (item) => item?.uom || item?.unit || item?.base_unit || 'unit'
const qtyStep = (item) => Number(item?.uom_allow_decimal) === 1 ? 0.01 : 1
const statusLabel = (value) => value === 'in-progress' ? 'In Consultation' : value === 'rescheduled' ? 'Rescheduled' : 'Confirmed'

const Doctor_StockTransferRequest = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [appointmentId, setAppointmentId] = useState(searchParams.get('appointment_id') || '')
  const [readiness, setReadiness] = useState(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [destination, setDestination] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getInventoryItems(), getInventoryLocations(), getTransferAppointments()])
      .then(([inventoryRows, locationRows, appointmentRows]) => {
        setItems(Array.isArray(inventoryRows) ? inventoryRows : [])
        setLocations(Array.isArray(locationRows) ? locationRows : [])
        setAppointments(Array.isArray(appointmentRows) ? appointmentRows : [])
      })
      .catch((err) => setError(err.message || 'Could not load stock transfer form.'))
      .finally(() => setLoading(false))
  }, [])

  const selectedAppointment = useMemo(
    () => appointments.find((entry) => String(entry.id) === String(appointmentId)) || null,
    [appointments, appointmentId]
  )

  useEffect(() => {
    if (!appointmentId) {
      setReadiness(null)
      setSelected([])
      return
    }
    setReadinessLoading(true)
    getAppointmentInventoryReadiness(appointmentId)
      .then((result) => {
        setReadiness(result)
        const preferred = locations.find((entry) => entry.name === result?.treatment_room)
        if (preferred) setDestination(String(preferred.id))
        setReason((current) => current || `Preparation for appointment #${appointmentId}${result?.appointment?.patient_name ? ` · ${result.appointment.patient_name}` : ''}`)
      })
      .catch((err) => {
        setReadiness(null)
        toast.error(err.message || 'Could not check appointment inventory readiness.')
      })
      .finally(() => setReadinessLoading(false))
  }, [appointmentId, locations, toast])

  const selectedIds = useMemo(() => new Set(selected.map((entry) => Number(entry.inventory_id))), [selected])
  const filtered = useMemo(() => items.filter((item) => {
    if (selectedIds.has(Number(item.id))) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${item.name} ${item.category} ${item.item_type} ${item.supplier || ''}`.toLowerCase().includes(needle)
  }), [items, search, selectedIds])

  const addItem = (item, requestedQuantity = null) => {
    const step = qtyStep(item)
    const max = Number(item.main_stockroom_stock || 0)
    const desired = requestedQuantity === null ? step : Math.min(max, Math.max(step, Number(requestedQuantity) || step))
    setSelected((current) => current.some((entry) => entry.inventory_id === Number(item.id)) ? current : [...current, {
      inventory_id: Number(item.id),
      item_name: item.name,
      unit: stockUnit(item),
      qty_requested: desired,
      max,
      step,
    }])
    setSearch('')
  }

  const addSuggestedShortages = () => {
    if (!readiness?.lines?.length) return
    let added = 0
    for (const line of readiness.lines) {
      if (Number(line.room_shortage || 0) <= 0 || Number(line.main_stockroom_stock || 0) <= 0) continue
      const item = items.find((entry) => Number(entry.id) === Number(line.inventory_id))
      if (!item || selectedIds.has(Number(item.id))) continue
      addItem(item, line.suggested_transfer)
      added += 1
    }
    if (!added) toast.info('There are no additional transferable shortages to add.')
  }

  const updateQty = (inventoryId, value) => setSelected((current) => current.map((entry) => entry.inventory_id === inventoryId ? { ...entry, qty_requested: value } : entry))
  const removeItem = (inventoryId) => setSelected((current) => current.filter((entry) => entry.inventory_id !== inventoryId))

  const invalidItem = selected.find((entry) => {
    const quantity = Number(entry.qty_requested)
    return !Number.isFinite(quantity) || quantity <= 0 || quantity > Number(entry.max || 0)
  })

  const submit = async (event) => {
    event.preventDefault()
    if (!appointmentId) return toast.warning('Select the active appointment or consultation this transfer is for.')
    if (!selected.length) return toast.warning('Add at least one inventory item.')
    if (!destination) return toast.warning('Select a destination.')
    if (!reason.trim()) return toast.warning('Enter a transfer reason.')
    if (invalidItem) return toast.warning(`Review the requested quantity for ${invalidItem.item_name}.`)

    setSaving(true)
    try {
      await submitRequest({
        appointment_id: Number(appointmentId),
        items: selected.map((entry) => ({ inventory_id: entry.inventory_id, qty_requested: Number(entry.qty_requested) })),
        destination_location_id: Number(destination),
        reason: reason.trim(),
      })
      toast.success(`Stock transfer request submitted with ${selected.length} item${selected.length === 1 ? '' : 's'}.`)
      navigate('/doctor/request')
    } catch (err) {
      toast.error(err.message || 'Stock transfer request failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState label="Loading stock transfer form..." />
  if (error) return <ErrorState message={error} />

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <Link to="/doctor/request" className="inline-flex items-center gap-1 text-sm font-bold text-slate-500"><MdArrowBack /> Transfer Requests</Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-black text-slate-900"><MdInventory2 className="text-violet-500" /> Request Stock Transfer</h1>
        <p className="mt-1 text-sm text-slate-500">Link every request to an active appointment. The system can suggest the stock missing from that consultation's treatment room.</p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <label><span className="form-label">Related Appointment / Consultation *</span><select className="form-control mt-1.5 bg-white" value={appointmentId} onChange={(e) => { setAppointmentId(e.target.value); setSelected([]); setReason('') }}><option value="">Select active appointment</option>{appointments.map((entry) => <option key={entry.id} value={entry.id}>{entry.patient_name} · {entry.appointment_date} {entry.appointment_time} · {statusLabel(entry.status)}{entry.requested_service_name_snapshot ? ` · ${entry.requested_service_name_snapshot}` : ''}</option>)}</select></label>
          {selectedAppointment && <div className="mt-3 grid gap-2 text-xs text-violet-900 sm:grid-cols-3"><div><span className="block font-bold uppercase text-violet-500">Patient</span>{selectedAppointment.patient_name}</div><div><span className="block font-bold uppercase text-violet-500">Status</span>{statusLabel(selectedAppointment.status)}</div><div><span className="block font-bold uppercase text-violet-500">Service</span>{selectedAppointment.requested_service_name_snapshot || 'Not specified'}</div></div>}
        </section>

        {readinessLoading && <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Checking expected service consumables…</div>}
        {readiness && <section className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">Inventory Readiness</h2><p className="mt-1 text-xs text-slate-500">Expected consumables for {readiness.appointment?.requested_service_name || 'this appointment'} · destination {readiness.treatment_room}</p></div>{readiness.lines.some((line) => line.room_shortage > 0 && line.main_stockroom_stock > 0) && <button type="button" className="button-primary" onClick={addSuggestedShortages}><MdAdd /> Add Suggested Shortages</button>}</div>{readiness.lines.length ? <div className="mt-4 space-y-2">{readiness.lines.map((line) => <div key={line.inventory_id} className={`rounded-xl border px-3 py-3 text-sm ${line.status === 'ready' ? 'border-emerald-200 bg-emerald-50' : line.status === 'transfer_needed' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'}`}><div className="flex flex-wrap justify-between gap-2"><span className="font-bold text-slate-900">{line.name}</span><span className={line.status === 'ready' ? 'font-bold text-emerald-700' : line.status === 'transfer_needed' ? 'font-bold text-amber-700' : 'font-bold text-rose-700'}>{line.status === 'ready' ? 'Ready' : line.status === 'transfer_needed' ? `Transfer ${line.suggested_transfer} ${line.unit}` : `Clinic short ${line.clinic_shortage} ${line.unit}`}</span></div><p className="mt-1 text-xs text-slate-600">Required {line.required} {line.unit} · Room {line.treatment_room_stock} · Main Stockroom {line.main_stockroom_stock}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No default consumables are configured for this appointment's requested service. You can still add stock manually if preparation requires it.</p>}</section>}

        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="form-label">Destination *</span><select className="form-control mt-1.5" value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Select destination</option>{locations.filter((entry) => entry.location_type !== 'stockroom').map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label><span className="form-label">Reason *</span><input maxLength={500} className="form-control mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Preparation for today's consultation" /></label>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Items to Transfer</h2><p className="mt-1 text-xs text-slate-500">Add multiple items to one request. Transferred quantities prepare the room; they are not automatically billed to the patient.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">{selected.length} selected</span></div>
          {selected.length ? <div className="mt-4 space-y-2">{selected.map((entry) => <div key={entry.inventory_id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_180px_auto] sm:items-center"><div><p className="font-bold text-slate-900">{entry.item_name}</p><p className="mt-1 text-xs text-slate-500">Main Stockroom: {entry.max} {entry.unit}</p></div><label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quantity ({entry.unit})</span><input type="number" min={entry.step} max={entry.max || undefined} step={entry.step} className="form-control mt-1" value={entry.qty_requested} onChange={(e) => updateQty(entry.inventory_id, e.target.value)} /></label><button type="button" onClick={() => removeItem(entry.inventory_id)} className="button-secondary !border-rose-200 !text-rose-600" title="Remove item"><MdDelete /></button></div>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No items added yet.</div>}
        </section>

        <section><div className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory to add another item..." /></div><div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">{filtered.map((item) => { const available = Number(item.main_stockroom_stock || 0); return <button type="button" key={item.id} disabled={available <= 0} onClick={() => addItem(item)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><div><p className="font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.category === 'derma' ? 'Dermatology' : 'General Medicine'} · {stockUnit(item)}</p></div><div className="text-right"><p className="text-xs font-bold text-slate-600">{available} {stockUnit(item)}</p><span className={`mt-1 inline-flex items-center gap-1 text-xs font-bold ${available > 0 ? 'text-violet-600' : 'text-slate-400'}`}>{available > 0 ? <><MdAdd /> Add</> : 'No Main Stockroom stock'}</span></div></button> })}{!filtered.length && <div className="p-5 text-center text-sm text-slate-400">No additional matching inventory items.</div>}</div></section>

        {readiness?.status === 'shortage' && <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"><MdWarningAmber className="mt-0.5 shrink-0 text-lg" /><span>Some expected consumables are short across both the treatment room and Main Stockroom. A transfer can only move available stock; Stock In is still required before the consultation can be completed.</span></div>}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Approval is all-or-nothing. Admin/Staff rechecks Main Stockroom stock inside the approval transaction. If any requested item cannot be transferred, no items are moved.</div>
        <div className="flex justify-end gap-2"><Link className="button-secondary" to="/doctor/request">Cancel</Link><button className="button-primary" disabled={saving || !appointmentId || !selected.length || !destination || !reason.trim() || Boolean(invalidItem)}>{saving ? 'Submitting…' : `Submit ${selected.length || ''} Item${selected.length === 1 ? '' : 's'}`}</button></div>
      </form>
    </div>
  )
}

export default Doctor_StockTransferRequest

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MdAdd, MdArrowBack, MdDelete, MdInventory2, MdSearch } from 'react-icons/md'
import { getInventoryItems, getInventoryLocations, submitRequest } from '../../services/doctor.service'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../components/ui/ToastProvider'
import { LoadingState, ErrorState } from '../../components/ui/PageState'

const stockUnit = (item) => item?.uom || item?.unit || item?.base_unit || 'unit'
const qtyStep = (item) => Number(item?.uom_allow_decimal) === 1 ? 0.01 : 1

const Doctor_StockTransferRequest = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const [destination, setDestination] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([getInventoryItems(), getInventoryLocations()])
      .then(([inventoryRows, locationRows]) => {
        const inventory = Array.isArray(inventoryRows) ? inventoryRows : []
        const locs = Array.isArray(locationRows) ? locationRows : []
        setItems(inventory)
        setLocations(locs)
        const clinicNeedle = String(user?.clinic_type || user?.specialty || '').toLowerCase().includes('derm') ? 'dermatology' : 'general medicine'
        const preferred = locs.find((entry) => String(entry.name || '').toLowerCase().includes(clinicNeedle)) || locs.find((entry) => entry.location_type === 'room') || locs[0]
        if (preferred) setDestination(String(preferred.id))
      })
      .catch((err) => setError(err.message || 'Could not load stock transfer form.'))
      .finally(() => setLoading(false))
  }, [user?.clinic_type, user?.specialty])

  const selectedIds = useMemo(() => new Set(selected.map((entry) => Number(entry.inventory_id))), [selected])
  const filtered = useMemo(() => items.filter((item) => {
    if (selectedIds.has(Number(item.id))) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${item.name} ${item.category} ${item.item_type} ${item.supplier || ''}`.toLowerCase().includes(needle)
  }), [items, search, selectedIds])

  const addItem = (item) => {
    const step = qtyStep(item)
    setSelected((current) => [...current, {
      inventory_id: Number(item.id),
      item_name: item.name,
      unit: stockUnit(item),
      qty_requested: step,
      max: Number(item.main_stockroom_stock || 0),
      step,
    }])
    setSearch('')
  }

  const updateQty = (inventoryId, value) => {
    setSelected((current) => current.map((entry) => entry.inventory_id === inventoryId ? { ...entry, qty_requested: value } : entry))
  }

  const removeItem = (inventoryId) => setSelected((current) => current.filter((entry) => entry.inventory_id !== inventoryId))

  const invalidItem = selected.find((entry) => {
    const quantity = Number(entry.qty_requested)
    return !Number.isFinite(quantity) || quantity <= 0 || quantity > Number(entry.max || 0)
  })

  const submit = async (event) => {
    event.preventDefault()
    if (!selected.length) return toast.warning('Add at least one inventory item.')
    if (!destination) return toast.warning('Select a destination.')
    if (!reason.trim()) return toast.warning('Enter a transfer reason.')
    if (invalidItem) return toast.warning(`Review the requested quantity for ${invalidItem.item_name}.`)

    setSaving(true)
    try {
      await submitRequest({
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
        <p className="mt-1 text-sm text-slate-500">Add multiple items to one request. Admin or Staff will approve the entire request in one transaction using FEFO batch allocation.</p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="form-label">Destination *</span><select className="form-control mt-1.5" value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Select destination</option>{locations.filter((entry) => entry.location_type !== 'stockroom').map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label><span className="form-label">Reason *</span><input maxLength={500} className="form-control mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Replenishment for today's consultations" /></label>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Items</h2><p className="mt-1 text-xs text-slate-500">Each inventory item can appear once in the request.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">{selected.length} selected</span></div>
          {selected.length ? <div className="mt-4 space-y-2">{selected.map((entry) => (
            <div key={entry.inventory_id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_180px_auto] sm:items-center">
              <div><p className="font-bold text-slate-900">{entry.item_name}</p><p className="mt-1 text-xs text-slate-500">Main Stockroom: {entry.max} {entry.unit}</p></div>
              <label><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quantity ({entry.unit})</span><input type="number" min={entry.step} max={entry.max || undefined} step={entry.step} className="form-control mt-1" value={entry.qty_requested} onChange={(e) => updateQty(entry.inventory_id, e.target.value)} /></label>
              <button type="button" onClick={() => removeItem(entry.inventory_id)} className="button-secondary !border-rose-200 !text-rose-600" title="Remove item"><MdDelete /></button>
            </div>
          ))}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No items added yet.</div>}
        </section>

        <section>
          <div className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory to add another item..." /></div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {filtered.map((item) => { const available = Number(item.main_stockroom_stock || 0); return <button type="button" key={item.id} disabled={available <= 0} onClick={() => addItem(item)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><div><p className="font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.category === 'derma' ? 'Dermatology' : 'General Medicine'} · {stockUnit(item)}</p></div><div className="text-right"><p className="text-xs font-bold text-slate-600">{available} {stockUnit(item)}</p><span className={`mt-1 inline-flex items-center gap-1 text-xs font-bold ${available > 0 ? 'text-violet-600' : 'text-slate-400'}`}>{available > 0 ? <><MdAdd /> Add</> : 'No Main Stockroom stock'}</span></div></button> })}
            {!filtered.length && <div className="p-5 text-center text-sm text-slate-400">No additional matching inventory items.</div>}
          </div>
        </section>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Approval is all-or-nothing. If any requested item cannot be transferred, no items from this request will be moved.</div>
        <div className="flex justify-end gap-2"><Link className="button-secondary" to="/doctor/request">Cancel</Link><button className="button-primary" disabled={saving || !selected.length || !destination || !reason.trim() || Boolean(invalidItem)}>{saving ? 'Submitting…' : `Submit ${selected.length || ''} Item${selected.length === 1 ? '' : 's'}`}</button></div>
      </form>
    </div>
  )
}

export default Doctor_StockTransferRequest

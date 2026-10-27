import { useCallback, useEffect, useState } from 'react'
import { MdAdd, MdEdit, MdMeetingRoom } from 'react-icons/md'
import Modal from '../ui/Modal'
import { useToast } from '../ui/ToastProvider'
import { LoadingState, ErrorState } from '../ui/PageState'
import { createInventoryLocation, getInventoryLocations, updateInventoryLocation } from '../../services/admin.service'

const TYPE_OPTIONS = [
  ['stockroom', 'Stockroom'],
  ['room', 'Treatment Room'],
  ['dispensing', 'Dispensing Area'],
  ['storage', 'Storage'],
]
const typeLabel = (value) => (TYPE_OPTIONS.find(([key]) => key === value) || [null, value])[1]
const clinicLabel = (value) => (value === 'derma' ? 'Dermatology' : value === 'medical' ? 'General Medicine' : 'Not assigned')

// Physical places that hold stock. A treatment room assigned to a clinic is where that
// clinic's consultations deduct consumables from first; the Main Stockroom is the fallback
// and the source for stock transfers. Names can change freely: the system follows the
// assignment, not the name.
const StockRoomsManager = () => {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', location_type: 'room', clinic_type: '', is_active: 1 })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getInventoryLocations()
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Could not load stock rooms.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openForm = (row = null) => {
    setEditing(row || { id: null })
    setForm(row
      ? { name: row.name, location_type: row.location_type, clinic_type: row.clinic_type || '', is_active: Number(row.is_active ?? 1) }
      : { name: '', location_type: 'room', clinic_type: '', is_active: 1 })
  }

  const isMain = Number(editing?.is_main_stockroom || 0) === 1
  const clinicConflict = form.location_type === 'room' && form.clinic_type
    ? rows.find((row) => row.id !== editing?.id && Number(row.is_active ?? 1) === 1 && row.clinic_type === form.clinic_type)
    : null

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        location_type: form.location_type,
        clinic_type: form.location_type === 'room' ? (form.clinic_type || null) : null,
        is_active: form.is_active,
      }
      if (editing?.id) await updateInventoryLocation(editing.id, payload)
      else await createInventoryLocation(payload)
      toast.success(editing?.id ? 'Stock room updated.' : 'Stock room added.')
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err.message || 'Could not save the stock room.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState label="Loading stock rooms..." />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-black text-slate-900"><MdMeetingRoom className="text-sky-500" /> Stock Rooms</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Where stock physically sits. Consultations take consumables from the treatment room assigned to their clinic first, then from the Main Stockroom. Renaming a room is safe.</p>
        </div>
        <button type="button" className="button-primary" onClick={() => openForm()}><MdAdd /> Add Stock Room</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-5 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Used by clinic</th><th className="px-4 py-3 text-right">Items</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className={Number(row.is_active ?? 1) === 1 ? '' : 'text-slate-400'}>
                <td className="px-5 py-3">
                  <p className="font-bold text-slate-900">{row.name}</p>
                  {Number(row.is_main_stockroom || 0) === 1 && <p className="text-xs font-semibold text-emerald-700">Main Stockroom</p>}
                </td>
                <td className="px-4 py-3">{typeLabel(row.location_type)}</td>
                <td className="px-4 py-3">{row.location_type === 'room' ? clinicLabel(row.clinic_type) : '—'}</td>
                <td className="px-4 py-3 text-right">{Number(row.item_count || 0)}</td>
                <td className="px-4 py-3">{Number(row.is_active ?? 1) === 1 ? 'Active' : 'Inactive'}</td>
                <td className="px-5 py-3 text-right"><button type="button" className="button-secondary" onClick={() => openForm(row)}><MdEdit /> Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(editing)} onClose={() => !saving && setEditing(null)} closeDisabled={saving} title={editing?.id ? 'Edit Stock Room' : 'Add Stock Room'} size="md">
        <div className="space-y-4">
          <label className="block"><span className="form-label">Name *</span><input className="form-control mt-1.5" maxLength={120} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></label>
          <label className="block">
            <span className="form-label">Type *</span>
            <select className="form-control mt-1.5" value={form.location_type} disabled={isMain} onChange={(e) => setForm((current) => ({ ...current, location_type: e.target.value }))}>
              {TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {isMain && <span className="mt-1 block text-xs text-slate-500">The Main Stockroom keeps the Stockroom type and stays active.</span>}
          </label>
          {form.location_type === 'room' && (
            <label className="block">
              <span className="form-label">Used by clinic</span>
              <select className="form-control mt-1.5" value={form.clinic_type} onChange={(e) => setForm((current) => ({ ...current, clinic_type: e.target.value }))}>
                <option value="">Not assigned</option>
                <option value="medical">General Medicine</option>
                <option value="derma">Dermatology</option>
              </select>
              {clinicConflict && <span className="mt-1 block text-xs font-semibold text-amber-700">{clinicConflict.name} is already assigned to {clinicLabel(form.clinic_type)}. Consultations use the first assigned room, so unassign the other one if this room should take over.</span>}
            </label>
          )}
          {editing?.id && !isMain && (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={Number(form.is_active) === 1} onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.checked ? 1 : 0 }))} />
              Active (a room with stock must be emptied before it can be deactivated)
            </label>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="button-primary" disabled={saving || !form.name.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

export default StockRoomsManager


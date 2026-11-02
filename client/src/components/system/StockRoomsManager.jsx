import { useCallback, useEffect, useState } from 'react'
import { MdAdd, MdEdit, MdDelete, MdMeetingRoom } from 'react-icons/md'
import Modal from '../ui/Modal'
import { useToast } from '../ui/ToastProvider'
import { LoadingState, ErrorState } from '../ui/PageState'
import { createInventoryLocation, getInventoryLocations, updateInventoryLocation, deleteInventoryLocation } from '../../services/admin.service'

// Physical rooms are branch-wide. Preserve legacy clinic assignment in the database
// until consultation stock-source migration is verified; do not reassign stock implicitly.
const StockRoomsManager = () => {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', is_active: 1 })
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState(null)

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
      ? { name: row.name, is_active: Number(row.is_active ?? 1) }
      : { name: '', is_active: 1 })
  }

  const isMain = Number(editing?.is_main_stockroom || 0) === 1

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        location_type: editing?.id ? editing.location_type : 'room',
        // Legacy specialty assignment is preserved for existing rooms during migration.
        clinic_type: editing?.id ? (editing.clinic_type || null) : null,
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

  const changeRoom = async (room,action) => {
    if(Number(room.is_main_stockroom)===1)return
    const name = room.name
    if(action==='delete' && !window.confirm(`Permanently delete unused Stock Room "${name}"? This cannot be undone.`))return
    if(action==='deactivate' && !window.confirm(`Deactivate "${name}"? It will not appear in new stock operations, but history will remain.`))return
    setActionId(room.id)
    try {
      let response
      if(action==='delete')response=await deleteInventoryLocation(room.id)
      else response=await updateInventoryLocation(room.id,{name:room.name,location_type:room.location_type,is_active:action==='reactivate'?1:0})
      toast.success(response?.message || (response?.deleted?'Stock Room deleted.':action==='reactivate'?'Stock Room reactivated.':'Stock Room deactivated.'))
      await load()
    }catch(err){toast.error(err.message||'Could not update Stock Room.')}
    finally{setActionId(null)}
  }

  if (loading) return <LoadingState label="Loading stock rooms..." />
  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="flex items-center gap-2 font-black text-slate-900"><MdMeetingRoom className="text-sky-500" /> Stock Rooms</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Items and stock show quantities physically allocated to each room. Changing a room name does not move stock.</p>
        </div>
        <button type="button" className="button-primary" onClick={() => openForm()}><MdAdd /> Add Stock Room</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-5 py-3">Name</th><th className="px-4 py-3 text-right">Items</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className={Number(row.is_active ?? 1) === 1 ? '' : 'text-slate-400'}>
                <td className="px-5 py-3">
                  <p className="font-bold text-slate-900">{row.name}</p>
                  {Number(row.is_main_stockroom || 0) === 1 && <p className="text-xs font-semibold text-emerald-700">Main Stockroom</p>}
                </td>
                <td className="px-4 py-3 text-right">{Number(row.item_count || 0)}</td>
                <td className="px-4 py-3 text-right">{Number(row.total_quantity || 0).toLocaleString('en-PH')}</td>
                <td className="px-4 py-3">{Number(row.is_active ?? 1) === 1 ? 'Active' : 'Inactive'}</td>
                <td className="px-5 py-3 text-right"><div className="inline-flex flex-wrap justify-end gap-2">
                  <button type="button" className="button-secondary" onClick={() => openForm(row)}><MdEdit /> Edit</button>
                  {Number(row.is_main_stockroom) !== 1 && (Number(row.is_active) === 0 && Number(row.usage_count||0)>0
                    ? <button type="button" className="button-secondary" disabled={actionId===row.id} onClick={()=>changeRoom(row,'reactivate')}>Reactivate</button>
                    : <button type="button" className="button-secondary" disabled={actionId===row.id} onClick={()=>changeRoom(row,Number(row.usage_count||0)>0?'deactivate':'delete')}><MdDelete /> {Number(row.usage_count||0)>0?'Deactivate':'Delete'}</button>)}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(editing)} onClose={() => !saving && setEditing(null)} closeDisabled={saving} title={editing?.id ? 'Edit Stock Room' : 'Add Stock Room'} size="md">
        <div className="space-y-4">
          <label className="block"><span className="form-label">Name *</span><input className="form-control mt-1.5" maxLength={120} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></label>
          {editing?.id && !isMain && (
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
              <span>Stock Room Status <span className="text-xs font-normal text-slate-500">(room must be empty before deactivation)</span></span>
              <button type="button" role="switch" aria-label="Stock room active" aria-checked={Number(form.is_active) === 1}
                onClick={() => { if (Number(form.is_active) === 1 && !window.confirm('Deactivate this stock room? Stock must be moved out first.')) return; setForm((current) => ({ ...current, is_active: Number(current.is_active) === 1 ? 0 : 1 })) }}
                className={`relative inline-flex h-7 w-12 rounded-full transition-colors ${Number(form.is_active) === 1 ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`mt-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${Number(form.is_active) === 1 ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
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



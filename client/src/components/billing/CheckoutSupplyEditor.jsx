import { useMemo, useState } from 'react'
import { MdSearch, MdWarningAmber } from 'react-icons/md'
import { formatMoney } from '../../utils/billingUi'

const todayDateOnly = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const getCheckoutBatchOptions = (inventoryItem) => {
  const today = todayDateOnly()
  return (Array.isArray(inventoryItem?.batches) ? inventoryItem.batches : [])
    .filter((batch) => !batch.archived_at && Number(batch.quantity || 0) > 0)
    .filter((batch) => !batch.expiration_date || String(batch.expiration_date).slice(0, 10) >= today)
    .flatMap((batch) => (Array.isArray(batch.locations) ? batch.locations : [])
      .filter((loc) => Number(loc?.quantity || 0) > 0 && Number(loc?.id || 0) > 0)
      .map((loc) => ({
        selection_key: `${Number(batch.id)}:${Number(loc.id)}`,
        id: Number(batch.id),
        batch_id: Number(batch.id),
        batch_code: batch.batch_code || `Batch #${batch.id}`,
        supplier_lot_number: batch.supplier_lot_number || null,
        supplier_name: batch.supplier_name || null,
        expiration_date: batch.expiration_date || null,
        source_location_id: Number(loc.id),
        source_location: loc.name,
        available: Math.min(Number(batch.quantity || 0), Number(loc.quantity || 0)),
      })))
}

const CheckoutSupplyEditor = ({ item, inventory, onSelectInventory, onSelectBatch, onQuantity }) => {
  const [search, setSearch] = useState('')
  const selectedInventory = inventory.find((inv) => Number(inv.id) === Number(item.source_inventory_id)) || null
  const selectedBatchId = Number(item?.details?.batch_id || 0)
  const selectedLocationId = Number(item?.details?.source_location_id || 0)
  const selectedKey = selectedBatchId && selectedLocationId ? `${selectedBatchId}:${selectedLocationId}` : ''

  const filteredInventory = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return inventory
    return inventory.filter((inv) => [inv.name, inv.barcode, inv.category, inv.supplier]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)))
  }, [inventory, search])

  const batchOptions = useMemo(() => getCheckoutBatchOptions(selectedInventory), [selectedInventory])
  const selectedBatch = batchOptions.find((batch) => batch.selection_key === selectedKey) || null
  const price = Number(selectedInventory?.selling_price || 0)

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
      <div className="space-y-3">
        <label className="block">
          <span className="form-label">Search Inventory</span>
          <div className="relative mt-1.5">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="form-control pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine, supply, barcode or supplier..."
            />
          </div>
        </label>

        <label className="block">
          <span className="form-label">Medicine / Supply *</span>
          <select className="form-control mt-1.5" value={item.source_inventory_id || ''} onChange={(e) => onSelectInventory(e.target.value)}>
            <option value="">Select inventory item</option>
            {filteredInventory.map((inv) => {
              const validPrice = Number(inv.selling_price || 0) > 0
              return (
                <option key={inv.id} value={inv.id} disabled={!validPrice}>
                  {inv.name}{validPrice ? ` — ${formatMoney(inv.selling_price)}` : ' — Selling Price missing / ₱0.00'}
                </option>
              )
            })}
          </select>
        </label>

        {selectedInventory && price <= 0 && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            <MdWarningAmber className="mt-0.5 shrink-0" />
            This item has a ₱0.00 or missing Selling Price. Set a valid price in Inventory before using it at Checkout.
          </div>
        )}

        {selectedInventory && price > 0 && (
          <label className="block">
            <span className="form-label">Batch to Dispense *</span>
            <select
              className="form-control mt-1.5"
              value={selectedKey}
              onChange={(e) => {
                const batch = batchOptions.find((entry) => entry.selection_key === e.target.value) || null
                onSelectBatch(batch)
              }}
            >
              <option value="">Select exact batch</option>
              {batchOptions.map((batch) => (
                <option key={batch.selection_key} value={batch.selection_key}>
                  {batch.batch_code}{batch.supplier_lot_number ? ` · Lot ${batch.supplier_lot_number}` : ''}{batch.expiration_date ? ` · Exp ${String(batch.expiration_date).slice(0, 10)}` : ''} · {batch.available} available · {batch.source_location}
                </option>
              ))}
            </select>
            {batchOptions.length === 0 && <span className="mt-1 block text-[10px] font-bold text-rose-600">No active, unexpired stock is available in Dispensing Area or Main Stockroom.</span>}
            {selectedBatch && <span className="mt-1 block text-[10px] text-slate-500">Selected batch stock: {selectedBatch.available} {selectedInventory.uom || selectedInventory.unit || 'unit(s)'} at {selectedBatch.source_location}.</span>}
          </label>
        )}
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="form-label">Qty</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            className="form-control mt-1.5"
            value={item.quantity}
            onChange={(e) => onQuantity(e.target.value)}
          />
        </label>
        <div>
          <span className="form-label">Patient Price</span>
          <div className={`mt-1.5 rounded-xl border px-3 py-2.5 text-sm font-black ${Number(item.unit_price || 0) <= 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50'}`}>
            {formatMoney(item.unit_price)}
          </div>
          {Number(item.unit_price || 0) <= 0 && <p className="mt-1 text-[10px] font-bold text-amber-700">Warning: this charge is ₱0.00.</p>}
        </div>
      </div>
    </div>
  )
}

export default CheckoutSupplyEditor

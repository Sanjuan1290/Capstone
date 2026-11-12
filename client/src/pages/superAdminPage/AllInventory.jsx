import {useCallback, useEffect, useRef, useState} from 'react'
import {NavLink} from 'react-router-dom'
import {
  MdInventory2, MdRefresh, MdFileDownload, MdSearch, MdClose, MdChevronLeft,
  MdChevronRight, MdWarningAmber, MdStorefront, MdOutlineInventory,
  MdInfoOutline, MdVisibility, MdLockOutline
} from 'react-icons/md'
import {PageHead, Card, Banner, Loading, Empty, whole, fetchJson} from './redesign/shared'
import {
  buildFilters, dateOnly, money, number, statusLabels
} from './inventoryView.mjs'
import {makeSuperAdminInventoryReport} from '../../utils/superAdminInventoryReport.mjs'

const initialFilters = {
  view: 'by_branch', search: '', branch_ids: '', status: '', sort: 'name',
  page: 1, limit: 10
}
const statuses = [
  ['', 'All statuses'], ['in_stock', 'In stock'], ['low', 'Low stock'],
  ['out', 'Out of stock'], ['expiring', 'Expiring soon'], ['expired', 'Expired']
]
const colors = {
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200'
}
const StatusBadges = ({item}) => <div className="flex flex-wrap gap-1.5">
  {statusLabels(item).map((entry, i) => <span key={`${entry.label}-${i}`} className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${colors[entry.tone]}`}>
    {entry.label}
  </span>)}
</div>
const Summary = ({label, value, Icon, description, tone = 'slate'}) => <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs font-semibold text-slate-600">{label}</span>
    <Icon aria-hidden="true" className={tone === 'amber' ? 'text-amber-600' : tone === 'rose' ? 'text-rose-600' : 'text-emerald-700'} size={20}/>
  </div>
  <p className="mt-2 break-words text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{value}</p>
  <p className="mt-1 text-[11px] text-slate-500">{description}</p>
</div>

export default function SuperAdminAllInventory() {
  const [filters, setFilters] = useState(initialFilters)
  const [searchInput, setSearchInput] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState('')
  const [branches, setBranches] = useState([])
  const [selected, setSelected] = useState(null)
  const [batches, setBatches] = useState([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [batchesError, setBatchesError] = useState('')
  const requestCounter = useRef(0)
  const resultsRef = useRef(null)
  const closeDetails = useCallback(() => { requestCounter.current += 1; setSelected(null) }, [])

  useEffect(() => {
    const timer = setTimeout(() => setFilters(old => old.search === searchInput ? old : {...old, search: searchInput, page: 1}), 300)
    return () => clearTimeout(timer)
  }, [searchInput])
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetchJson(`/inventory/all?${buildFilters(filters)}`)
      .then(response => { if (active) setData(response) })
      .catch(err => { if (active) setError(err.message || 'Unable to load inventory.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, refresh])
  useEffect(() => {
    let active = true
    fetchJson('/').then(response => { if (active) setBranches(Array.isArray(response) ? response : []) }).catch(() => {})
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!selected) return undefined
    const prior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = event => { if (event.key === 'Escape') closeDetails() }
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = prior; document.removeEventListener('keydown', closeOnEscape) }
  }, [selected, closeDetails])

  const update = (field, value) => setFilters(old => ({...old, [field]: value, page: 1}))
  const clearFilters = () => { setFilters(initialFilters); setSearchInput('') }
  const openDetails = async row => {
    const current = ++requestCounter.current
    setSelected(row)
    setBatches([])
    setBatchesError('')
    setBatchesLoading(true)
    const ids = [row.id].filter(id => Number.isSafeInteger(Number(id)) && Number(id) > 0)
    try {
      const response = await fetchJson(`/inventory/all/batches?item_ids=${ids.join(',')}`)
      if (current === requestCounter.current) setBatches(Array.isArray(response) ? response : [])
    } catch (err) {
      if (current === requestCounter.current) setBatchesError(err.message || 'Unable to load stock locations.')
    } finally {
      if (current === requestCounter.current) setBatchesLoading(false)
    }
  }
  const pageTo = page => {
    setFilters(old => ({...old, page}))
    resultsRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'})
  }
  const exportExcel = async () => {
    if (exportBusy) return
    setExportError('')
    setExportBusy(true)
    try {
      // The export API is Super Admin-only and retrieves ALL matching rows,
      // independently of the visible page or rows-per-page setting.
      const query = buildFilters({...filters, page: undefined, limit: undefined})
      const report = await fetchJson(`/inventory/all/export?${query}`)
      const generatedAt = new Date()
      const workbook = makeSuperAdminInventoryReport(report, {filters, generatedAt})
      const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(generatedAt).map(part => [part.type, part.value]))
      const stamp = `${dateParts.year}-${dateParts.month}-${dateParts.day}`
      const url = URL.createObjectURL(workbook)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `CARAIT_All_Inventory_${stamp}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch (err) {
      setExportError(err.message || 'Unable to prepare the Excel report. Please try again.')
    } finally {
      setExportBusy(false)
    }
  }
  const summary = data?.summary || {}
  const totalPages = Math.max(1, Math.ceil(Number(data?.total || 0) / Number(data?.limit || filters.limit)))
  const hasFilters = Boolean(filters.search || filters.branch_ids || filters.status)

  return <div className="mx-auto w-full max-w-[1450px] space-y-5 pb-8">
    <PageHead title="All Inventory" description="Individual inventory items for every clinic branch. Stock and selling values are read-only." action={<div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><MdLockOutline/> Read-only</span>
      <button type="button" className="button-secondary inline-flex items-center gap-2" disabled={exportBusy || loading || !data} onClick={exportExcel}><MdFileDownload/> {exportBusy ? 'Preparing Excel…' : 'Export Excel (.xlsx)'}</button>
      <button type="button" className="button-secondary inline-flex items-center gap-2" onClick={() => setRefresh(value => value + 1)}><MdRefresh/> Refresh</button>
    </div>}/>

    {!data && loading ? <Loading cards={4}/> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Summary label="Inventory Items" value={whole(summary.total_items || 0)} Icon={MdInventory2} description="Separate inventory records in the selected branches"/>
      <Summary label="Total Selling Value" value={money(summary.total_selling_value)} Icon={MdStorefront} description="Estimated value at current selling prices; not revenue"/>
      <Summary label="Low Stock" value={whole(summary.low_stock || 0)} Icon={MdWarningAmber} tone="amber" description="Branch-item records at or below their stock alert"/>
      <Summary label="Out of Stock" value={whole(summary.out_of_stock || 0)} Icon={MdOutlineInventory} tone="rose" description="Branch-item records with zero stock"/>
    </div>}

    <Card title="Find a product" description="Search inventory across all active branches, or select one branch.">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(170px,240px)_minmax(170px,220px)]">
        <label className="block text-xs font-semibold text-slate-600">Search product or barcode
          <div className="relative mt-1.5"><MdSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input aria-label="Search inventory" className="form-control w-full pl-10" placeholder="Search by name or barcode" value={searchInput} onChange={event => setSearchInput(event.target.value)}/>
          </div>
        </label>
        <label className="block text-xs font-semibold text-slate-600">Branch
          <select aria-label="Filter branch" className="form-control mt-1.5 w-full" value={filters.branch_ids} onChange={event => update('branch_ids', event.target.value)}>
            <option value="">All Branches</option>
            {branches.filter(branch => Number(branch.is_active) === 1).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-600">Stock Status
          <select aria-label="Filter stock status" className="form-control mt-1.5 w-full" value={filters.status} onChange={event => update('status', event.target.value)}>
            {statuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {hasFilters && <div className="mt-3 text-right"><button type="button" onClick={clearFilters} className="text-xs font-semibold text-slate-600 underline hover:text-slate-900">Clear filters</button></div>}
    </Card>

    {exportError && <Banner onDismiss={() => setExportError('')}>{exportError}</Banner>}
    {error && <Banner onRetry={() => setRefresh(value => value + 1)}>{error}</Banner>}
    <div ref={resultsRef} className="scroll-mt-6"/>
    {data && <Card title="Inventory List" description={`${whole(data.total)} inventory item${data.total === 1 ? '' : 's'} in the selected scope. Each row belongs to one branch, even when names match.`} action={<label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Rows per page
      <select aria-label="Rows per page" className="form-control w-20" value={filters.limit} onChange={event => update('limit', Number(event.target.value))}>
        {[10,25,50,100].map(count => <option key={count} value={count}>{count}</option>)}
      </select>
    </label>}>
      {loading && <p role="status" className="mb-3 text-sm text-slate-500">Updating inventory…</p>}
      {data.rows?.length ? <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-600"><tr>
            <th scope="col" className="px-3 py-3">Product</th>
            <th scope="col" className="px-3 py-3">Stock</th>
            <th scope="col" className="px-3 py-3">Selling Price</th>
            <th scope="col" className="px-3 py-3">Branch</th>
            <th scope="col" className="px-3 py-3">Total Selling Value</th>
            <th scope="col" className="px-3 py-3">Status</th>
            <th scope="col" className="px-3 py-3 text-right">Action</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map(row => <tr key={`${row.branch_id}-${row.id}`} className="hover:bg-slate-50">
              <td className="max-w-[250px] px-3 py-3"><p className="font-bold text-slate-900">{row.name}</p><p className="mt-1 text-xs text-slate-500">{[row.category === 'derma' ? 'Dermatology' : row.category === 'medical' ? 'General Medicine' : row.category, row.item_type].filter(Boolean).join(' · ')}</p><p className="mt-1 text-[11px] text-slate-400">{row.barcode || `Inventory ID ${row.id}`}</p></td>
              <td className="px-3 py-3 font-semibold tabular-nums text-slate-800">{number(row.quantity_base)}<span className="block text-[11px] font-normal text-slate-500">{row.base_unit || 'base units'}</span></td>
              <td className="px-3 py-3 text-xs font-semibold text-slate-800">{row.selling_price == null ? 'Not set' : money(row.selling_price)}</td>
              <td className="px-3 py-3 text-sm font-semibold text-slate-700">{row.branch_name || `Branch ${row.branch_id}`}</td>
              <td className="px-3 py-3 font-bold tabular-nums text-slate-900">{money(row.selling_value)}</td>
              <td className="px-3 py-3"><StatusBadges item={row}/></td>
              <td className="px-3 py-3 text-right"><button type="button" onClick={() => openDetails(row)} className="button-secondary inline-flex items-center gap-1.5 text-xs"><MdVisibility/> View Details</button></td>
            </tr>)}
          </tbody>
        </table>
      </div> : <Empty title="No matching inventory" description="Try another branch or stock status." action={hasFilters && <button type="button" className="button-secondary" onClick={clearFilters}>Clear filters</button>}/>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <span>Showing <strong>{data.total ? (data.page - 1) * data.limit + 1 : 0}–{Math.min(data.page * data.limit, data.total)}</strong> of <strong>{whole(data.total)}</strong> inventory items</span>
        <div className="flex items-center gap-2">
          <button type="button" className="button-secondary" aria-label="Previous page" disabled={filters.page <= 1} onClick={() => pageTo(filters.page - 1)}><MdChevronLeft/></button>
          <span className="font-semibold">Page {Math.min(filters.page, totalPages)} of {totalPages}</span>
          <button type="button" className="button-secondary" aria-label="Next page" disabled={filters.page >= totalPages} onClick={() => pageTo(filters.page + 1)}><MdChevronRight/></button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Total Selling Value is an estimate based on recorded on-hand quantities and current selling prices, not actual revenue or profit. Expired or otherwise unsellable stock may still be included in recorded on-hand stock.</p>
      <p className="mt-1 text-[11px] text-slate-500">Excel exports every matching branch inventory record, including separate barcodes and selling prices.</p>
    </Card>}

    {selected && <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/50" onMouseDown={event => {if (event.target === event.currentTarget) closeDetails()}}>
      <aside role="dialog" aria-modal="true" aria-label="Branch inventory item details" className="h-full w-full max-w-[760px] overflow-y-auto bg-white shadow-2xl" tabIndex={-1}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Branch Inventory Item · Read-only</p><h2 className="mt-1 break-words text-xl font-black text-slate-900">{selected.name}</h2><p className="mt-1 text-xs text-slate-500">{selected.branch_name} · {selected.category} · {selected.item_type}</p><p className="mt-1 text-xs text-slate-500">Barcode: {selected.barcode || 'Not set'} · Inventory ID: {selected.id}</p></div>
          <button type="button" className="button-secondary" aria-label="Close details" onClick={closeDetails}><MdClose/> Close</button>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-600">Total Stock</p><p className="mt-1 text-xl font-black">{number(selected.quantity_base)}</p><p className="text-xs text-slate-500">{selected.base_unit || 'base units'}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-600">Total Selling Value</p><p className="mt-1 text-xl font-black">{money(selected.selling_value)}</p><p className="text-[11px] text-slate-500">At current selling prices</p></div>
          </div>
          <section aria-label="Item details" className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Item & Branch Details</h3>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-slate-500">Clinic Branch</dt><dd className="mt-1 font-semibold">{selected.branch_name}</dd></div>
                <div><dt className="text-xs text-slate-500">Product Barcode</dt><dd className="mt-1 break-all font-semibold">{selected.barcode || 'Not set'}</dd></div>
                <div><dt className="text-xs text-slate-500">Inventory ID</dt><dd className="mt-1 font-semibold">{selected.id}</dd></div>
                <div><dt className="text-xs text-slate-500">Selling Price</dt><dd className="mt-1 font-semibold">{selected.selling_price == null ? 'Not set' : money(selected.selling_price)}</dd></div>
                <div><dt className="text-xs text-slate-500">Low Stock Alert</dt><dd className="mt-1 font-semibold">{number(selected.threshold || 0)} {selected.base_unit || 'units'}</dd></div>
                <div><dt className="text-xs text-slate-500">Nearest Expiry</dt><dd className="mt-1 font-semibold">{dateOnly(selected.nearest_expiry) || 'Not recorded'}</dd></div>
              </dl>
            </div>
            <NavLink className="inline-flex text-xs font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-900" to={`/superadmin/branches/${selected.branch_id}/inventory`}>
              Open {selected.branch_name} inventory
            </NavLink>
          </section>
          <section aria-label="Stock locations" className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><MdOutlineInventory/> Batches & Stock Locations</h3>
            {batchesError && <Banner onRetry={() => openDetails(selected)}>{batchesError}</Banner>}
            {batchesLoading ? <p role="status" className="text-sm text-slate-500">Loading stock locations…</p> : !batches.length ? <p className="rounded-xl border border-slate-200 p-3 text-sm text-slate-500">No active batches are recorded for this product.</p> : <div className="space-y-2">
              {batches.map((batch, index) => <div key={`${batch.id}-${batch.location_name || 'unknown'}-${index}`} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><strong>{batch.branch_name} · {batch.location_name || 'Unallocated'}</strong><span className="font-semibold">{number(batch.location_quantity ?? batch.quantity)}</span></div>
                <p className="mt-1 text-xs text-slate-500">Batch: {batch.batch_code || `#${batch.id}`} · Expiry: {dateOnly(batch.expiration_date) || 'Not recorded'}</p>
              </div>)}
            </div>}
          </section>
          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><MdInfoOutline className="mr-1 inline"/> This view does not change inventory quantities, item prices, or stock movements.</div>
        </div>
      </aside>
    </div>}
  </div>
}

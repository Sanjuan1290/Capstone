import { useRef, useState } from 'react'
import { MdFileDownload, MdFileUpload, MdDescription, MdEditNote, MdClose } from 'react-icons/md'
import { INVENTORY_BULK_EDIT_HEADERS, makeInventoryXlsx, readInventoryFile, asInventoryRow } from '../../utils/inventoryExcel.mjs'
import { preflightInventoryExcel } from '../../utils/inventoryExcelValidation.mjs'

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
const inventoryExportRows = (items, rooms, kind) => items.map(item => asInventoryRow(item, rooms, kind))
const csvCell = (value) => {
  const text = String(value ?? '')
  // Prevent spreadsheet formula injection in downloaded validation reports.
  const safe = /^[\s]*[=+@\-\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
const diagnosticsCSV = (rows) => {
  const headings = ['Excel Row', 'Item Name', 'Action', 'Errors', 'Selling Price', 'Quantity', 'Expiration Date', 'Supplier', 'Stock Room']
  const body = rows.filter(r => r.errors.length).map(r => [
    r.row._excelRow, r.name, r.action, r.errors.join('; '), r.row['Selling Price'],
    r.row.Quantity, r.row['Expiration Date'], r.row.Supplier, r.row['Stock Room'],
  ])
  return [headings, ...body].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export default function InventoryExcelTools({ items, stockRooms, masterData, services, onUpdated }) {
  const uploadRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [progress, setProgress] = useState(null)

  const download = (kind) => {
    try {
      setError('')
      const rows = kind === 'template' ? [] : inventoryExportRows(items, stockRooms, kind === 'edit' ? 'edit' : 'view')
      saveBlob(
        makeInventoryXlsx(rows, kind === 'edit' ? INVENTORY_BULK_EDIT_HEADERS : undefined),
        kind === 'template' ? 'CARAIT_Inventory_Import_Template.xlsx' : kind === 'edit'
          ? 'CARAIT_Inventory_Bulk_Edit.xlsx' : 'CARAIT_Inventory_Export.xlsx'
      )
    } catch (e) { setError(e.message || 'Could not export the Excel workbook.') }
  }
  const chooseFile = () => {
    if (busy) return
    setError('')
    setResults(null)
    setProgress(null)
    uploadRef.current?.click()
  }
  const handleFile = async (file) => {
    if (!file || busy) return
    setPreview(null)
    setError('')
    setResults(null)
    setProgress(null)
    try {
      const rows = await readInventoryFile(file)
      if (!rows.length) throw new Error('No items found in this spreadsheet.')
      const reviewed = preflightInventoryExcel(rows, { items, stockRooms, suppliers: masterData?.suppliers || [] })
      setPreview({ name: file.name, rows: reviewed })
    } catch (e) {
      // Keep fatal parse errors in a dismissible dialog; never rely on a short toast.
      setError(e.message || 'Could not read spreadsheet.')
    }
  }
  const invalid = preview?.rows.filter(r => r.errors.length) || []
  const changed = preview?.rows.filter(r => r.changed && !r.errors.length) || []
  const errorKinds = [...new Set(invalid.flatMap(r => r.errors))]

  const downloadDiagnostics = () => {
    if (!invalid.length) return
    try {
      const text = diagnosticsCSV(preview.rows)
      saveBlob(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }), 'CARAIT_Inventory_Import_Errors.csv')
    } catch (e) { setError(e.message || 'Could not export the error report.') }
  }
  const apply = async () => {
    if (!preview || busy || invalid.length || results?.failed?.length) return
    const changes = preview.rows.filter(row => row.changed)
    if (!changes.length) {
      setResults({ created: 0, updated: 0, failed: [], unchanged: preview.rows.length })
      return
    }
    if (!window.confirm(`Import ${changes.length} inventory change(s)?\n\nFor NEW items, Quantity becomes opening stock and Initial Stock is reference only. Existing stock and batch expiration dates cannot be changed by Excel.\n\nThis is a row-by-row import, not an all-or-nothing transaction. A failure may leave earlier rows saved.`)) return
    setBusy(true)
    setError('')
    setProgress({ done: 0, total: changes.length })
    let created = 0, updated = 0
    const failed = []
    try {
      for (const entry of changes) {
        try {
          if (entry.action === 'create') {
            await services.addInventoryItem(entry.payload)
            created += 1
          } else {
            await services.updateInventoryItem(entry.existing.id, entry.payload)
            updated += 1
          }
          setProgress({ done: created + updated, total: changes.length })
        } catch (e) {
          const detail = e?.message || 'Save failed'
          failed.push({ row: entry.row._excelRow, name: entry.name, code: e?.code || '', message: detail })
          break
        }
      }
      const summary = { created, updated, failed, unchanged: preview.rows.length - changes.length }
      // Preserve partial-failure details and prevent re-submitting already-created records.
      setResults(summary)
      if (created || updated) {
        try { await onUpdated() } catch (e) { setError(`Some rows were saved, but inventory refresh failed: ${e?.message || 'Please refresh the page.'}`) }
      }
      // A partial import must never allow duplicate re-submission of the same preview.
      if (!failed.length || created || updated) setPreview(null)
    } catch (e) {
      setError(e?.message || 'Import could not finish. Check the inventory before importing again.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return <>
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" aria-label="Inventory Excel actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={chooseFile}><MdFileUpload /> Import Excel</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => download('view')}><MdFileDownload /> Export Snapshot</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => download('edit')}><MdEditNote /> Export Bulk Edit</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => download('template')}><MdDescription /> Download Template</button>
      </div>
      <p className="text-xs text-slate-500">New items: use the nine-column template. Existing items: use Export Bulk Edit with Item ID and Barcode. Export Snapshot is for reporting, not updating stock.</p>
    </div>
    <input ref={uploadRef} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Import inventory Excel file" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void handleFile(file) }} />

    {/* Persistent result banner: not a temporary toast. */}
    {results && <div role="status" className={`rounded-xl border p-4 text-sm ${results.failed.length ? 'border-red-300 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <p className="font-bold">{results.failed.length ? 'Inventory import stopped — review errors' : 'Inventory import completed'}</p>
      <p>Created: {results.created} · Updated: {results.updated} · Unchanged: {results.unchanged}</p>
      {results.failed.map(f => <p key={f.row} className="mt-2 text-red-800">Excel row {f.row} · {f.name}: {f.message}{f.code ? ` (${f.code})` : ''}</p>)}
      <button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => setResults(null)}>Dismiss</button>
    </div>}

    {error && !preview && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Inventory Excel error">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4"><h2 className="text-lg font-bold text-red-800">Inventory Excel error</h2><button type="button" onClick={() => setError('')} aria-label="Dismiss import error"><MdClose /></button></div>
        <p role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
        <p className="mt-3 text-sm text-slate-600">This message remains visible until you dismiss it. If an import was already started, check saved inventory records before retrying.</p>
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="button-secondary" onClick={() => setError('')}>Close</button><button type="button" className="button-primary" onClick={() => { setError(''); chooseFile() }}>Select another file</button></div>
      </div>
    </div>}

    {preview && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 px-3 py-5" role="dialog" aria-modal="true" aria-label="Review inventory Excel import">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <h2 className="text-lg font-bold">Review Inventory Import</h2>
            <p className="text-sm text-slate-500">{preview.name} · {preview.rows.length} rows · {changed.length} ready · {invalid.length} invalid</p>
          </div>
          <button type="button" disabled={busy} aria-label="Close import preview" onClick={() => setPreview(null)}><MdClose /></button>
        </div>
        <div className="min-h-0 space-y-3 overflow-auto p-4 sm:p-5">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">For new items, <strong>Quantity</strong> is the opening stock. <strong>Initial Stock</strong> is a historical reference. Verify actual item expiration dates before importing. Stock adjustments and existing expiry edits must use inventory stock actions.</p>
          {invalid.length > 0 && <section className="rounded-xl border-2 border-red-300 bg-red-50 p-4" aria-label="Import validation errors">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-red-900">Import blocked: {invalid.length} rows need correction</h3>
              <button type="button" className="button-secondary" onClick={downloadDiagnostics}><MdFileDownload /> Download all errors (CSV)</button>
            </div>
            <p className="mt-2 text-sm text-red-800">These errors will remain visible until you close the review or select a corrected file. All rows are checked, including rows after the first 100.</p>
            <ul className="mt-3 max-h-36 list-disc space-y-1 overflow-auto pl-5 text-sm text-red-900">
              {errorKinds.map((e, i) => <li key={`${i}-${e}`}>{e} <span className="text-red-700">({invalid.filter(r => r.errors.includes(e)).length} rows)</span></li>)}
            </ul>
            <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-red-900">Show every invalid row ({invalid.length})</summary><div className="mt-2 max-h-44 space-y-1 overflow-auto text-xs text-red-900">{invalid.map(r => <p key={r.row._excelRow}><strong>Row {r.row._excelRow} — {r.name}:</strong> {r.errors.join('; ')}</p>)}</div></details>
          </section>}
          {results?.failed?.length > 0 && <section role="alert" className="rounded-xl border-2 border-red-400 bg-red-50 p-4 text-sm text-red-900">
            <h3 className="font-bold">Import stopped after {results.created + results.updated} saved row(s)</h3>
            {results.failed.map(f => <p key={f.row} className="mt-2">Row {f.row} — {f.name}: {f.message} {f.code && `(${f.code})`}</p>)}
            <p className="mt-3 font-semibold">Do not click Import again with the same file. Refresh/re-export the current inventory, correct the failed row, and generate a new import for remaining items to avoid duplicates.</p>
          </section>}
          {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
          {busy && <p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Saving {progress?.done || 0} of {progress?.total || 0} rows. Please do not close this window.</p>}
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[800px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-100"><tr>{['Row', 'Action', 'Item', 'Price', 'Initial', 'Current Qty', 'Category', 'Stock Room', 'Result'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
            <tbody>{preview.rows.slice(0, 100).map((r, i) => <tr key={i} className={r.errors.length ? 'border-b border-red-100 bg-red-50' : 'border-b'}>
              <td className="p-2">{r.row._excelRow}</td><td className="p-2">{r.action}</td><td className="p-2 font-medium">{r.name}</td><td className="p-2">{r.row['Selling Price']}</td><td className="p-2">{r.row['Initial Stock'] || '—'}</td><td className="p-2">{r.row.Quantity || '0'}</td><td className="p-2">{r.row.Category}</td><td className="p-2">{r.row['Stock Room']}</td><td className="p-2">{r.errors.length ? r.errors.join('; ') : r.changed ? 'Ready' : 'No changes'}</td>
            </tr>)}</tbody>
          </table></div>
          {preview.rows.length > 100 && <p className="text-xs text-slate-500">Showing the first 100 preview rows. All {preview.rows.length} rows were validated; use Download all errors to review issues from any row.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
          <button type="button" className="button-secondary" disabled={busy} onClick={() => setPreview(null)}>Close Review</button>
          <button type="button" className="button-primary" onClick={apply} disabled={busy || invalid.length > 0 || changed.length === 0 || Boolean(results?.failed?.length)}>
            {busy ? `Saving ${progress?.done || 0}/${progress?.total || 0}…` : results?.failed?.length ? 'Import stopped — re-export first' : invalid.length ? `Fix ${invalid.length} row(s) first` : `Confirm ${changed.length} Change(s)`}
          </button>
        </div>
      </div>
    </div>}
  </>
}


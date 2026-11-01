import { useRef, useState } from 'react'
import { MdClose, MdDownload, MdFileDownload, MdFileUpload, MdInventory2, MdEditNote, MdWarningAmber } from 'react-icons/md'
import {
  INVENTORY_HEADERS, INVENTORY_CREATE_HEADERS, INVENTORY_BULK_EDIT_HEADERS,
  makeInventoryXlsx, readInventoryFile, asInventoryRow, asInventoryBulkEditRow,
} from '../../utils/inventoryExcel.mjs'
import { preflightInventoryCreate, preflightInventoryBulkEdit, MAX_INVENTORY_IMPORT_BATCH } from '../../utils/inventoryExcelValidation.mjs'

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
const csvCell = (value) => {
  const text = String(value ?? '')
  const safe = /^[\s]*[=+@\-\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
const diagnosticsCSV = (rows) => {
  const headings = ['Excel Row', 'Item Name', 'Status', 'Errors']
  const body = rows.filter(r => r.errors.length).map(r => [r.row, r.name, r.action, r.errors.join('; ')])
  return [headings, ...body].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// Bulk import and update are deliberately separate. Never use the old, row-by-row
// import path for the two redesigned flows: the server commits each file atomically.
export default function InventoryExcelTools({ items, stockRooms, masterData, services, onUpdated }) {
  const fileRef = useRef(null)
  const [mode, setMode] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [showTools, setShowTools] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [exportPage, setExportPage] = useState(0)

  const start = (chosen) => {
    setMode(chosen)
    setExportPage(0)
    setPreview(null)
    setConfirmed(false)
    setResults(null)
    setError('')
    setShowTools(true)
  }
  const download = (kind) => {
    try {
      setError('')
      const rows = kind === 'new' ? [] : kind === 'edit' ? items.slice(exportPage*MAX_INVENTORY_IMPORT_BATCH,(exportPage+1)*MAX_INVENTORY_IMPORT_BATCH).map(asInventoryBulkEditRow) : items.map(i => asInventoryRow(i, stockRooms, 'view'))
      const headers = kind === 'new' ? INVENTORY_CREATE_HEADERS : kind === 'edit' ? INVENTORY_BULK_EDIT_HEADERS : INVENTORY_HEADERS
      saveBlob(makeInventoryXlsx(rows, headers), kind === 'new' ? 'CARAIT_Add_New_Inventory_Items.xlsx' : kind === 'edit' ? `CARAIT_Update_Inventory_Details_Part_${exportPage+1}.xlsx` : 'CARAIT_Inventory_Report_READ_ONLY.xlsx')
    } catch (e) { setError(e.message || 'Could not download your inventory Excel file.') }
  }
  const handleFile = async (file) => {
    if (!file || busy || !mode) return
    setPreview(null); setResults(null); setConfirmed(false); setError('')
    try {
      const rows = await readInventoryFile(file, { mode: mode === 'new' ? 'create' : 'edit' })
      if (!rows.length) throw new Error('The Excel file has no inventory rows.')
      if (rows.length > MAX_INVENTORY_IMPORT_BATCH) throw new Error(`Upload at most ${MAX_INVENTORY_IMPORT_BATCH} items at a time. Split the Excel file into smaller files before uploading.`)
      const options = { items, stockRooms, suppliers: masterData?.suppliers || [] }
      const reviewed = mode === 'new' ? preflightInventoryCreate(rows, options) : preflightInventoryBulkEdit(rows, options)
      setPreview({ name: file.name, rows: reviewed, mode })
    } catch (e) { setError(e?.message || 'Could not read the Excel file. Download the matching template and try again.') }
  }
  const invalid = preview?.rows.filter(r => r.errors.length) || []
  const changes = preview?.rows.filter(r => r.changed && !r.errors.length) || []
  const unchanged = preview ? preview.rows.length - changes.length - invalid.length : 0

  const downloadErrors = () => {
    if (!preview || !invalid.length) return
    saveBlob(new Blob(['\uFEFF', diagnosticsCSV(preview.rows)], { type: 'text/csv;charset=utf-8' }), 'CARAIT_Excel_Errors.csv')
  }
  const apply = async () => {
    if (!preview || busy || !confirmed || invalid.length || !changes.length) return
    if (typeof (preview.mode === 'new' ? services.importNewInventoryItems : services.bulkUpdateInventoryItems) !== 'function') {
      setError('This inventory action is not connected to the updated API. Update the clinic frontend and server together before uploading. No changes were saved.')
      return
    }
    setBusy(true); setError('')
    try {
      const payload = changes.map(entry => entry.payload)
      const result = preview.mode === 'new' ? await services.importNewInventoryItems(payload) : await services.bulkUpdateInventoryItems(payload)
      setResults({ type: preview.mode, created: result?.created ?? 0, updated: result?.updated ?? 0, unchanged, message: result?.message || 'Inventory updated.' })
      setPreview(null); setConfirmed(false)
      try { await onUpdated() } catch { setError('The changes were saved, but the inventory list could not refresh. Refresh the page to see the latest items.') }
    } catch (e) {
      // Backend uses one transaction. No rows are committed on validation error.
      setConfirmed(false)
      setError(e?.message || 'The upload could not be saved. No changes were made. Review the file and try again.')
    } finally { setBusy(false) }
  }

  return <section className="space-y-3" aria-label="Inventory Excel tools">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-bold text-slate-800">Excel Tools</h2><p className="text-xs text-slate-500">Add products, update item details, or download a report. Stock movements are managed separately.</p></div>
      <button type="button" className="button-secondary" onClick={() => setShowTools(s => !s)} aria-expanded={showTools}>{showTools ? 'Hide Excel Tools' : 'Show Excel Tools'}</button>
    </div>
    {showTools && <div className="grid gap-3 md:grid-cols-3">
      <button type="button" disabled={busy} onClick={() => start('new')} className={`rounded-2xl border p-4 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-500 ${mode==='new'?'border-emerald-400 bg-emerald-50':'border-slate-200 bg-white'}`}>
        <MdInventory2 className="text-2xl text-emerald-600"/><strong className="mt-2 block text-sm text-slate-900">Add New Items</strong><span className="mt-1 block text-xs text-slate-600">Register new products. Stock starts at zero.</span>
      </button>
      <button type="button" disabled={busy} onClick={() => start('edit')} className={`rounded-2xl border p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500 ${mode==='edit'?'border-blue-400 bg-blue-50':'border-slate-200 bg-white'}`}>
        <MdEditNote className="text-2xl text-blue-600"/><strong className="mt-2 block text-sm text-slate-900">Update Existing Items</strong><span className="mt-1 block text-xs text-slate-600">Edit names, prices, suppliers and low-stock alerts.</span>
      </button>
      <button type="button" disabled={busy} onClick={() => download('report')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-600">
        <MdFileDownload className="text-2xl text-slate-700"/><strong className="mt-2 block text-sm text-slate-900">Download Inventory Report</strong><span className="mt-1 block text-xs text-slate-600">Read-only stock report. Do not upload it for editing.</span>
      </button>
    </div>}
    {showTools && mode && <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="font-bold text-slate-900">{mode==='new'?'Add New Items':'Update Existing Items'}</h3>
      <p className="mt-1 text-sm text-slate-600">1. Download the file. 2. Complete the allowed columns in Excel. 3. Upload and review before saving.</p>
      {mode==='edit' && items.length>MAX_INVENTORY_IMPORT_BATCH && <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">Choose items to download <select className="rounded-lg border border-slate-200 bg-white p-2" value={exportPage} onChange={e=>setExportPage(Number(e.target.value))}>{Array.from({length:Math.ceil(items.length/MAX_INVENTORY_IMPORT_BATCH)},(_,i)=><option key={i} value={i}>Items {i*MAX_INVENTORY_IMPORT_BATCH+1}–{Math.min(items.length,(i+1)*MAX_INVENTORY_IMPORT_BATCH)}</option>)}</select></label>}
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={busy} onClick={() => download(mode)}><MdDownload/> {mode==='new'?'Download New Item Template':'Download Current Items for Editing'}</button>
        <button type="button" className="button-primary" disabled={busy} onClick={() => fileRef.current?.click()}><MdFileUpload/> Upload Completed File</button></div>
      <input ref={fileRef} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Choose the completed inventory Excel file" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void handleFile(file)}} />
      <p className="mt-3 text-xs text-slate-600">{mode==='new'?'New products begin with 0 units. Use Stock In to enter the quantity, expiry and batch details afterward.':'You can update item name, selling price, supplier and low-stock alert only. Item IDs, barcodes and original values identify the record—do not change them. Quantity, batch expiry, category and Stock Room cannot be edited here.'}</p>
    </div>}
    {results && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900" role="status"><strong>{results.message}</strong><p className="mt-1">Added: {results.created} · Updated: {results.updated} · Unchanged: {results.unchanged}</p></div>}
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><div className="flex items-start justify-between gap-2"><strong>Excel upload needs attention</strong><button type="button" onClick={()=>setError('')} aria-label="Dismiss Excel error"><MdClose/></button></div><p className="mt-2">{error}</p><p className="mt-1 text-xs">The current upload remains unsaved. If the file is outdated, download a fresh copy and retry.</p></div>}
    {preview && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Review inventory Excel changes">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5"><div><h2 className="text-lg font-bold text-slate-900">Review {preview.mode==='new'?'New Items':'Item Changes'}</h2><p className="mt-1 text-sm text-slate-500">{preview.name} · {changes.length} to save · {unchanged} unchanged · {invalid.length} need fixing</p></div><button type="button" disabled={busy} onClick={()=>setPreview(null)} aria-label="Close Excel review"><MdClose/></button></div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{preview.mode==='new'?'Every new product will be created with zero stock. Record received quantities using Stock In after import.':'Only item details will be updated. Current stock and all batch balances remain unchanged, even if stock changed since you downloaded Excel.'} <strong>Nothing is saved until you confirm below.</strong></div>
          {invalid.length>0 && <section className="rounded-xl border border-red-300 bg-red-50 p-3" aria-label="Excel errors"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-red-900">Fix {invalid.length} Excel row(s) first</h3><button type="button" className="button-secondary" onClick={downloadErrors}><MdDownload/> Download Error Report</button></div><div className="mt-2 max-h-44 overflow-auto space-y-1 text-sm text-red-900">{invalid.map((r,i)=><p key={`${r.row}-${i}`}><strong>Row {r.row} — {r.name||'Unnamed item'}:</strong> {r.errors.join(' ')}</p>)}</div></section>}
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100 text-xs font-bold text-slate-600"><tr>{['Excel Row','Item','Field changes','Result'].map(h=><th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{preview.rows.slice(0,100).map((r,i)=><tr key={`${r.row}-${i}`} className="border-t border-slate-100"><td className="px-3 py-2">{r.row}</td><td className="px-3 py-2 font-semibold">{r.name}</td><td className="px-3 py-2 text-xs text-slate-600">{preview.mode==='new'?'New item · 0 starting units':r.before?`Price: ₱${Number(r.before.selling_price).toFixed(2)} → ₱${Number(r.payload.selling_price).toFixed(2)} · Alert: ${r.before.threshold} → ${r.payload.threshold}`:'—'}</td><td className={`px-3 py-2 text-xs ${r.errors.length?'text-red-700':r.changed?'text-emerald-700':'text-slate-500'}`}>{r.errors.length?r.errors.join('; '):r.changed?'Ready to save':'No change'}</td></tr>)}</tbody></table></div>
          {preview.rows.length>100&&<p className="text-xs text-slate-500">Showing the first 100 rows. Every row was checked; download the error report for all issues.</p>}
          {!invalid.length && !!changes.length && <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4"/><span>I reviewed these changes and understand that this action does not change stock quantities or existing batches.</span></label>}
          {busy&&<p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Saving all changes together. Please don't close this window.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t p-4"><button type="button" disabled={busy} className="button-secondary" onClick={()=>setPreview(null)}>Cancel</button><button type="button" className="button-primary" disabled={busy||invalid.length>0||changes.length===0||!confirmed} onClick={apply}>{busy?'Saving…':invalid.length?`Fix ${invalid.length} row(s)`:changes.length===0?'No changes needed':`Save ${changes.length} Item(s)`}</button></div>
      </div>
    </div>}
  </section>
}

import { useRef, useState } from 'react'
import { MdClose, MdDownload, MdFileDownload, MdFileUpload, MdInventory2, MdEditNote, MdWarningAmber } from 'react-icons/md'
import {
  INVENTORY_HEADERS, INVENTORY_CREATE_HEADERS, INVENTORY_BULK_EDIT_HEADERS, INVENTORY_RECEIVE_HEADERS,
  makeInventoryXlsx, makeInventoryOpeningWorkbook, readInventoryOpeningWorkbook, readInventoryFile, asInventoryRow, asInventoryBulkEditRow,
} from '../../utils/inventoryExcel.mjs'
import { preflightInventoryCreate, preflightInventoryBulkEdit, preflightInventoryReceive, MAX_INVENTORY_IMPORT_BATCH } from '../../utils/inventoryExcelValidation.mjs'

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
  const headings = ['Worksheet', 'Excel Row', 'Item Name', 'Status', 'Errors']
  const body = rows.filter(r => r.errors.length).map(r => [r.sheet || 'Items', r.row, r.name, r.action, r.errors.join('; ')])
  return [headings, ...body].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// Bulk import and update are deliberately separate. Never use the old, row-by-row
// import path for the two redesigned flows: the server commits each file atomically.
export default function InventoryExcelTools({ items, stockRooms, masterData, services, onUpdated, onWorkflowChange }) {
  const fileRef = useRef(null)
  const [mode, setMode] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [showTools, setShowTools] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [exportPage, setExportPage] = useState(0)
  const [serverIssue, setServerIssue] = useState(null)

  const closePreview = () => {
    if (busy) return
    setPreview(null)
    setConfirmed(false)
    setServerIssue(null)
    setError('')
    onWorkflowChange?.(false)
  }
  const chooseUpload = () => {
    // OS file pickers can dispatch focus/visibility events to the inventory page.
    // Pause automatic refresh until selection is validated or cancelled.
    onWorkflowChange?.(true)
    fileRef.current?.click()
  }

  const start = (chosen) => {
    setMode(chosen)
    setExportPage(0)
    setPreview(null)
    setConfirmed(false)
    setServerIssue(null)
    setResults(null)
    setError('')
    setShowTools(true)
  }
  const download = (kind) => {
    try {
      setError('')
      if (kind === 'new') {saveBlob(makeInventoryOpeningWorkbook(), 'CARAIT_New_Items_With_Opening_Batches.xlsx');return}
      const rows = kind === 'edit' ? items.slice(exportPage*MAX_INVENTORY_IMPORT_BATCH,(exportPage+1)*MAX_INVENTORY_IMPORT_BATCH).map(asInventoryBulkEditRow)
        : kind === 'receive' ? items.slice(exportPage*MAX_INVENTORY_IMPORT_BATCH,(exportPage+1)*MAX_INVENTORY_IMPORT_BATCH).map(i=>[
            '',i.id,i.barcode||'',i.name||'','','','', '',stockRooms.find(r=>Number(r.id)===Number(i.default_location_id))?.name||'',i.supplier||'',
          ]) : items.map(i => asInventoryRow(i, stockRooms, 'view'))
      const headers = kind === 'edit' ? INVENTORY_BULK_EDIT_HEADERS : kind === 'receive' ? INVENTORY_RECEIVE_HEADERS : INVENTORY_HEADERS
      saveBlob(makeInventoryXlsx(rows, headers), kind === 'edit' ? `CARAIT_Update_Inventory_Details_Part_${exportPage+1}.xlsx` : kind === 'receive' ? `CARAIT_Receive_Stock_Part_${exportPage+1}.xlsx` : 'CARAIT_Inventory_Report_READ_ONLY.xlsx')
    } catch (e) { setError(e.message || 'Could not download your inventory Excel file.') }
  }
  const handleFile = async (file) => {
    if (!file || busy || !mode) { onWorkflowChange?.(false); return }
    setPreview(null); setResults(null); setConfirmed(false); setError('')
    try {
      const workbook = mode === 'new' ? await readInventoryOpeningWorkbook(file) : null
      const rows = workbook?.items || await readInventoryFile(file,{mode:mode==='receive'?'receive':'edit'})
      if (!rows.length) throw new Error('The Excel file has no inventory rows.')
      if (rows.length > MAX_INVENTORY_IMPORT_BATCH) throw new Error(`Upload at most ${MAX_INVENTORY_IMPORT_BATCH} items at a time. Split the Excel file into smaller files before uploading.`)
      if ((workbook?.batches||[]).length > 1000) throw new Error('Maximum 1,000 opening batch rows per workbook.')
      const options = { items, stockRooms, suppliers: masterData?.suppliers || [], openingBatches: workbook?.batches || [] }
      const reviewed = mode === 'new' ? preflightInventoryCreate(rows, options) : mode === 'receive' ? preflightInventoryReceive(rows, options) : preflightInventoryBulkEdit(rows, options)
      setServerIssue(null)
      setPreview({ name: file.name, rows: reviewed, mode })
    } catch (e) {
      setError(e?.message || 'Could not read the Excel file. Download the matching template and try again.')
      onWorkflowChange?.(false)
    }
  }
  const invalid = preview?.rows.filter(r => r.errors.length) || []
  const changes = preview?.rows.filter(r => r.changed && !r.errors.length) || []
  const appliedEarlier = preview?.mode==='edit' ? preview.rows.filter(r=>r.alreadyApplied?.length).length : 0
  const unchanged = preview ? preview.rows.length - changes.length - invalid.length - appliedEarlier : 0

  const downloadErrors = () => {
    if (!preview || !invalid.length) return
    saveBlob(new Blob(['\uFEFF', diagnosticsCSV(preview.rows)], { type: 'text/csv;charset=utf-8' }), 'CARAIT_Excel_Errors.csv')
  }
  const apply = async () => {
    if (!preview || busy || !confirmed || invalid.length || !changes.length) return
    if (typeof (preview.mode === 'new' ? services.importNewInventoryItems : preview.mode==='receive' ? services.bulkReceiveInventoryItems : services.bulkUpdateInventoryItems) !== 'function') {
      setError('This inventory action is not connected to the updated API. Update the clinic frontend and server together before uploading. No changes were saved.')
      return
    }
    setBusy(true); setError(''); setServerIssue(null)
    try {
      const payload = changes.map(entry => entry.payload)
      const result = preview.mode === 'new' ? await services.importNewInventoryItems(payload) : preview.mode==='receive' ? await services.bulkReceiveInventoryItems(payload) : await services.bulkUpdateInventoryItems(payload)
      setResults({ type: preview.mode, created: result?.created ?? 0, updated: result?.updated ?? 0, unchanged, alreadyApplied: (result?.already_applied ?? 0) + appliedEarlier, message: result?.message || 'Inventory updated.' })
      setPreview(null); setConfirmed(false)
      onWorkflowChange?.(false)
      try { await onUpdated() } catch { setError('The changes were saved, but the inventory list could not refresh. Refresh the page to see the latest items.') }
    } catch (e) {
      // Backend uses one transaction. No rows are committed on validation error.
      setConfirmed(false)
      const message=e?.message || 'The upload could not be saved. No changes were made. Review the file and try again.'
      setError(message)
      setServerIssue({message,details:e?.details||null})
    } finally { setBusy(false) }
  }

  return <section className="space-y-3" aria-label="Inventory Excel tools">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-bold text-slate-800">Excel Tools</h2><p className="text-xs text-slate-500">Add opening stock, update item details, receive deliveries or export stock.</p></div>
      <button type="button" className="button-secondary" onClick={() => setShowTools(s => !s)} aria-expanded={showTools}>{showTools ? 'Hide Excel Tools' : 'Show Excel Tools'}</button>
    </div>
    {showTools && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <button type="button" disabled={busy} onClick={() => start('new')} className={`rounded-2xl border p-4 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-500 ${mode==='new'?'border-emerald-400 bg-emerald-50':'border-slate-200 bg-white'}`}>
        <MdInventory2 className="text-2xl text-emerald-600"/><strong className="mt-2 block text-sm text-slate-900">Add New Items</strong><span className="mt-1 block text-xs text-slate-600">Register products and opening batches in one workbook.</span>
      </button>
      <button type="button" disabled={busy} onClick={() => start('edit')} className={`rounded-2xl border p-4 text-left transition-colors hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500 ${mode==='edit'?'border-blue-400 bg-blue-50':'border-slate-200 bg-white'}`}>
        <MdEditNote className="text-2xl text-blue-600"/><strong className="mt-2 block text-sm text-slate-900">Update Existing Items</strong><span className="mt-1 block text-xs text-slate-600">Change future selling prices and low-stock alerts only.</span>
      </button>
      <button type="button" disabled={busy} onClick={() => start('receive')} className={`rounded-2xl border p-4 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 ${mode==='receive'?'border-emerald-400 bg-emerald-50':'border-slate-200 bg-white'}`}>
        <MdInventory2 className="text-2xl text-emerald-600"/><strong className="mt-2 block text-sm text-slate-900">Receive Stock in Bulk</strong><span className="mt-1 block text-xs text-slate-600">Add batch receipts for existing items. Requires a receipt reference.</span>
      </button>
      <button type="button" disabled={busy} onClick={() => download('report')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-slate-600">
        <MdFileDownload className="text-2xl text-slate-700"/><strong className="mt-2 block text-sm text-slate-900">Download Inventory Report</strong><span className="mt-1 block text-xs text-slate-600">Read-only stock report. Do not upload it for editing.</span>
      </button>
    </div>}
    {showTools && mode && <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="font-bold text-slate-900">{mode==='new'?'Add New Items & Opening Stock':mode==='receive'?'Receive Stock in Bulk':'Update Existing Items'}</h3>
      <p className="mt-1 text-sm text-slate-600">1. Download the file. 2. Complete the allowed columns in Excel. 3. Upload and review before saving.</p>
      {mode!=='new' && items.length>MAX_INVENTORY_IMPORT_BATCH && <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">Choose items to download <select className="rounded-lg border border-slate-200 bg-white p-2" value={exportPage} onChange={e=>setExportPage(Number(e.target.value))}>{Array.from({length:Math.ceil(items.length/MAX_INVENTORY_IMPORT_BATCH)},(_,i)=><option key={i} value={i}>Items {i*MAX_INVENTORY_IMPORT_BATCH+1}–{Math.min(items.length,(i+1)*MAX_INVENTORY_IMPORT_BATCH)}</option>)}</select></label>}
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={busy} onClick={() => download(mode)}><MdDownload/> {mode==='new'?'Download Items & Opening Batches Template':mode==='receive'?'Download Stock Receipt Template':'Download Current Items for Editing'}</button>
        <button type="button" className="button-primary" disabled={busy} onClick={chooseUpload}><MdFileUpload/> Upload Completed File</button></div>
      <input ref={fileRef} type="file" accept={mode==='new'?'.xlsx':'.xlsx,.csv'} className="sr-only" aria-label="Choose the completed inventory Excel file" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void handleFile(file)}} onCancel={() => onWorkflowChange?.(false)} />
      <p className="mt-3 text-xs text-slate-600">{mode==='new'?'Complete Items and Opening Batches. Enter each quantity, expiry, supplier, stock room, and unit cost on the batches sheet. Initial Stock is calculated from those rows. Zero opening stock is allowed.':mode==='receive'?'For existing items only: enter an unused Receipt Reference for each delivery, quantity, expiry, supplier, unit cost, and Stock Room. Do not reupload a successful receipt.':'Only New Selling Price and New Low Stock Alert may be filled in. Leave either New column blank to keep its value. Existing bills and stock balances are not edited.'}</p>
    </div>}
    {results && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900" role="status"><strong>{results.message}</strong><p className="mt-1">Added: {results.created} · Updated: {results.updated} · Already applied: {results.alreadyApplied||0} · Other unchanged: {results.unchanged}</p></div>}
    {error && !preview && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><div className="flex items-start justify-between gap-2"><strong>Excel upload needs attention</strong><button type="button" onClick={()=>setError('')} aria-label="Dismiss Excel error"><MdClose/></button></div><p className="mt-2">{error}</p><p className="mt-1 text-xs">The current upload remains unsaved. If the file is outdated, download a fresh copy and retry.</p></div>}
    {preview && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Review inventory Excel changes">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5"><div><h2 className="text-lg font-bold text-slate-900">Review {preview.mode==='new'?'New Items & Opening Batches':preview.mode==='receive'?'Stock Receipts':'Item Changes'}</h2><p className="mt-1 text-sm text-slate-500">{preview.name} · {changes.length} to save · {appliedEarlier} already applied · {unchanged} unchanged · {invalid.length} need review</p></div><button type="button" disabled={busy} onClick={closePreview} aria-label="Close Excel review"><MdClose/></button></div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{preview.mode==='new'?'Opening stock will be calculated from the batch worksheet. Every batch creates a traceable Stock In movement.':preview.mode==='receive'?'Each received batch increases actual stock once. A repeated Receipt Reference is rejected to prevent double receiving.':'Only the two New columns change selling price or low-stock alert. Old bills and stock are not edited.'} <strong>Nothing is saved until you confirm below.</strong></div>
          {preview.mode==='new' && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Opening Stock Summary</strong><p className="mt-1">{changes.length} new item(s) · {changes.reduce((n,r)=>n+(r.openingBatches||0),0)} opening batch(es) · {changes.reduce((n,r)=>n+(r.openingQuantity||0),0)} units total. Quantity is counted from Opening Batches only.</p></div>}
          {preview.mode==='receive' && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Stock Received</strong><p className="mt-1">{changes.length} receipt(s) · {changes.reduce((n,r)=>n+(r.openingQuantity||0),0)} units. Each receipt reference can be used only once.</p></div>}
          {serverIssue && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900"><strong>Could not save these changes</strong><p className="mt-2">{serverIssue.message}</p><p className="mt-1">No items in this upload were saved. Your preview is still available. Correct the issue or download a new Excel file.</p></div>}
          {invalid.length>0 && <section className="rounded-xl border border-red-300 bg-red-50 p-3" aria-label="Excel errors"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-red-900">Review {invalid.length} Excel row(s) before saving</h3><button type="button" className="button-secondary" onClick={downloadErrors}><MdDownload/> Download Error Report</button></div><div className="mt-2 max-h-44 overflow-auto space-y-1 text-sm text-red-900">{invalid.map((r,i)=><p key={`${r.row}-${i}`}><strong>{r.sheet||'Inventory'} row {r.row} — {r.name||'Unnamed item'}:</strong> {r.errors.join(' ')}</p>)}</div></section>}
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100 text-xs font-bold text-slate-600"><tr>{['Excel Row','Item','Details / Quantity','Result'].map(h=><th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{preview.rows.slice(0,100).map((r,i)=><tr key={`${r.row}-${i}`} className="border-t border-slate-100"><td className="px-3 py-2">{r.row}</td><td className="px-3 py-2 font-semibold">{r.name}</td><td className="px-3 py-2 text-xs text-slate-600">{preview.mode==='new'?`New item · ${r.openingQuantity||0} opening units · ${r.openingBatches||0} batches`:preview.mode==='receive'?`Stock In: ${r.openingQuantity||0} units`:r.fieldChanges?.length ? r.fieldChanges.map(c=>`${c.label}: ${c.label==='Selling Price'?'₱'+Number(c.before).toFixed(2):c.before} → ${c.label==='Selling Price'?'₱'+Number(c.after).toFixed(2):c.after}`).join(' · ') : r.alreadyApplied?.length ? `Already updated: ${r.alreadyApplied.join(', ')}` : 'No fields requested'}</td><td className={`px-3 py-2 text-xs ${r.errors.length?'text-red-700':r.changed?'text-emerald-700':'text-slate-500'}`}>{r.errors.length?r.errors.join('; '):r.changed?'Ready to save':r.alreadyApplied?.length?'Already applied':'No change'}</td></tr>)}</tbody></table></div>
          {preview.rows.length>100&&<p className="text-xs text-slate-500">Showing the first 100 rows. Every row was checked; download the error report for all issues.</p>}
          {!invalid.length && !!changes.length && <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4"/><span>I reviewed this upload. I understand that stock quantities change only when importing opening batches or Stock In receipts, and that previous transactions remain unchanged.</span></label>}
          {busy&&<p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Saving all changes together. Please don't close this window.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t p-4"><button type="button" disabled={busy} className="button-secondary" onClick={closePreview}>Cancel</button><button type="button" className="button-primary" disabled={busy||invalid.length>0||changes.length===0||!confirmed} onClick={apply}>{busy?'Saving…':invalid.length?`Review ${invalid.length} row(s)`:changes.length===0?'No changes needed':preview.mode==='receive'?`Record ${changes.length} Stock Receipt(s)`:preview.mode==='new'?`Import ${changes.length} New Item(s)`:`Save ${changes.length} Item(s)`}</button></div>
      </div>
    </div>}
  </section>
}


import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MdClose, MdDownload, MdFileDownload, MdFileUpload, MdEditNote, MdHistory } from 'react-icons/md'
import {
  INVENTORY_HEADERS, INVENTORY_BULK_EDIT_HEADERS,
  makeInventoryXlsx, makeInventoryNewItemsTemplate, readInventoryImportFile, asInventoryRow, asInventoryBulkEditRow,
} from '../../utils/inventoryExcel.mjs'
import { preflightInventorySingleSheetCreate, preflightInventoryBulkEdit, MAX_INVENTORY_IMPORT_BATCH } from '../../utils/inventoryExcelValidation.mjs'

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
  const location = useLocation()
  const pricingPath = `${location.pathname.replace(/\/inventory(?:\/.*)?$/, '')}/system-setup/billing/services`
  const [reviewSearch, setReviewSearch] = useState('')
  const [reviewStatus, setReviewStatus] = useState('all')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [showTools, setShowTools] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [exportPage, setExportPage] = useState(0)
  const [reportPage, setReportPage] = useState(0)
  const [serverIssue, setServerIssue] = useState(null)
  const [uploads, setUploads] = useState([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPagination, setHistoryPagination] = useState({ page:1, totalPages:1, total:0 })
  const [uploadError, setUploadError] = useState('')
  const [undoing, setUndoing] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const loadUploads = async (page = historyPage) => {
    if (!services.getInventoryExcelUploads) return
    try {
      const result = await services.getInventoryExcelUploads(page)
      setUploads(Array.isArray(result?.items) ? result.items : [])
      setHistoryPagination(result?.pagination || {page:1,totalPages:1,total:0})
      if (result?.pagination?.page !== undefined) setHistoryPage(result.pagination.page)
      setUploadError('')
    } catch(e) {setUploadError(e.message||'Excel import history is unavailable.')}
  }
  useEffect(()=>{if(historyOpen)void loadUploads(historyPage)},[historyOpen,historyPage]) // eslint-disable-line react-hooks/exhaustive-deps
  const undoUpload = async (upload) => {
    if(!services.undoInventoryExcelUpload || undoing) return
    if (!window.confirm(`Undo Excel upload #${upload.id}? This will only work if all affected items are unchanged and unused.`)) return
    const reason = window.prompt('Reason for undoing this Excel upload (at least 5 characters):')
    if (!reason || reason.trim().length < 5) return
    setUndoing(upload.id);setUploadError('')
    try {
      const result = await services.undoInventoryExcelUpload(upload.id,reason.trim())
      setResults({created:0,updated:0,unchanged:0,alreadyApplied:0,message:result?.message||'Excel upload undone.'})
      await onUpdated()
      await loadUploads()
    } catch(e) {setUploadError(e.message||'Undo blocked because records changed after the upload.')}
    finally {setUndoing(null)}
  }


  const closePreview = () => {
    if (busy) return
    setPreview(null)
    setConfirmed(false)
    setServerIssue(null)
    setReviewSearch('')
    setReviewStatus('all')
    setError('')
    onWorkflowChange?.(false)
  }
  const chooseUpload = () => {
    if(busy)return
    // A file picker can temporarily hide the page, which may otherwise refresh
    // the entire inventory view while a user is selecting a workbook.
    onWorkflowChange?.(true)
    fileRef.current?.click()
  }
  const download = (kind) => {
    try {
      setError('')
      if (kind==='new') {
        saveBlob(makeInventoryNewItemsTemplate({stockRooms,suppliers:masterData?.suppliers||[]}), 'CARAIT_Import_New_Items.xlsx')
        return
      }
      // Bulk edits are limited to 200 existing items per upload by the API.
      // Export reports can contain more rows, but still need a bounded workbook.
      const selected = kind==='edit'
        ? items.slice(exportPage*MAX_INVENTORY_IMPORT_BATCH,(exportPage+1)*MAX_INVENTORY_IMPORT_BATCH)
        : items.slice(reportPage*2000,(reportPage+1)*2000)
      const rows = kind==='edit' ? selected.map(asInventoryBulkEditRow)
        : selected.map(i=>asInventoryRow(i,stockRooms,'view'))
      if(!rows.length)throw new Error('No existing inventory items are available to export.')
      const name=kind==='edit' ? `CARAIT_Editable_Items_Part_${exportPage+1}.xlsx`
        : `CARAIT_Inventory_Report_READ_ONLY_Part_${reportPage+1}.xlsx`
      saveBlob(makeInventoryXlsx(rows,kind==='edit'?INVENTORY_BULK_EDIT_HEADERS:INVENTORY_HEADERS,
        {readOnly:kind==='report',styled:true}),name)
    } catch(e){setError(e.message||'Could not export your inventory Excel file.')}
  }
  const handleFile = async (file) => {
    if(!file||busy){onWorkflowChange?.(false);return}
    setPreview(null);setResults(null);setConfirmed(false);setError('');setReviewSearch('');setReviewStatus('all')
    try{
      const parsed=await readInventoryImportFile(file)
      if(!parsed.rows.length)throw new Error('The Excel file has no inventory rows.')
      if(parsed.mode==='edit' && parsed.rows.length>MAX_INVENTORY_IMPORT_BATCH)
        throw new Error(`Editable exports accept up to ${MAX_INVENTORY_IMPORT_BATCH} items per upload.`)
      if(parsed.mode==='new' && parsed.rows.length>1000)
        throw new Error('New-item uploads accept at most 1,000 opening rows.')
      const unique=parsed.mode==='new' ? new Set(parsed.rows.map(r=>String(r['Item Name']||'').trim().toLocaleLowerCase('en'))).size : 0
      if(unique>MAX_INVENTORY_IMPORT_BATCH)
        throw new Error(`New-item uploads accept at most ${MAX_INVENTORY_IMPORT_BATCH} different items.`)
      const options={items,stockRooms,suppliers:masterData?.suppliers||[]}
      const reviewed=parsed.mode==='new'
        ? preflightInventorySingleSheetCreate(parsed.rows,options)
        : preflightInventoryBulkEdit(parsed.rows,options)
      setServerIssue(null)
      setPreview({name:file.name,rows:reviewed,mode:parsed.mode})
    }catch(e){
      setError(e?.message||'Could not read the Excel file. Download a fresh CARAIT template and try again.')
      onWorkflowChange?.(false)
    }
  }
  const invalid = preview?.rows.filter(r => r.errors.length) || []
  const changes = preview?.rows.filter(r => r.changed && !r.errors.length) || []
  const appliedEarlier = preview?.mode==='edit' ? preview.rows.filter(r=>r.alreadyApplied?.length).length : 0
  const unchanged = preview ? preview.rows.length - changes.length - invalid.length - appliedEarlier : 0
  const visibleRows = (preview?.rows || []).filter(row => {
    const matched = `${row.name || ''} ${row.row || ''} ${row.sheet || ''}`.toLowerCase().includes(reviewSearch.trim().toLowerCase())
    if (!matched) return false
    if (reviewStatus === 'errors') return Boolean(row.errors?.length)
    if (reviewStatus === 'changed') return Boolean(row.changed && !row.errors?.length)
    if (reviewStatus === 'unchanged') return !row.changed && !row.errors?.length
    return true
  })

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
    setBusy(true); setError(''); setServerIssue(null)
    try {
      const payload = changes.map(entry => entry.payload)
      const result = preview.mode === 'new' ? await services.importNewInventoryItems(payload) : await services.bulkUpdateInventoryItems(payload)
      setResults({ type: preview.mode, created: result?.created ?? 0, updated: result?.updated ?? 0, unchanged, alreadyApplied: (result?.already_applied ?? 0) + appliedEarlier, message: result?.message || 'Inventory updated.' })
      if(historyOpen) await loadUploads()
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
      <div><h2 className="text-base font-bold text-slate-800">Inventory Import & Export</h2><p className="text-xs text-slate-500">Add new items with opening stock, update existing item details, or export a report.</p></div>
      <button type="button" className="button-secondary" onClick={() => setShowTools(s => !s)} aria-expanded={showTools}>{showTools ? 'Hide Excel Tools' : 'Show Excel Tools'}</button>
    </div>
    {showTools && <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="flex items-center gap-2 font-bold text-slate-900"><MdFileUpload className="text-xl"/> Import</h3>
        <p className="mt-1 text-sm text-slate-600">Create new products with opening batches, or upload an editable export to change current item details.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="button-secondary" disabled={busy} onClick={()=>download('new')}><MdDownload/> Download Template</button>
          <button type="button" className="button-primary" disabled={busy} onClick={chooseUpload}><MdFileUpload/> Upload File</button>
        </div>
        <p className="mt-3 text-xs text-slate-600">One worksheet per file. The system identifies new-item imports and existing-item edits automatically. To add stock to existing items, use Stock In.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="flex items-center gap-2 font-bold text-slate-900"><MdFileDownload className="text-xl"/> Export</h3>
        <p className="mt-1 text-sm text-slate-600">Export a read-only inventory report, or download existing items for editing and upload them back through Import.</p>
        {items.length>MAX_INVENTORY_IMPORT_BATCH && <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-700">Editable export range
          <select className="rounded-lg border border-slate-200 bg-white p-2" value={exportPage} onChange={e=>setExportPage(Number(e.target.value))}>
            {Array.from({length:Math.ceil(items.length/MAX_INVENTORY_IMPORT_BATCH)},(_,i)=><option key={i} value={i}>Items {i*MAX_INVENTORY_IMPORT_BATCH+1}–{Math.min(items.length,(i+1)*MAX_INVENTORY_IMPORT_BATCH)}</option>)}
          </select>
        </label>}
        {items.length>2000 && <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">Report export range
          <select className="rounded-lg border border-slate-200 bg-white p-2" value={reportPage} onChange={e=>setReportPage(Number(e.target.value))}>
            {Array.from({length:Math.ceil(items.length/2000)},(_,i)=><option key={i} value={i}>Items {i*2000+1}–{Math.min(items.length,(i+1)*2000)}</option>)}
          </select>
        </label>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="button-secondary" disabled={busy||items.length===0} onClick={()=>download('report')}><MdFileDownload/> Export Read-Only</button>
          <button type="button" className="button-secondary" disabled={busy||items.length===0} onClick={()=>download('edit')}><MdEditNote/> Export Editable Excel</button>
        </div>
        <p className="mt-3 text-xs text-slate-600">Editable exports permit selling price and low-stock alert changes only. They never add stock or create items.</p>
      </div>
    </div>}
    {showTools && services.getInventoryExcelUploads && <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-bold text-slate-900"><MdHistory/> Excel Import History</h3><p className="text-xs text-slate-500">Undo new-item uploads or item edits only when the affected records have not been used or changed.</p></div><button type="button" className="button-secondary" onClick={()=>setHistoryOpen(v=>!v)}>{historyOpen?'Hide History':'Show History'}</button></div>
      {historyOpen && <div className="mt-3 space-y-2">
        <button type="button" className="button-secondary" onClick={()=>loadUploads(historyPage)}>Refresh History</button>
        {uploadError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{uploadError}</p>}
        {uploads.length===0 && <p className="text-sm text-slate-500">No recent Excel uploads recorded.</p>}
        {uploads.map(upload=><div key={upload.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-bold">Upload #{upload.id} · {upload.upload_type==='new_items'?'New Items':'Item Edits'}</p><p className="text-xs text-slate-500">{upload.created_at?new Date(upload.created_at).toLocaleString('en-PH'):'Date unavailable'} · {upload.undone_at?'Undone':'Saved'}</p></div><button type="button" className="button-secondary" disabled={Boolean(upload.undone_at)||Boolean(undoing)||busy} onClick={()=>undoUpload(upload)}>{undoing===upload.id?'Checking…':upload.undone_at?'Already Undone':'Undo Upload'}</button></div>)}
        <div className="flex items-center justify-between gap-2 border-t pt-3 text-sm"><span className="text-slate-500">{historyPagination.total} uploads · Page {historyPagination.page} of {historyPagination.totalPages}</span><div className="flex gap-2"><button type="button" className="button-secondary" disabled={historyPage<=1||busy||Boolean(undoing)} onClick={()=>setHistoryPage(p=>p-1)}>Previous</button><button type="button" className="button-secondary" disabled={historyPage>=historyPagination.totalPages||busy||Boolean(undoing)} onClick={()=>setHistoryPage(p=>p+1)}>Next</button></div></div>
      </div>}
    </div>}
    <input ref={fileRef} type="file" accept=".xlsx" className="sr-only" aria-label="Choose CARAIT Inventory Excel file" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void handleFile(file)}} onCancel={()=>onWorkflowChange?.(false)}/>
    {results && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900" role="status"><strong>{results.message}</strong><p className="mt-1">Added: {results.created} · Updated: {results.updated} · Already applied: {results.alreadyApplied||0} · Other unchanged: {results.unchanged}</p></div>}
    {error && !preview && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><div className="flex items-start justify-between gap-2"><strong>Excel upload needs attention</strong><button type="button" onClick={()=>setError('')} aria-label="Dismiss Excel error"><MdClose/></button></div><p className="mt-2">{error}</p><p className="mt-1 text-xs">The current upload remains unsaved. If the file is outdated, download a fresh copy and retry.</p></div>}
    {preview && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Review inventory Excel changes">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5"><div><h2 className="text-lg font-bold text-slate-900">Review {preview.mode==='new'?'New Items & Opening Stock':'Item Changes'}</h2><p className="mt-1 text-sm text-slate-500">{preview.name} · {changes.length} to save · {appliedEarlier} already applied · {unchanged} unchanged · {invalid.length} need review</p></div><button type="button" disabled={busy} onClick={closePreview} aria-label="Close Excel review"><MdClose/></button></div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{preview.mode==='new'?'Initial Stock on each new-item row becomes one opening batch. Repeated item names create one product with separate batches.':'Only New Selling Price and New Low Stock Alert can change. Existing stock and previous bills stay unchanged.'} <strong>Nothing is saved until you confirm below.</strong></div>
          {preview.mode==='new' && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Opening Stock Summary</strong><p className="mt-1">{changes.length} new item(s) · {changes.reduce((n,r)=>n+(r.openingBatches||0),0)} opening batch(es) · {changes.reduce((n,r)=>n+(r.openingQuantity||0),0)} units total. Opening stock is calculated from the single Inventory sheet.</p></div>}
          {serverIssue && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900"><strong>Could not save these changes</strong><p className="mt-2">{serverIssue.message}</p><p className="mt-1">No items in this upload were saved. Your preview is still available. Correct the issue or download a new Excel file.</p>{/linked to billable services|Services & Pricing/i.test(serverIssue.message) && <p className="mt-2">This item's price is used by a service. Update the service setup instead. <Link to={pricingPath} className="font-bold underline">Open Services & Pricing</Link></p>}</div>}
          {invalid.length>0 && <section className="rounded-xl border border-red-300 bg-red-50 p-3" aria-label="Excel errors"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-red-900">Review {invalid.length} Excel row(s) before saving</h3><button type="button" className="button-secondary" onClick={downloadErrors}><MdDownload/> Download Error Report</button></div><div className="mt-2 max-h-44 overflow-auto space-y-1 text-sm text-red-900">{invalid.map((r,i)=><p key={`${r.row}-${i}`}><strong>{r.sheet||'Inventory'} row {r.row} — {r.name||'Unnamed item'}:</strong> {r.errors.join(' ')}</p>)}</div></section>}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <label className="min-w-[200px] flex-1 text-xs font-bold text-slate-600">Find an item or row
              <input type="search" className="form-control mt-1" value={reviewSearch} onChange={e=>setReviewSearch(e.target.value)} placeholder="Item name or Excel row" />
            </label>
            <label className="text-xs font-bold text-slate-600">Show
              <select className="form-control mt-1" value={reviewStatus} onChange={e=>setReviewStatus(e.target.value)}>
                <option value="all">All ({preview.rows.length})</option>
                <option value="changed">Changed ({changes.length})</option>
                <option value="errors">Needs review ({invalid.length})</option>
                <option value="unchanged">Unchanged ({unchanged + appliedEarlier})</option>
              </select>
            </label>
            <span className="text-xs text-slate-500">Showing {Math.min(visibleRows.length,100)} of {visibleRows.length} matching rows</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100 text-xs font-bold text-slate-600"><tr>{['Excel Row','Item','Details / Quantity','Result'].map(h=><th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{visibleRows.slice(0,100).map((r,i)=><tr key={`${r.row}-${i}`} className="border-t border-slate-100"><td className="px-3 py-2">{r.row}</td><td className="px-3 py-2 font-semibold">{r.name}</td><td className="px-3 py-2 text-xs text-slate-600">{preview.mode==='new'?`New item · ${r.openingQuantity||0} opening units · ${r.openingBatches||0} batches`:r.fieldChanges?.length ? r.fieldChanges.map(c=>`${c.label}: ${c.label==='Selling Price'?'₱'+Number(c.before).toFixed(2):c.before} → ${c.label==='Selling Price'?'₱'+Number(c.after).toFixed(2):c.after}`).join(' · ') : r.alreadyApplied?.length ? `Already updated: ${r.alreadyApplied.join(', ')}` : 'No fields requested'}</td><td className={`px-3 py-2 text-xs ${r.errors.length?'text-red-700':r.changed?'text-emerald-700':'text-slate-500'}`}>{r.errors.length?r.errors.join('; '):r.changed?'Ready to save':r.alreadyApplied?.length?'Already applied':'No change'}</td></tr>)}</tbody></table></div>
          {!visibleRows.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No items match this search or filter.</p>}
          {visibleRows.length>100&&<p className="text-xs text-slate-500">Showing the first 100 matching rows. All Excel rows were still checked; download the error report for issues outside this page.</p>}
          {!invalid.length && !!changes.length && <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-4 w-4"/><span>I reviewed this upload. New-item opening stock creates batch movements, while existing-item edits never change stock or previous transactions.</span></label>}
          {busy&&<p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Saving all changes together. Please don't close this window.</p>}
        </div>
        <div className="flex justify-end gap-2 border-t p-4"><button type="button" disabled={busy} className="button-secondary" onClick={closePreview}>Cancel</button><button type="button" className="button-primary" disabled={busy||invalid.length>0||changes.length===0||!confirmed} onClick={apply}>{busy?'Saving…':invalid.length?`Review ${invalid.length} row(s)`:changes.length===0?'No changes needed':preview.mode==='new'?`Import ${changes.length} New Item(s)`:`Save ${changes.length} Item(s)`}</button></div>
      </div>
    </div>}
  </section>
}



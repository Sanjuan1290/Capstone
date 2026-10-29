import {useRef,useState} from 'react'
import {MdFileDownload,MdFileUpload,MdDescription,MdEditNote,MdClose} from 'react-icons/md'
import {INVENTORY_HEADERS,makeInventoryXlsx,readInventoryFile,asInventoryRow} from '../../utils/inventoryExcel.mjs'
import {preflightInventoryExcel} from '../../utils/inventoryExcelValidation.mjs'

const saveBlob=(blob,name)=>{
  const url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),30000)
}
const inventoryExportRows=(items,rooms,kind)=>items.map(item=>asInventoryRow(item,rooms,kind))

export default function InventoryExcelTools({items,stockRooms,masterData,services,onUpdated}){
  const uploadRef=useRef(null),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState(null)
  const download=(kind)=>{
    const rows=kind==='template'?[]:inventoryExportRows(items,stockRooms,kind==='edit'?'edit':'view')
    saveBlob(makeInventoryXlsx(rows),kind==='template'?'CARAIT_Inventory_Import_Template.xlsx':kind==='edit'?'CARAIT_Inventory_Bulk_Edit.xlsx':'CARAIT_Inventory_Export.xlsx')
  }
  const chooseFile=()=>{setError('');setResults(null);uploadRef.current?.click()}
  const handleFile=async(file)=>{
    if(!file)return
    setPreview(null);setError('');setResults(null)
    try{
      const rows=await readInventoryFile(file)
      if(!rows.length)throw new Error('No items found in this spreadsheet.')
      const reviewed=preflightInventoryExcel(rows,{items,stockRooms,suppliers:masterData.suppliers||[]})
      setPreview({name:file.name,rows:reviewed})
    }catch(e){setError(e.message||'Could not read spreadsheet.')}
  }
  const apply=async()=>{
    if(!preview||busy||preview.rows.some(r=>r.errors.length))return
    const changes=preview.rows.filter(row=>row.changed)
    if(!changes.length){setResults({created:0,updated:0,failed:[],unchanged:preview.rows.length});return}
    if(!window.confirm(`Save ${changes.length} inventory change(s)?\n\nNew items with opening stock will create stock receipts. Changes to existing stock quantities and batch expiry are not allowed.\n\nThis may take a moment and cannot be undone as one operation.`))return
    setBusy(true);setError('')
    let created=0,updated=0;const failed=[]
    try{
      for(const row of changes){
        try{if(row.action==='create'){await services.addInventoryItem(row.payload);created++}
          else {await services.updateInventoryItem(row.existing.id,row.payload);updated++}}
        catch(e){failed.push({row:row.row._excelRow,name:row.name,message:e.message||'Save failed'});break}
      }
    }finally{
      setBusy(false);setResults({created,updated,failed,unchanged:preview.rows.length-changes.length})
      if(created||updated)await onUpdated().catch(()=>{})
      if(!failed.length)setPreview(null)
    }
  }
  const invalid=preview?.rows.filter(r=>r.errors.length)||[]
  const changed=preview?.rows.filter(r=>r.changed&&!r.errors.length)||[]
  return <>
    <div className="flex flex-wrap gap-2" aria-label="Inventory Excel actions">
      <button type="button" className="button-secondary" onClick={chooseFile}><MdFileUpload/> Import Excel</button>
      <button type="button" className="button-secondary" onClick={()=>download('view')}><MdFileDownload/> Export Excel</button>
      <button type="button" className="button-secondary" onClick={()=>download('edit')}><MdEditNote/> Export Bulk Edit</button>
      <button type="button" className="button-secondary" onClick={()=>download('template')}><MdDescription/> Download Template</button>
    </div>
    <input ref={uploadRef} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Import inventory Excel file" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void handleFile(file)}}/>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    {results&&<div role="status" className={`rounded-xl border p-3 text-sm ${results.failed.length?'border-amber-200 bg-amber-50':'border-emerald-200 bg-emerald-50'}`}>
      Imported: {results.created} new, {results.updated} updated, {results.unchanged} unchanged.
      {results.failed.map(f=><p key={f.row} className="mt-1 text-red-700">Stopped on row {f.row} ({f.name}): {f.message}. Re-export your inventory before retrying.</p>)}
    </div>}
    {preview&&<div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 px-3 py-5" role="dialog" aria-modal="true" aria-label="Review inventory Excel import">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div><h2 className="font-bold text-lg">Review Inventory Import</h2><p className="text-sm text-slate-500">{preview.name} · {preview.rows.length} rows · {changed.length} changes · {invalid.length} with errors</p></div>
          <button type="button" disabled={busy} aria-label="Close import preview" onClick={()=>setPreview(null)}><MdClose/></button>
        </div>
        <p className="px-5 py-3 text-sm text-amber-800 bg-amber-50">Quantity is read-only for existing items. Initial Stock creates a receipt for new items only. Edit individual receipt expiry dates through Manage Batches. Supplier defaults to JAS unless specified in the file.</p>
        <div className="min-h-0 overflow-auto p-4"><table className="w-full min-w-[750px] text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{['Row','Action','Item','Price','Initial','Current Qty','Category','Stock Room','Result'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>{preview.rows.slice(0,100).map((r,i)=><tr key={i} className={r.errors.length?'bg-red-50':'border-b'}><td className="p-2">{r.row._excelRow}</td><td className="p-2">{r.action}</td><td className="p-2 font-medium">{r.name}</td><td className="p-2">{r.row['Selling Price']}</td><td className="p-2">{r.row['Initial Stock']||'—'}</td><td className="p-2">{r.row.Quantity||'0'}</td><td className="p-2">{r.row.Category}</td><td className="p-2">{r.row['Stock Room']}</td><td className="p-2">{r.errors.length?r.errors.join('; '):r.changed?'Ready':'No changes'}</td></tr>)}</tbody></table>
        {preview.rows.length>100&&<p className="pt-2 text-xs text-slate-500">Showing first 100 rows; all {preview.rows.length} rows will be validated.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4"><button type="button" className="button-secondary" disabled={busy} onClick={()=>setPreview(null)}>Cancel</button><button type="button" className="button-primary" onClick={apply} disabled={busy||invalid.length>0||changed.length===0}>{busy?'Saving…':invalid.length?`Fix ${invalid.length} row(s) first`:`Confirm ${changed.length} Change(s)`}</button></div>
      </div>
    </div>}
  </>
}

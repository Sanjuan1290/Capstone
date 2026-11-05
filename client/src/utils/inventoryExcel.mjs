import { inflateRaw } from '../vendor/pakoInflate.mjs'
// Minimal dependency-free XLSX reader/writer for small, flat CARAIT inventory sheets.
// Supports OOXML shared/inline strings, numeric/date cells, and CSV from Excel.
// Does not execute formulas, macros or hyperlinks. Limits size and rows before parsing.
export const INVENTORY_HEADERS = ['Item Name', 'Selling Price', 'Initial Stock', 'Quantity', 'Expiration Date', 'Category', 'Stock Room', 'Low Stock Alert', 'Supplier']
// Internal record identifiers are retained ONLY in bulk-edit exports for safe matching.
// Separate workbooks make stock fields impossible to confuse with metadata edits.
export const INVENTORY_CREATE_HEADERS = ['Item Name', 'Category', 'Selling Price', 'Low Stock Alert', 'Supplier', 'Stock Room', 'Initial Stock (calculated)']
export const INVENTORY_OPENING_BATCH_HEADERS = ['Item Name', 'Quantity', 'Expiration Date', 'Supplier Lot Number', 'Unit Cost', 'Stock Room', 'Supplier']
export const INVENTORY_NEW_ITEM_HEADERS = ['Item Name', 'Category', 'Selling Price', 'Initial Stock', 'Expiration Date', 'Low Stock Alert', 'Supplier', 'Stock Room']
export const INVENTORY_RECEIVE_HEADERS = ['Receipt Reference', 'Item ID', 'Barcode', 'Item Name', 'Quantity', 'Expiration Date', 'Supplier Lot Number', 'Unit Cost', 'Stock Room', 'Supplier']
export const INVENTORY_BULK_EDIT_HEADERS = [
  'Item ID', 'Barcode', 'Item Name', 'Current Selling Price', 'New Selling Price',
  'Current Low Stock Alert', 'New Low Stock Alert',
]
const MAX_BYTES = 6 * 1024 * 1024
const MAX_ROWS = 2000
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const escapeXml = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
const columnCode = (index) => {let value=index+1, out='';while(value){value--;out=String.fromCharCode(65+value%26)+out;value=Math.floor(value/26)}return out}
const colIndex = (ref) => [...(String(ref).match(/^[A-Z]+/)?.[0]||'')].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1
const crcTable = Array.from({length:256}, (_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0})
const checksum = (bytes) => {let c=0xFFFFFFFF; for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
const u16=(view,pos,val)=>view.setUint16(pos,val,true)
const u32=(view,pos,val)=>view.setUint32(pos,val,true)
const zipStored = (entries) => {
  let offset=0;const local=[],central=[]
  for(const [path,text] of entries){
    const name=encoder.encode(path),data=encoder.encode(text),crc=checksum(data)
    const localBytes=new Uint8Array(30+name.length+data.length),lv=new DataView(localBytes.buffer)
    u32(lv,0,0x04034b50);u16(lv,4,20);u16(lv,6,0x0800);u16(lv,8,0);u32(lv,14,crc);u32(lv,18,data.length);u32(lv,22,data.length);u16(lv,26,name.length)
    localBytes.set(name,30);localBytes.set(data,30+name.length);local.push(localBytes)
    const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer)
    u32(cv,0,0x02014b50);u16(cv,4,20);u16(cv,6,20);u16(cv,8,0x0800);u32(cv,16,crc);u32(cv,20,data.length);u32(cv,24,data.length);u16(cv,28,name.length);u32(cv,42,offset)
    c.set(name,46);central.push(c);offset+=localBytes.length
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer)
  u32(ev,0,0x06054b50);u16(ev,8,entries.length);u16(ev,10,entries.length);u32(ev,12,centralSize);u32(ev,16,offset)
  const full=new Uint8Array(offset+centralSize+22);let pos=0
  for(const b of [...local,...central,end]){full.set(b,pos);pos+=b.length}
  return full
}
const inlineListValidation=(label,headers,values)=>{
  const index=headers.indexOf(label)
  const entries=[...new Set(values.map(v=>String(v??'').trim()).filter(v=>v&&!v.includes(',')&&!v.includes('"')))]
  const content=entries.join(',')
  if(index<0||!content||content.length>240)return ''
  const letter=columnCode(index)
  return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Invalid value" error="Select a value from the list" sqref="${letter}2:${letter}1001"><formula1>${escapeXml('"'+content+'"')}</formula1></dataValidation>`
}
const worksheetXml=(headers,rows,{readOnly=false,styled=false,validations={}}={})=>{
  const all=[headers,...rows];const body=all.map((row,ri)=>`<row r="${ri+1}"${styled&&ri===0?' ht="34" customHeight="1"':''}>${headers.map((_,ci)=>{
    const v=row[ci];if(v===null||v===undefined||v==='')return ''
    const ref=`${columnCode(ci)}${ri+1}`
    return typeof v==='number'&&Number.isFinite(v)?`<c r="${ref}"${styled&&ri===0?' s="1"':''}><v>${v}</v></c>`:`<c r="${ref}"${styled&&ri===0?' s="1"':''} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`
  }).join('')}</row>`).join('')
  const rules=Object.entries(validations).map(([label,choices])=>inlineListValidation(label,headers,choices)).filter(Boolean)
  const validationXml=rules.length?`<dataValidations count="${rules.length}">${rules.join('')}</dataValidations>`:''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${columnCode(headers.length-1)}${all.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="29" customWidth="1"/><col min="2" max="${headers.length}" width="21" customWidth="1"/></cols><sheetData>${body}</sheetData>${readOnly ? '<sheetProtection sheet="1" objects="1" scenarios="1" autoFilter="0" sort="0"/>' : ''}<autoFilter ref="A1:${columnCode(headers.length-1)}${all.length}"/>${validationXml}</worksheet>`
}
const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF183153"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
export const makeInventoryXlsx = (rows=[], headers=INVENTORY_HEADERS, options={}) => {
  if(rows.length>MAX_ROWS)throw new Error('Too many inventory rows for one workbook.')
  const entries=[
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${options.styled ? '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' : ''}</Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${options.styled ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' : ''}</Relationships>`],
    ['xl/worksheets/sheet1.xml',worksheetXml(headers,rows,options)],
    ...(options.styled ? [['xl/styles.xml',stylesXml]] : []),
  ]
  return new Blob([zipStored(entries)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}

// New item imports use exactly one visible Inventory sheet. Each spreadsheet row
// is one opening batch; repeated item names share one catalog record. The API
// still receives stock:0 plus verified opening_batches, never a summed stock edit.
export const makeInventoryNewItemsTemplate = ({stockRooms=[],suppliers=[]}={}) => makeInventoryXlsx([], INVENTORY_NEW_ITEM_HEADERS, {
  styled:true,validations:{
    'Category':['General Medicine','Dermatology'],
    'Stock Room':stockRooms.filter(r=>Number(r.is_active??1)===1).map(r=>r.name),
    'Supplier':suppliers.filter(r=>Number(r.is_active??1)===1).map(r=>r.name),
  },
})
export const makeInventoryOpeningWorkbook = () => makeInventoryWorkbook([
  {name:'Items',headers:INVENTORY_CREATE_HEADERS,rows:[]},
  {name:'Opening Batches',headers:INVENTORY_OPENING_BATCH_HEADERS,rows:[]},
])
// The report download is read-only aggregated data and may need several sheets.
// Inventory's public API keeps its existing two-sheet validation.
export const makeInventoryWorkbook = sheets => {
  if(!Array.isArray(sheets)||sheets.length<1||sheets.length>2)throw new Error('Use one or two inventory worksheets.')
  return makeWorkbookSheets(sheets)
}
export const makeReportWorkbook = sheets => {
  if(!Array.isArray(sheets)||sheets.length<1||sheets.length>12)throw new Error('Reports must have between 1 and 12 worksheets.')
  if(sheets.some(sheet=>!sheet.name||sheet.name.length>31||!/^[A-Za-z0-9 -]+$/.test(sheet.name)))throw new Error('Invalid report worksheet title.')
  return makeWorkbookSheets(sheets)
}
const makeWorkbookSheets = (sheets) => {
  if(sheets.some(x=>x.rows.length>MAX_ROWS))throw new Error('Too many rows in one worksheet.')
  const overrides=sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const sheetList=sheets.map((s,i)=>`<sheet name="${escapeXml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')
  const relationships=sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')
  const entries=[
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"> <sheets>${sheetList}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`],
    ...sheets.map((sheet,i)=>[`xl/worksheets/sheet${i+1}.xml`,worksheetXml(sheet.headers,sheet.rows)]),
  ]
  return new Blob([zipStored(entries)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}

const parseGrid = (sheet, shared) => byTag(xmlDoc(sheet),'row').slice(0,MAX_ROWS+2).map(row=>{
  const cells=[]
  for(const c of [...row.children].filter(node=>node.localName==='c')) {
    const column=colIndex(c.getAttribute('r'))
    if(column<0||column>40)continue
    const kind=c.getAttribute('t'),raw=byTag(c,'v')[0]?.textContent
    const inline=byTag(c,'is')[0]
    cells[column]=kind==='s'?shared[Number(raw)]??'':kind==='inlineStr'?byTag(inline,'t').map(x=>x.textContent).join(''):raw??''
  }
  cells._excelRow=Number(row.getAttribute('r'))||null
  return cells
})
const gridAsRecords = (grid,expected,sheetName) => {
  const records=grid.map((cells,i)=>({cells,line:cells._excelRow||i+1})).filter(({cells})=>cells.some(x=>String(x??'').trim()))
  if(!records.length)throw new Error(`${sheetName}: column headings are missing.`)
  const headers=records[0].cells.map(x=>String(x??'').trim().toLowerCase().replace(/\s+/g,' '))
  const required=expected.map(h=>h.toLowerCase())
  const missing=required.filter(h=>!headers.includes(h))
  const extra=headers.filter(h=>h&&!required.includes(h))
  if(missing.length||extra.length||headers.some((h,i)=>h&&headers.indexOf(h)!==i))throw new Error(`${sheetName}: incorrect columns. ${missing.length?'Missing '+missing.join(', ')+'. ':''}${extra.length?'Unexpected '+extra.join(', ')+'. ':''}Download the matching template.`)
  return records.slice(1).map(({cells,line})=>Object.fromEntries(expected.map(header=>{
    let value=String(cells[headers.indexOf(header.toLowerCase())]??'').trim()
    if(header==='Expiration Date'&&/^\d{5}(?:\.\d+)?$/.test(value))value=excelDate(value)
    return [header,value]
  }).concat([['_excelRow',line],['_sheet',sheetName]])))
}
export const readInventoryOpeningWorkbook = async file => {
  if(!/\.xlsx$/i.test(file.name))throw new Error('Opening batches need an .xlsx workbook with Items and Opening Batches sheets.')
  if(file.size>MAX_BYTES)throw new Error('Workbook must be 6 MB or smaller.')
  const zip=await readZip(new Uint8Array(await file.arrayBuffer()))
  const first=zip.get('xl/worksheets/sheet1.xml'),second=zip.get('xl/worksheets/sheet2.xml')
  if(!first||!second)throw new Error('Download the new template. It must have Items and Opening Batches worksheets.')
  const book=xmlDoc(zip.get('xl/workbook.xml')||'<workbook/>')
  // If an externally generated workbook is supplied, reject renamed/reordered sheets.
  const names=byTag(book,'sheet').map(x=>x.getAttribute('name'))
  if(names[0]!=='Items'||names[1]!=='Opening Batches')throw new Error('Worksheets must be named Items and Opening Batches, in that order.')
  const shared=zip.has('xl/sharedStrings.xml')?byTag(xmlDoc(zip.get('xl/sharedStrings.xml')),'si').map(si=>byTag(si,'t').map(x=>x.textContent).join('')):[]
  return {items:gridAsRecords(parseGrid(first,shared),INVENTORY_CREATE_HEADERS,'Items'),batches:gridAsRecords(parseGrid(second,shared),INVENTORY_OPENING_BATCH_HEADERS,'Opening Batches')}
}

const toCSV = text => {
  const rows=[];let row=[],cell='',quoted=false
  for(let i=0;i<text.length;i++){
    const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch}
    else if(ch==='"')quoted=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=ch
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows
}
// Office/Excel ZIP entries use raw DEFLATE. The browser CompressionStream API
// is not portable for `deflate-raw`, so use a bundled MIT-licensed decoder.
const decompress=async(bytes,method)=>{
  if(method===0)return bytes
  if(method!==8)throw new Error('Unsupported Excel workbook compression (ZIP method '+method+').')
  try { return inflateRaw(bytes) } catch {
    throw new Error('Cannot read the compressed Excel worksheet. The file may be damaged. Try saving it again as .xlsx or .csv.')
  }
}
const readZip=async(bytes)=>{
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break}}
  if(end<0)throw new Error('Invalid Excel workbook ZIP structure.')
  const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true)
  if(count>100)throw new Error('Workbook has too many internal files.')
  let offset=start,accumulated=0;const out=new Map()
  for(let i=0;i<count;i++){
    if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid Excel workbook contents.')
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),expanded=view.getUint32(offset+24,true),nameLen=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),location=view.getUint32(offset+42,true)
    if(flags&1||expanded>15*1024*1024||size>MAX_BYTES)throw new Error('Encrypted or oversized workbook files are not supported.')
    const name=decoder.decode(bytes.slice(offset+46,offset+46+nameLen));offset+=46+nameLen+extra+comment
    if(/^xl\/worksheets\/sheet[12]\.xml$/.test(name)||name==='xl/sharedStrings.xml'||name==='xl/workbook.xml'){
      if(location+30>bytes.length||view.getUint32(location,true)!==0x04034b50)throw new Error('Invalid Excel ZIP item.')
      const dataStart=location+30+view.getUint16(location+26,true)+view.getUint16(location+28,true)
      if(dataStart+size>bytes.length)throw new Error('Invalid ZIP item length.')
      const decoded=await decompress(bytes.slice(dataStart,dataStart+size),method)
      accumulated+=decoded.length;if(decoded.length!==expanded||accumulated>20*1024*1024)throw new Error('Workbook expanded beyond the safe limit.')
      out.set(name,decoder.decode(decoded))
    }
  }
  return out
}
const xmlDoc=xml=>{
  if(typeof DOMParser==='undefined')throw new Error('Excel parsing requires a modern browser.')
  const doc=new DOMParser().parseFromString(xml,'application/xml')
  if(doc.querySelector('parsererror'))throw new Error('The Excel worksheet is malformed.')
  return doc
}
const byTag=(node,name)=>[...node.getElementsByTagNameNS('*',name)]
const excelDate=serial=>{const stamp=Date.UTC(1899,11,30)+Number(serial)*86400000;return Number.isFinite(stamp)?new Date(stamp).toISOString().slice(0,10):''}
export const readInventoryFile=async (file,{ mode = 'legacy' }={})=>{
  const requestedMode=mode
  if(mode==='import' && !/\.xlsx$/i.test(file.name))throw new Error('Upload an .xlsx file downloaded from CARAIT Inventory Excel Tools.')
  if(file.size>MAX_BYTES)throw new Error('Maximum spreadsheet size is 6 MB.')
  let grid
  if(/\.csv$/i.test(file.name))grid=toCSV(await file.text())
  else if(/\.xlsx$/i.test(file.name)){
    const zip=await readZip(new Uint8Array(await file.arrayBuffer()))
    if(mode==='import'){
      const book=xmlDoc(zip.get('xl/workbook.xml')||'<workbook/>')
      const names=byTag(book,'sheet').map(el=>el.getAttribute('name'))
      if(names.length!==1||names[0]!=='Inventory') throw new Error('Use a one-sheet CARAIT Inventory workbook. Old two-sheet opening batch templates cannot be uploaded.')
    }
    const sheet=zip.get('xl/worksheets/sheet1.xml');if(!sheet)throw new Error('The Excel file needs an Inventory sheet as the first worksheet.')
    const shared=zip.has('xl/sharedStrings.xml')?byTag(xmlDoc(zip.get('xl/sharedStrings.xml')),'si').map(si=>byTag(si,'t').map(x=>x.textContent).join('')):[]
    const doc=xmlDoc(sheet)
    grid=byTag(doc,'row').slice(0,MAX_ROWS+2).map(row=>{
      const out=[];for(const c of [...row.children].filter(node=>node.localName==='c')){
        const column=colIndex(c.getAttribute('r'))
        if(column<0||column>40)continue
        const kind=c.getAttribute('t')
        const v=byTag(c,'v')[0]?.textContent
        const inline=byTag(c,'is')[0]
        const txt=kind==='s'?shared[Number(v)]??'':kind==='inlineStr'?byTag(inline,'t').map(x=>x.textContent).join(''):v??''
        out[column]=txt
      }
      // Preserve original Excel line numbers even if the user left blank rows.
      out._excelRow=Number(row.getAttribute('r'))||null
      return out
    })
  }else throw new Error('Choose an .xlsx or .csv spreadsheet.')
  const records=grid.map((cells,i)=>({cells,excelRow:cells._excelRow||i+1}))
    .filter(({cells})=>cells.some(value=>String(value??'').trim()))
  const [head,...body]=records
  const headers=(head?.cells||[]).map(value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' '))
  // Upload File accepts only our one-sheet new-item template or an editable
  // export. Read-only reports, receipt templates and old two-sheet files fail.
  if(mode==='import') {
    const same = expected => headers.length===expected.length && expected.every(h=>headers.includes(h.toLowerCase()))
    if(same(INVENTORY_NEW_ITEM_HEADERS)) mode='new'
    else if(same(INVENTORY_BULK_EDIT_HEADERS)) mode='edit'
    else throw new Error('This file is not an Import template or editable Export. Download a fresh template or use Export Editable Excel. Inventory reports cannot be uploaded.')
  }
  const expectedHeaders = mode==='new' ? INVENTORY_NEW_ITEM_HEADERS : mode==='create' ? INVENTORY_CREATE_HEADERS : mode==='edit' ? INVENTORY_BULK_EDIT_HEADERS : mode==='receive' ? INVENTORY_RECEIVE_HEADERS : INVENTORY_HEADERS
  const required = expectedHeaders.map(label=>label.toLowerCase())
  if(required.some(key=>!headers.includes(key)))throw new Error(`Missing columns: ${required.filter(key=>!headers.includes(key)).join(', ')}. Download the matching CARAIT template.`)
  if(headers.some((h,i)=>h && headers.indexOf(h)!==i))throw new Error('Duplicate Excel column headers found. Use exactly one column for each field.')
  if(mode !== 'legacy') {
    const unexpected = headers.filter(h=>h && !required.includes(h))
    if(unexpected.length) throw new Error(`Unexpected columns: ${unexpected.join(', ')}. Download the matching CARAIT Excel template.`)
  }
  if(body.length>MAX_ROWS)throw new Error('Maximum 2,000 items per spreadsheet.')
  const outputHeaders=mode==='legacy'?INVENTORY_BULK_EDIT_HEADERS:expectedHeaders
  const rows=body.map(({cells,excelRow})=>Object.fromEntries(outputHeaders.map(header=>{
    const idx=headers.indexOf(header.toLowerCase());let value=idx<0?'':String(cells[idx]??'').trim()
    if(header==='Expiration Date'&&/^\d{5}(?:\.\d+)?$/.test(value))value=excelDate(value)
    return [header,value]
  }).concat([['_excelRow',excelRow]])))
  return requestedMode==='import' ? {mode,rows} : rows
}
export const readInventoryImportFile = file => readInventoryFile(file,{mode:'import'})
export const asInventoryRow = (item,rooms,kind='view')=>{
  const room=rooms.find(x=>Number(x.id)===Number(item.default_location_id))
  const expiry=(item.batches||[]).filter(x=>Number(x.quantity)>0&&x.expiration_date).map(x=>String(x.expiration_date).slice(0,10)).sort()[0]||''
  const values=[item.name||'',Number(item.selling_price??item.price??0)||'', '',Number(item.stock??0),kind==='edit'?'':expiry,item.category==='derma'?'Dermatology':'General Medicine',room?.name||'',Number(item.threshold??5),item.supplier||'JAS']
  return kind==='edit'?[...values,item.id,item.barcode||'']:values
}





// Existing-item metadata template deliberately excludes quantity, category, location,
// batch data and opening balances. Original values support stale-export detection.
export const asInventoryBulkEditRow = (item) => [
  item.id, item.barcode || '', item.name || '', Number(item.selling_price ?? item.price ?? 0), '',
  Number(item.threshold ?? 0), '',
]




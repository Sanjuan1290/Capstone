// Minimal dependency-free XLSX reader/writer for small, flat CARAIT inventory sheets.
// Supports OOXML shared/inline strings, numeric/date cells, and CSV from Excel.
// Does not execute formulas, macros or hyperlinks. Limits size and rows before parsing.
export const INVENTORY_HEADERS = ['Item Name', 'Selling Price', 'Initial Stock', 'Quantity', 'Expiration Date', 'Category', 'Stock Room', 'Low Stock Alert', 'Supplier', 'Item ID', 'Barcode']
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
const worksheetXml=(headers,rows)=>{
  const all=[headers,...rows];const body=all.map((row,ri)=>`<row r="${ri+1}">${headers.map((_,ci)=>{
    const v=row[ci];if(v===null||v===undefined||v==='')return ''
    const ref=`${columnCode(ci)}${ri+1}`
    return typeof v==='number'&&Number.isFinite(v)?`<c r="${ref}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`
  }).join('')}</row>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:K${all.length}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="11" width="19" customWidth="1"/></cols><sheetData>${body}</sheetData><autoFilter ref="A1:K${all.length}"/></worksheet>`
}
export const makeInventoryXlsx = (rows=[]) => {
  if(rows.length>MAX_ROWS)throw new Error('Too many inventory rows for one workbook.')
  const entries=[
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml',worksheetXml(INVENTORY_HEADERS,rows)],
  ]
  return new Blob([zipStored(entries)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
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
const decompress=async(bytes,method)=>{
  if(method===0)return bytes
  if(method!==8)throw new Error('Unsupported workbook ZIP compression.')
  if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot open compressed Excel files. Use an updated Chrome, Edge or Firefox browser.')
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
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
    if(name==='xl/worksheets/sheet1.xml'||name==='xl/sharedStrings.xml'){
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
export const readInventoryFile=async file=>{
  if(file.size>MAX_BYTES)throw new Error('Maximum spreadsheet size is 6 MB.')
  let grid
  if(/\.csv$/i.test(file.name))grid=toCSV(await file.text())
  else if(/\.xlsx$/i.test(file.name)){
    const zip=await readZip(new Uint8Array(await file.arrayBuffer()))
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
      return out
    })
  }else throw new Error('Choose an .xlsx or .csv spreadsheet.')
  const [head,...body]=grid.filter(row=>row.some(value=>String(value??'').trim()))
  const headers=(head||[]).map(value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' '))
  const required=['item name','selling price','initial stock','quantity','expiration date','category','stock room','low stock alert']
  if(required.some(key=>!headers.includes(key)))throw new Error(`Missing columns: ${required.filter(key=>!headers.includes(key)).join(', ')}. Download the CARAIT template.`)
  if(body.length>MAX_ROWS)throw new Error('Maximum 2,000 items per spreadsheet.')
  return body.map((cells,i)=>Object.fromEntries(INVENTORY_HEADERS.map(header=>{
    const idx=headers.indexOf(header.toLowerCase());let value=idx<0?'':String(cells[idx]??'').trim()
    if(header==='Expiration Date'&&/^\d{5}(?:\.\d+)?$/.test(value))value=excelDate(value)
    return [header,value]
  }).concat([['_excelRow',i+2]])))
}
export const asInventoryRow = (item,rooms,kind='view')=>{
  const room=rooms.find(x=>Number(x.id)===Number(item.default_location_id))
  const expiry=(item.batches||[]).filter(x=>Number(x.quantity)>0&&x.expiration_date).map(x=>String(x.expiration_date).slice(0,10)).sort()[0]||''
  return [item.name||'',Number(item.selling_price??item.price??0)||'',kind==='edit'?'': '',Number(item.stock??0),kind==='edit'?'':expiry,item.category==='derma'?'Dermatology':'General Medicine',room?.name||'',Number(item.threshold??5),item.supplier||'JAS',kind==='edit'?item.id:'',kind==='edit'?(item.barcode||''):'']
}

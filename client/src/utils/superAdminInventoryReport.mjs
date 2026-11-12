// Dependency-free, read-only OOXML workbook for Super Admin / All Inventory.
// Uses the clinic's existing ZIP writer. Does not contain inventory import fields.
import {zipStored} from './inventoryExcel.mjs'

const XML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const escapeXml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const column = index => {let n=index+1, result=''; while(n){n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26)}return result}
const money = amount => Math.round((Number(amount)||0)*100)/100
const numeric = amount => Number.isFinite(Number(amount)) ? Number(amount) : 0
const datePart = value => {
  if(!value)return ''
  if(value instanceof Date)return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0,10)
  return String(value).slice(0,10)
}
const excelDate = value => {
  const str=datePart(value)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(str))return null
  const ms=Date.parse(str+'T00:00:00Z')
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10)===str ? (ms-Date.UTC(1899,11,30))/86400000 : null
}
const phTime = date => new Intl.DateTimeFormat('en-PH', {
  timeZone:'Asia/Manila', year:'numeric', month:'short', day:'numeric',
  hour:'numeric', minute:'2-digit', hour12:true,
}).format(date)
const labelCategory = raw => raw==='derma'?'Dermatology':raw==='medical'?'General Medicine':String(raw||'Not recorded')
const labelType = raw => raw==='supplies'?'Supplies':raw==='medicine'?'Medicine':String(raw||'Not recorded')
const status = obj => {
  const words=[]
  if(obj.out)words.push('Out of stock')
  else if(obj.low)words.push('Low stock')
  if(obj.expired)words.push('Expired')
  else if(obj.expiring)words.push('Expiring soon')
  return words.join('; ')||'In stock'
}
const FILTER_STATUS = {in_stock:'In stock',low:'Low stock',out:'Out of stock',expired:'Expired',expiring:'Expiring soon',alerts:'All alerts'}
const SORT_LABEL = {name:'Product name',quantity:'Stock quantity',selling_value:'Selling value',expiry:'Nearest expiry'}

// Style numbers are shared by both sheets.
const STYLE={normal:0,title:1,subtitle:2,section:3,header:4,text:5,zebra:6,currency:7,currencyAlt:8,number:9,numberAlt:10,date:11,dateAlt:12,low:13,out:14,ok:15,kpiLabel:16,kpiNumber:17,kpiMoney:18,note:19,branchTitle:20}
const colors = {navy:'FF10243A',teal:'FF0F766E',tealLight:'FFE6F5F2',white:'FFFFFFFF',slate:'FF334155',muted:'FF64748B',stripe:'FFF6F9FC',line:'FFE0E7EF',amber:'FFFFE7B0',red:'FFFFDBDD',green:'FFDEF5E9',darkGreen:'FF176A4C'}
const fontXml = (size,color,bold=false) => `<font>${bold?'<b/>':''}<sz val="${size}"/><color rgb="${color}"/><name val="Aptos"/></font>`
const fillXml = color => `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`
const formatXml = (font,fill,border=0,numFmt=0,align='left',wrap=false) => `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="${border?1:0}" applyNumberFormat="${numFmt>=164?1:0}" applyAlignment="1"><alignment horizontal="${align}" vertical="center"${wrap?' wrapText="1"':''}/></xf>`
const stylesXml = () => {
  const fonts=[fontXml(11,colors.slate),fontXml(19,colors.white,true),fontXml(10,colors.muted),fontXml(11,colors.white,true),fontXml(12,colors.teal,true),fontXml(21,colors.navy,true),fontXml(11,colors.darkGreen,true),fontXml(10,colors.slate,true)]
  const fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>',...['navy','teal','tealLight','stripe','amber','red','green','white'].map(k=>fillXml(colors[k]))]
  // fill indexes: 0 none,1 gray125,2 navy,3 teal,4 tealLight,5 stripe,6 amber,7 red,8 green,9 white
  const xfs=[
    formatXml(0,9),formatXml(1,2),formatXml(2,9),formatXml(3,3),formatXml(4,4,1),
    formatXml(0,9,1),formatXml(0,5,1),formatXml(0,9,1,164,'right'),formatXml(0,5,1,164,'right'),
    formatXml(0,9,1,165,'right'),formatXml(0,5,1,165,'right'),
    formatXml(0,9,1,166),formatXml(0,5,1,166),
    formatXml(7,6,1),formatXml(7,7,1),formatXml(6,8,1),
    formatXml(2,4),formatXml(5,9,1,165,'center'),formatXml(5,9,1,164,'center'),
    formatXml(2,4,1,0,'left',true),formatXml(6,4,1),
  ]
  const dxfs=`<dxfs count="2"><dxf><font><color rgb="FF9A3412"/></font><fill><patternFill patternType="solid"><fgColor rgb="${colors.amber}"/></patternFill></fill></dxf><dxf><font><color rgb="FFB91C1C"/></font><fill><patternFill patternType="solid"><fgColor rgb="${colors.red}"/></patternFill></fill></dxf></dxfs>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${XML}"><numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;₱&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="dd mmm yyyy"/></numFmts><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="${colors.line}"/></top><bottom style="thin"><color rgb="${colors.line}"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>${dxfs}</styleSheet>`
}
const cell = (value,style=STYLE.text,col=0,row=1) => {
  if(value===undefined||value===null||value==='')return ''
  const reference=`${column(col)}${row}`
  if(typeof value==='number'&&Number.isFinite(value))return `<c r="${reference}" s="${style}"><v>${value}</v></c>`
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}
const rowXml = (r,columns,{height=21}={}) => `<row r="${r}" ht="${height}" customHeight="1">${columns.map((item,index)=>{
  const [value,style]=Array.isArray(item)?item:[item,STYLE.text]
  return cell(value,style,index,r)
}).join('')}</row>`
const conditionalStatus = (col,start,end) => end<start?'':`<conditionalFormatting sqref="${col}${start}:${col}${end}"><cfRule type="expression" dxfId="1" priority="1"><formula>OR(ISNUMBER(SEARCH("Out of stock",${col}${start})),ISNUMBER(SEARCH("Expired",${col}${start})))</formula></cfRule><cfRule type="expression" dxfId="0" priority="2"><formula>OR(ISNUMBER(SEARCH("Low stock",${col}${start})),ISNUMBER(SEARCH("Expiring",${col}${start})))</formula></cfRule></conditionalFormatting>`
const sheetXml = ({name,columns,rows,merges=[],headerRow,filterRange,freeze,statusColumn,tabColor}) => {
  const maxRow=Math.max(1,...rows.map(r=>r.r))
  const attrs=columns.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('')
  const body=rows.map(({r,cells,height})=>rowXml(r,cells,{height})).join('')
  const merged=merges.length?`<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:''
  const frozen=freeze?`<pane ySplit="${freeze}" topLeftCell="A${freeze+1}" activePane="bottomLeft" state="frozen"/>`:''
  const filters=filterRange?`<autoFilter ref="${filterRange}"/>`:''
  const statusFormats=statusColumn?conditionalStatus(statusColumn,headerRow+1,maxRow):''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${XML}"><sheetPr><tabColor rgb="${tabColor||colors.teal}"/></sheetPr><dimension ref="A1:${column(columns.length-1)}${maxRow}"/><sheetViews><sheetView workbookViewId="0" zoomScale="90">${frozen}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${attrs}</cols><sheetData>${body}</sheetData>${filters}${merged}${statusFormats}<pageMargins left="0.3" right="0.3" top="0.6" bottom="0.6" header="0.2" footer="0.2"/></worksheet>`
}
const reportTitle=(title,sub,cols)=>[
  {r:1,cells:[[title,STYLE.title]],height:38},
  {r:2,cells:[[sub,STYLE.subtitle]],height:25},
  {r:4,cells:[["REPORT DATA · READ ONLY",STYLE.note]],height:25},
]
const asValue = (val,currency=false,alt=false) => [val, currency?(alt?STYLE.currencyAlt:STYLE.currency):(alt?STYLE.numberAlt:STYLE.number)]
const reportDetails = (report,{filters={},generatedAt=new Date()}={}) => {
  const summary=report.summary||{},comparison=Array.isArray(report.comparison)?report.comparison:[]
  const items=Array.isArray(report.rows)?report.rows:[]
  const scope=(report.branches||[]).map(branch=>branch.name).join(', ')||'No matching branches'
  const sub=`Generated: ${phTime(generatedAt)} (Philippine time)  ·  Scope: ${scope}`
  const filterNote=`Search: ${filters.search||'All items'}  |  Status: ${FILTER_STATUS[filters.status]||'All statuses'}  |  Sort: ${SORT_LABEL[filters.sort]||'Product name'}`
  const summaryRows=[
    ...reportTitle('CARAIT CLINIC  /  ALL INVENTORY',sub,8),
    {r:5,cells:[['Scope',STYLE.branchTitle],[scope,STYLE.text]],height:24},
    {r:6,cells:[['Filters',STYLE.branchTitle],[filterNote,STYLE.text]],height:24},
    {r:8,cells:[['INVENTORY ITEMS',STYLE.kpiLabel],null,['TOTAL SELLING VALUE',STYLE.kpiLabel],null,['LOW STOCK RECORDS',STYLE.kpiLabel],null,['OUT OF STOCK RECORDS',STYLE.kpiLabel]],height:25},
    {r:9,cells:[asValue(numeric(summary.total_items ?? summary.total_products)),null,asValue(money(summary.total_selling_value),true),null,asValue(numeric(summary.low_stock)),null,asValue(numeric(summary.out_of_stock))].map(c=>c?[c[0],c[1]===STYLE.currency?STYLE.kpiMoney:STYLE.kpiNumber]:null),height:37},
    {r:11,cells:[['Each row is one branch inventory record. Values are on-hand quantity × Selling Price, not revenue or profit.',STYLE.note]],height:28},
    {r:13,cells:[['BRANCH INVENTORY SUMMARY',STYLE.section]],height:27},
    {r:14,cells:['Clinic Branch','Inventory Items','Low Stock','Out of Stock','Expiring Soon','Expired','Selling Value (PHP)','Attention'].map(v=>[v,STYLE.header]),height:33},
  ]
  comparison.forEach((b,i)=>{
    const alternate=i%2===1
    const flagged=Number(b.low_stock)+Number(b.out_of_stock)+Number(b.expiring)+Number(b.expired)>0
    summaryRows.push({r:15+i,cells:[
      [b.branch_name,alternate?STYLE.zebra:STYLE.text],asValue(b.item_count,false,alternate),asValue(b.low_stock,false,alternate),asValue(b.out_of_stock,false,alternate),asValue(b.expiring,false,alternate),asValue(b.expired,false,alternate),asValue(money(b.selling_value),true,alternate),[flagged?'Check alerts':'Healthy',flagged?STYLE.low:STYLE.ok]
    ],height:24})
  })
  const summarySheet={name:'Inventory Summary',tabColor:colors.navy,columns:[36,22,26,22,22,18,27,22],
    rows:summaryRows,merges:['A1:H1','A2:H2','B5:H5','B6:H6','A11:H11','A13:H13','A8:B8','C8:D8','E8:F8','G8:H8','A9:B9','C9:D9','E9:F9','G9:H9'],
    headerRow:14,filterRange:comparison.length?`A14:H${14+comparison.length}`:null,statusColumn:'H'}

  // No name-based grouping. Record IDs and barcodes remain independent by branch.
  const headings=['Clinic Branch','Product Name','Barcode','Inventory ID','Category','Type','Stock Quantity','Stock Unit','Selling Price (PHP)','Selling Unit','Total Selling Value (PHP)','Low Stock Alert','Stock Status','Nearest Expiry']
  const detailRows=[...reportTitle('INVENTORY BY BRANCH',sub,14),{r:5,cells:headings.map(value=>[value,STYLE.header]),height:38}]
  items.forEach((item,index)=>{
    const alternate=index%2===1
    const expiry=excelDate(item.nearest_expiry)
    const state=status(item)
    const stateStyle=state.includes('Out of stock')||state.includes('Expired')?STYLE.out:state.includes('Low stock')||state.includes('Expiring')?STYLE.low:STYLE.ok
    detailRows.push({r:index+6,cells:[
      [item.branch_name||'',alternate?STYLE.zebra:STYLE.text],
      [item.name||'',alternate?STYLE.zebra:STYLE.text],
      [item.barcode||'',alternate?STYLE.zebra:STYLE.text],
      asValue(numeric(item.id),false,alternate),
      [labelCategory(item.category),alternate?STYLE.zebra:STYLE.text],
      [labelType(item.item_type),alternate?STYLE.zebra:STYLE.text],
      asValue(numeric(item.quantity_base),false,alternate),
      [item.base_unit||'unit',alternate?STYLE.zebra:STYLE.text],
      item.selling_price==null?['Not set',alternate?STYLE.zebra:STYLE.text]:asValue(numeric(item.selling_price),true,alternate),
      [item.uom||item.unit||'item',alternate?STYLE.zebra:STYLE.text],
      asValue(money(item.selling_value),true,alternate),
      asValue(numeric(item.threshold),false,alternate),
      [state,stateStyle],
      expiry==null?'':[expiry,alternate?STYLE.dateAlt:STYLE.date],
    ],height:24})
  })
  const detailSheet={name:'Inventory by Branch',tabColor:colors.teal,
    columns:[36,43,26,16,20,17,20,16,25,18,28,22,27,21],
    rows:detailRows,merges:['A1:N1','A2:N2','A4:N4'],headerRow:5,freeze:5,statusColumn:'M',
    filterRange:`A5:N${Math.max(5,5+items.length)}`}
  return [summarySheet,detailSheet]
}

export function makeSuperAdminInventoryReport(report,options={}) {
  if(!report||!Array.isArray(report.rows))throw new Error('Inventory export data is unavailable.')
  if(report.rows.length>15000)throw new Error('This inventory export is too large. Narrow the filters.')
  const sheets=reportDetails(report,options)
  const names=sheets.map(s=>s.name)
  const overrides=sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const references=sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')
  const entries=[
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`],
    ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${XML}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((name,i)=>`<sheet name="${escapeXml(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${references}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',stylesXml()],
    ...sheets.map((sheet,i)=>[`xl/worksheets/sheet${i+1}.xml`,sheetXml(sheet)])
  ]
  return new Blob([zipStored(entries)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}

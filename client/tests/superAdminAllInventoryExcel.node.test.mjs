import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {makeSuperAdminInventoryReport} from '../src/utils/superAdminInventoryReport.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const page=readFileSync(path.join(root,'client/src/pages/superAdminPage/AllInventory.jsx'),'utf8')
const route=readFileSync(path.join(root,'server/routers/branchAllInventory.js'),'utf8')
const sample={
  rows:[
    {id:101,branch_id:1,branch_name:'Laguna',name:'Dermatology Wash',barcode:'LAG-D001',category:'derma',item_type:'medicine',quantity_base:10,base_unit:'unit',stock:10,selling_price:650,unit:'unit',selling_value:6500,threshold:5,low:false,out:false,expired:false,expiring:true,nearest_expiry:'2026-11-20'},
    {id:102,branch_id:2,branch_name:'Tagaytay',name:'Dermatology Wash',barcode:'TAG-D009',category:'derma',item_type:'medicine',quantity_base:10,base_unit:'unit',stock:10,selling_price:700,unit:'unit',selling_value:7000,threshold:12,low:true,out:false,expired:false,expiring:false,nearest_expiry:'2027-03-20'},
    {id:103,branch_id:2,branch_name:'Tagaytay',name:'Dermatology Wash',barcode:'TAG-D010',category:'derma',item_type:'medicine',quantity_base:3,base_unit:'unit',stock:3,selling_price:500,unit:'unit',selling_value:1500,threshold:4,low:true,out:false,expired:false,expiring:false,nearest_expiry:null},
  ],
  branches:[{id:1,name:'Laguna'},{id:2,name:'Tagaytay'}],
  summary:{total_items:3,total_products:3,total_selling_value:15000,low_stock:2,out_of_stock:0},
  comparison:[{branch_name:'Laguna',item_count:1,low_stock:0,out_of_stock:0,expiring:1,expired:0,selling_value:6500},{branch_name:'Tagaytay',item_count:2,low_stock:2,out_of_stock:0,expiring:0,expired:0,selling_value:8500}]
}

const workbook=async()=>Buffer.from(await makeSuperAdminInventoryReport(sample,{filters:{search:'',sort:'name'},generatedAt:new Date('2026-11-12T05:00:00Z')}).arrayBuffer())
test('page calls all matching rows export endpoint with busy and error states',()=>{
  assert.match(page,/\/inventory\/all\/export\?/)
  assert.match(page,/page: undefined, limit: undefined/)
  assert.match(page,/Export Excel \(\.xlsx\)/)
  assert.match(page,/setExportBusy/)
  assert.match(page,/setExportError/)
  assert.doesNotMatch(page,/exportCurrentPage|Export CSV/)
  assert.match(route,/router\.get\('\/inventory\/all\/export',requireSuper/)
})
test('xlsx has two styled sheets with separate branch items, numeric money and real dates',async()=>{
  const b=await workbook()
  assert.equal(b.readUInt32LE(0),0x04034b50)
  const contents=b.toString('utf8')
  for(const title of ['Inventory Summary','Inventory by Branch'])assert.ok(contents.includes(title),title)
  for(const ref of ['xl/styles.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml'])assert.ok(contents.includes(ref),ref)
  assert.match(contents,/formatCode="&quot;₱&quot;#,##0.00"/)
  assert.match(contents,/formatCode="dd mmm yyyy"/)
  assert.match(contents,/autoFilter ref="A5:N8"/)
  assert.match(contents,/ySplit="5"/)
  assert.match(contents,/LAG-D001/)
  assert.match(contents,/TAG-D009/)
  assert.match(contents,/TAG-D010/)
  assert.match(contents,/15000/)
  assert.match(contents,/6500/)
  assert.match(contents,/7000/)
  assert.match(contents,/1500/)
  assert.doesNotMatch(contents,/Product Inventory|Branches with Stock|Varies by branch/)
  assert.doesNotMatch(contents,/purchase.cost|unit_cost|cost_value/i)
})
test('workbook supports zero matching products and validates missing data',async()=>{
  const empty=await makeSuperAdminInventoryReport({rows:[],branches:[],summary:{},comparison:[]}).arrayBuffer()
  assert.ok(empty.byteLength>1000)
  assert.throws(()=>makeSuperAdminInventoryReport({}),/unavailable/)
})

const unzipStored = bytes => {
 const files=new Map();let offset=0
 while(bytes.readUInt32LE(offset)===0x04034b50){
  assert.equal(bytes.readUInt16LE(offset+8),0)
  const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28)
  const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8'),start=offset+30+nameLength+extraLength
  files.set(name,bytes.subarray(start,start+size).toString('utf8'));offset=start+size
 }
 assert.equal(bytes.readUInt32LE(offset),0x02014b50)
 return files
}

test('Excel parts follow the OOXML sequence for filters, merged cells and differential styles',async()=>{
 const parts=unzipStored(await workbook())
 const styles=parts.get('xl/styles.xml')
 assert.ok(styles.indexOf('<cellStyles ')<styles.indexOf('<dxfs '),'cellStyles must precede differential formats')
 for(const name of ['xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml']){
  const sheet=parts.get(name)
  assert.ok(sheet.indexOf('<autoFilter ')<sheet.indexOf('<mergeCells '),name)
  assert.ok(sheet.indexOf('<mergeCells ')<sheet.indexOf('<conditionalFormatting '),name)
  assert.ok(sheet.indexOf('<conditionalFormatting ')<sheet.indexOf('<pageMargins '),name)
 }
 assert.match(parts.get('xl/workbook.xml'),/<bookViews><workbookView\/><\/bookViews>/)
})

test('export preserves literal barcodes and escapes copied item text without invalid XML characters',async()=>{
 const report={...sample,rows:[{...sample.rows[0],name:'A & B\u0001 <test>',barcode:'00123456'}]}
 const parts=unzipStored(Buffer.from(await makeSuperAdminInventoryReport(report).arrayBuffer()))
 const sheet=parts.get('xl/worksheets/sheet2.xml')
 assert.match(sheet,/A &amp; B &lt;test&gt;/)
 assert.doesNotMatch(sheet,/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
 assert.match(sheet,/<c r="C6"[^>]+t="inlineStr"><is><t xml:space="preserve">00123456<\/t>/)
 assert.match(sheet,/<c r="I6"[^>]*><v>650<\/v>/)
})

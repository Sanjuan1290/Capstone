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

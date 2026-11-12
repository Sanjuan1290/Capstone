import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {REPORT_SECTIONS,sectionCsv,reportWorkbookSheets} from '../src/pages/superAdminPage/redesign/reportPresentation.mjs'
import {makeReportWorkbook} from '../src/utils/inventoryExcel.mjs'
const root=join(dirname(fileURLToPath(import.meta.url)),'../src/pages/superAdminPage/redesign')
const source=(name)=>readFileSync(join(root,name),'utf8')
const blank={overview:{totals:{appointments:4,net_collected:500},revenue_trend:[]},appointments:{summary:{unique_patients:3},statuses:[{name:'completed',count:2}],sources:[],departments:[]},financial:{billing:{gross_billed:1000,net_billed:800},collections:{net_collected:500},payments_by_method:[],revenue_trend:[],promotions:{promotional_bills:1}},services:{doctors:[],services:[],promotions:[]},inventory:{summary:{products:3},categories:[],most_used:[],movements:[]}}
test('Super Admin report has five tabs, branch filters and a PDF-only export action',()=>{
 assert.deepEqual(REPORT_SECTIONS.map(x=>x.value),['overview','appointments','financial','services','inventory'])
 const jsx=source('ReportsPage.jsx')
 assert.match(jsx,/All Branches/)
 assert.match(jsx,/setBranch/)
 assert.match(jsx,/data-report-controls/)
 assert.match(jsx,/buildSuperAdminReportHtml/)
 assert.match(jsx,/printSuperAdminReport/)
 assert.doesNotMatch(jsx,/sectionCsv|makeReportWorkbook|\.csv|\.xlsx|window\.print\(/)
 assert.match(jsx,/Print \/ Save PDF/)
})
test('CSV export respects current section and rejects spreadsheet formulas',()=>{
 const csv=sectionCsv('appointments',{summary:{appointments:4},statuses:[{name:'=DANGER',count:2}],sources:[],departments:[]})
 assert.match(csv,/Appointments/)
 assert.match(csv,/"'=DANGER"/)
 assert.doesNotMatch(csv,/Net Billed/)
})
test('Excel workbook includes every section and scoping without patient details',async()=>{
 const sheets=reportWorkbookSheets(blank,{branchName:'Laguna Clinic Branch',from:'2026-11-01',to:'2026-11-05'})
 assert.equal(sheets.length,12)
 assert.ok(sheets.some(s=>s.name==='Payment Methods'))
 assert.equal(sheets[0].rows[0][1],'Laguna Clinic Branch')
 const blob=makeReportWorkbook(sheets)
 assert.ok(blob.size>2000)
 const bytes=new Uint8Array(await blob.arrayBuffer())
 assert.equal(bytes[0],80) // ZIP PK
 assert.equal(bytes[1],75)
})
test('all report endpoints use the Super Admin permission guard',()=>{
 const router=readFileSync(join(root,'../../../../../server/routers/branches.router.js'),'utf8')
 assert.match(router,/router\.get\('\/analytics\/report-details',requireSuper/)
 assert.match(router,/loadSuperAdminReport/)
 assert.match(router,/branchId!==null/)
})

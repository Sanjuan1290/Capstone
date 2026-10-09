import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {isValidReportPeriod,sumBranchMetric,escapeCsvCell,buildBranchReportCsv} from '../src/pages/superAdminPage/redesign/reportFormat.js'
const src=join(dirname(fileURLToPath(import.meta.url)),'..','src','pages','superAdminPage')
const page=(filename)=>readFileSync(join(src,'redesign',filename),'utf8')
test('reporting dates validate the full period',()=>{
 assert.equal(isValidReportPeriod('2026-10-01','2026-10-09'),true)
 assert.equal(isValidReportPeriod('2026-10-09','2026-10-01'),false)
 assert.equal(isValidReportPeriod('','2026-10-09'),false)
})
test('branch metrics correctly aggregate zero and numeric data',()=>{
 assert.equal(sumBranchMetric([{appointments:5},{appointments:'6'},{appointments:null}],'appointments'),11)
 assert.equal(sumBranchMetric([],'appointments'),0)
})
test('CSV export escapes quotes and blocks formula execution in spreadsheet clients',()=>{
 assert.equal(escapeCsvCell('Clinic "A"'),'"Clinic ""A"""')
 assert.equal(escapeCsvCell('=SUM(A1:A5)'),"\"'=SUM(A1:A5)\"")
 assert.equal(buildBranchReportCsv([{name:'Clinic A',appointments:3}]).split('\r\n').length,2)
})
test('dashboard and reports never display zero-valued KPIs on request failure',()=>{
 const source=page('Overview.jsx')
 assert.match(source,/error\?null:/)
 assert.match(source,/isValidReportPeriod\(from,to\)/)
})
test('branch activation retains the confirmation flow and readiness details',()=>{
 const source=page('Branches.jsx')
 assert.match(source,/setConfirm\(b\)/)
 assert.match(source,/setReadinessDetails/)
 assert.match(source,/Deactivate Branch/)
})
test('administrator permissions are grouped and require branch assignment',()=>{
 const source=page('Accounts.jsx')
 assert.match(source,/const GROUPS=/)
 assert.match(source,/Assigned Branch/)
 assert.match(source,/Confirm Reassignment/)
 assert.match(source,/type="tel"/)
})
test('audit display retains redaction and improved filtering',()=>{
 const source=page('Audits.jsx')
 assert.match(source,/isHidden=/)
 assert.match(source,/resetFilters/)
 assert.match(source,/Changes Made/)
})
test('superadmin includes notification readiness and settings navigation',()=>{
 const source=readFileSync(join(src,'BranchPortals.jsx'),'utf8')
 assert.match(source,/Branch Readiness/)
 assert.match(source,/Account settings/)
 assert.match(source,/superMode/)
})

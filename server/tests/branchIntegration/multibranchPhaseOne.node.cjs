const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const vm=require('vm')
const base=path.join(__dirname,'..','..');const read=(name)=>fs.readFileSync(path.join(base,'routers',name),'utf8')
const reports=read('branchReports.js'),audit=read('branchAudit.js'),billing=read('branchOperationalReads.js'),routes=read('branches.router.js')
const load=(source,mocks)=>{const module={exports:{}};vm.runInNewContext(`(function(require,module,exports){${source}\n})`,{})(name=>{if(name in mocks)return mocks[name];throw new Error(`Missing test mock: ${name}`)},module,module.exports);return module.exports}
test('all branch report operational queries use the authorized branch',async()=>{
 const calls=[];const database={query:async(sql,args=[])=>{calls.push([sql,args]);if(sql.includes('SELECT report_footer'))return [[{report_footer:'Test'}]];return [[]]}}
 const mock={ '../db/connect':database,'../utils/reportRange':{resolveReportRange:()=>({startDate:'2026-10-01',endDate:'2026-10-31'})},'../utils/date':{getTodayDateOnly:()=> '2026-10-09',addDaysDateOnly:()=> '2026-11-08'},'../utils/audit':{writeAuditLog:async()=>{}}}
 const {readBranchReport}=load(reports,mock)
 let response=null;await readBranchReport({branchId:41,branch:{name:'Branch 41'},query:{}},{json:data=>{response=data}})
 assert.equal(response.range.start_date,'2026-10-01')
 assert.ok(calls.length>=18)
 for(const [sql,args] of calls){if(sql.includes('SELECT report_footer'))continue;assert.match(sql,/branch_id\s*=?|br\.branch_id|b\.branch_id|il\.branch_id|i\.branch_id|a\.branch_id/);assert.ok(args.includes(41),`Unscoped report query: ${sql.slice(0,85)}`)}
 assert.ok(response.billingSummary);assert.ok(Array.isArray(response.mostUsedMedicines));assert.ok(Array.isArray(response.stockActivity))
})
test('billing settings are registered before dynamic bill id',()=>{
 const db={query:async()=>[[]]};const handler=()=>()=>{}
 const {registerBranchOperationalReads}=load(billing,{'../db/connect':db,'../utils/billing':{getBillingRecordWithItems:async()=>{}},'../utils/supplyTransfers':{groupTransferRows:v=>v}})
 const paths=[];const router={get(path){paths.push(path)}};registerBranchOperationalReads(router,{requireSuper:handler(),branchContext:handler(),requirePermission:handler,allowAnyPermission:handler})
 for(const prefix of ['/my/legacy','/workspace/:branchId/legacy']){assert.ok(paths.indexOf(`${prefix}/billing/payment-settings`)<paths.indexOf(`${prefix}/billing/:id`));assert.ok(paths.indexOf(`${prefix}/billing/reconciliation`)<paths.indexOf(`${prefix}/billing/:id`))}
})
test('branch audit queries require the branch and exclude MFA noise',()=>{
 const {filters}=load(audit,{'../db/connect':{query:async()=>[[]]},'../utils/audit':{sanitizeAuditValue:v=>v,writeAuditLog:async()=>{}},crypto:{randomBytes:()=>Buffer.from('abcd')}})
 const r=filters({branchId:76,query:{start_date:'2026-10-01',area:'billing',search:'test'}})
 assert.ok(r.where.includes('al.branch_id=?'));assert.equal(r.values[0],76)
 assert.ok(r.where.includes("auth.mfa_challenge_sent"));assert.ok(r.values.includes('billing_record'))
})
test('branch legacy reports and audit handlers are registered before catchall',()=>{
 assert.ok(routes.indexOf("require("+"'./branchReports').registerBranchReports")<routes.indexOf("router.all('/my/legacy/*'"))
 assert.ok(routes.indexOf("require("+"'./branchAudit').registerBranchAudit")<routes.indexOf("router.all('/my/legacy/*'"))
})
test('SYSTEM visual label removed but protected flag remains',()=>{
 const src=fs.readFileSync(path.join(base,'..','client','src','pages','adminPage','Admin_SystemSetup.jsx'),'utf8')
 assert.ok(!src.includes('>System</span>'));assert.ok(src.includes('is_system'))
})
test('audit filters align on a labeled responsive grid',()=>{
 const src=fs.readFileSync(path.join(base,'..','client','src','pages','adminPage','Admin_AuditLogs.jsx'),'utf8')
 assert.ok(src.includes('xl:grid-cols-12'));assert.ok(src.includes('Search Activity'));assert.ok(src.includes('setSearchDraft'))
})

test('original inventory read paths are implemented with branch ownership',()=>{
 const src=read('branchOperationalReads.js')
 for(const p of ['/inventory/master-data','/inventory/logs','/inventory/batches/:batchId/history'])assert.ok(src.includes(`reg('${p}'`))
 assert.ok(src.includes('il.branch_id=?'));assert.ok(src.includes('ib.branch_id=?'));assert.ok(src.includes('WHERE ib.id=? AND ib.branch_id=?'))
})

test('audit archiving does not use the old global operation and preserves branch',()=>{
 const src=read('branchAudit.js')
 assert.ok(src.includes('UPDATE audit_logs SET archive_id=?,archived_at=NOW() WHERE branch_id=?'))
 assert.ok(src.includes('writeAuditLog'));assert.ok(!src.includes('DELETE FROM audit_logs'))
})
test('promotions cannot link services or recipients from another branch',()=>{
 const src=read('branchPromotions.js')
 assert.ok(src.includes('FROM billing_service_catalog WHERE branch_id=?'))
 assert.ok(src.includes('FROM clinic_promotions WHERE id=? AND branch_id=?'))
 assert.ok(src.includes('a.patient_id=patient.id AND a.branch_id=?'))
 assert.ok(src.includes('branch_id:req.branchId'))
})

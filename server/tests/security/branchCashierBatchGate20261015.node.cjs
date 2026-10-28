'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const root=path.resolve(__dirname,'../..')
const corrections=fs.readFileSync(path.join(root,'controllers/billingCorrections.controller.js'),'utf8')
const admin=fs.readFileSync(path.join(root,'controllers/admin.controller.js'),'utf8')
const staff=fs.readFileSync(path.join(root,'controllers/staff.controller.js'),'utf8')
const sql=fs.readFileSync(path.join(root,'db/migrations/2026-10-15-cashier-branch-uniqueness.sql'),'utf8')
const helpers=corrections.slice(corrections.indexOf('const computeCashierExpectations ='),corrections.indexOf('const resolveClosingDate ='))
const context=async query=>vm.runInNewContext(`${helpers}\n({computeCashierExpectations,loadClosing,assertCashierOpen})`,{
 db:{query},roundMoney:x=>Math.round(Number(x||0)*100)/100,httpError:(statusCode,message,code)=>Object.assign(new Error(message),{statusCode,code}),getTodayDateOnly:()=> '2026-10-15',Number,Error
})
test('cashier ledger totals restricted to branch bill and refund joins',async()=>{
 const calls=[]
 const {computeCashierExpectations}=await context(async(sql,args)=>{
  calls.push({sql,args});return [[sql.includes('billing_payment_refunds')?{cash_refunds:10}:{transactions:1,cash_received:100,non_cash_received:20}]]
 })
 const result=await computeCashierExpectations({cashierRole:'admin',cashierId:4,date:'2026-10-15',branchId:2})
 assert.equal(result.expected_cash,90);assert.equal(calls.length,2)
 for(const {sql,args} of calls){assert.match(sql,/JOIN billing_records br ON br.id=bp.billing_id/);assert.match(sql,/br.branch_id=\?/);assert.equal(args.at(-1),2)}
})
test('cashier close lookup uses branch owner and transaction row lock',async()=>{
 const calls=[];const {loadClosing}=await context(async(sql,args)=>{calls.push({sql,args});return [[]]})
 await loadClosing({cashierRole:'admin',cashierId:5,date:'2026-10-15',branchId:3},{query:async(sql,args)=>{calls.push({sql,args});return [[]]}},true)
 assert.match(calls[0].sql,/branch_id=\? LIMIT 1 FOR UPDATE/)
 assert.deepEqual(Array.from(calls[0].args),['admin',5,'2026-10-15',3])
})
test('cashier lookup fails closed when branch is missing',async()=>{
 const {assertCashierOpen}=await context(async()=>{throw Error('Should not query')})
 await assert.rejects(()=>assertCashierOpen({cashierRole:'staff',cashierId:6}),e=>e.code==='BRANCH_REQUIRED')
})
test('cashier closing migration rekeys uniqueness rather than deleting data',()=>{
 assert.match(sql,/ADD UNIQUE KEY uniq_cashier_branch_date \(branch_id,cashier_role,staff_id,closing_date\)/)
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM cashier_closings|TRUNCATE/i)
 assert.match(sql,/information_schema\.statistics/)
})
test('batch action rechecks branch under lock and uses branch stockroom',()=>{
 assert.match(admin,/getInventoryBatchForAction\(batchId, conn, true, req.branchId\)/)
 assert.match(admin,/authorization\.branch_id\) !== Number\(batch\.branch_id\)/)
 assert.match(admin,/resolveMainStockroom\(conn, \{ createIfMissing: true, branchId:req.branchId \}\)/)
 assert.match(admin,/il\.branch_id=\? AND ilb\.inventory_id=\?/)
})
test('payment action uses branch-owned cashier and receipts',()=>{
 assert.match(staff,/assertCashierOpen\(\{ cashierRole: actorRole, cashierId: req.user.id,branchId:req.branchId \},conn\)/)
 assert.match(staff,/allocateReceiptNumber\(conn, lockedBill.branch_id\)/)
 assert.match(staff,/SELECT \* FROM billing_records WHERE id = \? AND branch_id = \? LIMIT 1 FOR UPDATE/)
})
test('new cashier migration parses as idempotent guarded SQL statements',()=>{
 const {splitMysqlMigration}=require('../../scripts/branchMigrations')
 const statements=splitMysqlMigration(sql)
 assert.ok(statements.some(x=>x.startsWith('CREATE PROCEDURE carait_cashier_branch_unique')))
 assert.ok(statements.some(x=>x.startsWith('CALL carait_cashier_branch_unique()')))
 assert.ok(statements.some(x=>x.startsWith('DROP PROCEDURE IF EXISTS carait_cashier_branch_unique')))
})

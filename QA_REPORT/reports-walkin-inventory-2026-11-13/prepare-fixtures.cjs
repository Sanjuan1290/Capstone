const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {execFileSync}=require('node:child_process')
process.env.UNIFIED_BILLING_STOCKOUT='1'
const root=path.resolve(__dirname,'../..')
const db={async query(sql,params=[]){return [JSON.parse(execFileSync('python',[path.join(root,'server/tests/helpers/reportSqlFixture.py')],{input:JSON.stringify({sql,params}),encoding:'utf8',windowsHide:true}))]}}
async function main(){
 const {loadSuperAdminReport}=require('../../server/utils/superAdminReports')
 const options={from:'2026-11-01',to:'2026-11-13',branchId:1,now:new Date('2026-11-13T04:00:00Z')},reports={}
 for(const section of ['overview','appointments','financial','services','inventory'])reports[section]=await loadSuperAdminReport(db,{...options,section})
 const module={exports:{}},deps={'../db/connect':db,'../utils/inventoryReportStock':require('../../server/utils/inventoryReportStock'),'../utils/reportRange':{resolveReportRange:()=>({startDate:options.from,endDate:options.to})},'../utils/date':{getTodayDateOnly:()=> '2026-11-13',addDaysDateOnly:()=> '2026-12-13'},'../utils/audit':{writeAuditLog:async()=>{}}}
 vm.runInNewContext(fs.readFileSync(path.join(root,'server/routers/branchReports.js'),'utf8'),{module,require:key=>deps[key],console})
 let branch
 await module.exports.readBranchReport({branchId:1,branch:{name:'Branch 1'},query:{}},{json:value=>{branch=value}})
 const [trends]=await db.query("SELECT appointment_date AS date,COUNT(*) AS appointments,SUM(status='completed') AS completed FROM appointments WHERE branch_id=? AND appointment_date BETWEEN ? AND ? GROUP BY appointment_date ORDER BY appointment_date",[1,options.from,options.to])
 fs.writeFileSync(path.join(__dirname,'report-fixtures.json'),JSON.stringify({reports,branch,trends},null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1})

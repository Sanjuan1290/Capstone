'use strict'
const fs=require('node:fs'),path=require('node:path')
const here=__dirname,previous=path.resolve(here,'../implementation-2026-11-11')
fs.mkdirSync(path.join(here,'browser-artifacts'),{recursive:true})
for(const file of ['run.cjs','disposable-db.cjs','database-schema.cjs','api-smoke.cjs','clinical-workflow.cjs','browser-suite.cjs','playwright.config.mjs','print-check.mjs','inspect-print.py','cleanup-db.cjs']){
 if(fs.existsSync(path.join(here,file)))continue // Preserve case extensions and recorded setup on rerun.
 let source=fs.readFileSync(path.join(previous,file),'utf8').replaceAll('implementation-2026-11-11','conflict-repair-2026-11-11').replaceAll('33409','33411').replaceAll('carait_qa_20261111','carait_merge_qa_20261111')
 if(file==='run.cjs'){
  source=source.replace("const checks={","const checks={\n 'migration-verify':['.',['node','QA_REPORT/conflict-repair-2026-11-11/verify-local-migration.cjs']],\n 'server-syntax':['server',['npm','run','check:syntax']],\n 'server-source':['server',['npm','run','verify:source']],\n 'migration-unit':['server',['node','--test','tests/deployment/migrationRunner.node.cjs']],")
  source=source.replace("['migrate','api-smoke','clinical-workflow']","['migrate','migration-verify','api-smoke','clinical-workflow']")
 }
 if(file==='inspect-print.py')source=source.replace("str(root/'.tools')","str(root/'../implementation-2026-11-11/.tools')")
 fs.writeFileSync(path.join(here,file),source)
}
fs.writeFileSync(path.join(here,'.gitignore'),'browser-artifacts/\n.baseline/\n.tools/\n*.pdf\n')
console.log('Prepared fresh QA outputs and a separate loopback database port/schema. No prior report overwritten.')

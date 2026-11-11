'use strict'
const fs=require('node:fs'),path=require('node:path')
const previous=path.resolve(__dirname,'../review-2026-11-11')
let source=fs.readFileSync(path.join(previous,'run.cjs'),'utf8').replace('Review only:','Isolated validation:')
const targeted="['server',['--test','tests/billing/servicePromotions20261111.node.test.cjs','tests/registrationSmsLimits20261111.node.cjs','tests/doctorConfirmNotifications20261111.node.cjs','tests/billing/consultationLifecycle20261105.node.test.cjs','tests/billing/chargeReversal20261111.node.test.cjs']]"
source=source.replace('const checks={',`const checks={\n 'baseline-targeted':${targeted},\n 'targeted':${targeted},`)
fs.writeFileSync(path.join(__dirname,'run.cjs'),source)
console.log('Prepared isolated checks; earlier QA evidence is unchanged.')

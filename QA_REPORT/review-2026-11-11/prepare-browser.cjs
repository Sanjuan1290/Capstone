'use strict'
const fs=require('node:fs'),path=require('node:path')
const previous=path.resolve(__dirname,'../conflict-repair-2026-11-11')
for(const file of ['browser-suite.cjs','playwright.config.mjs'])fs.writeFileSync(path.join(__dirname,file),fs.readFileSync(path.join(previous,file),'utf8').replaceAll('conflict-repair-2026-11-11','review-2026-11-11'))
fs.writeFileSync(path.join(__dirname,'.gitignore'),'browser-artifacts/\n')
console.log('Prepared isolated browser results for the current review.')

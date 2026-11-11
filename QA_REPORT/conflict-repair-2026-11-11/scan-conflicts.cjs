'use strict'
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..')
const exclusions=['!.git/**','!**/node_modules/**','!**/.baseline/**','!**/.tools/**','!**/dist/**','!**/browser-artifacts/**','!**/.cache/**']
const args=['--hidden','--no-ignore',...exclusions.flatMap(glob=>['--glob',glob])]
const listed=spawnSync('rg',['--files',...args,'.'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024})
assert.equal(listed.status,0)
const markers='^\\s*(<<<<<<<(?:\\s.*)?|=======$|>>>>>>>(?:\\s.*)?|\\|\\|\\|\\|\\|\\|\\|(?:\\s.*)?)$'
const scan=spawnSync('rg',['-n',...args,'-e',markers,'.'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024})
assert.ok([0,1].includes(scan.status),'Repository scan failed')
// Save only paths/line numbers and marker kinds; never arbitrary configuration content.
const findings=scan.stdout.trim().split(/\r?\n/).filter(Boolean).map(line=>{const match=line.match(/^(.*?):(\d+):(.*)$/);assert.ok(match);return {file:match[1],line:Number(match[2]),kind:match[3].trim().slice(0,7)}})
const result={status:findings.length?'FAIL':'PASS',enumeratedFiles:listed.stdout.trim().split(/\r?\n/).length,findings,exclusions,binaryFiles:'Ripgrep skips binary contents; generated dependency/build/cache trees are excluded.',includesHiddenAndIgnoredSource:true}
fs.writeFileSync(path.join(__dirname,'conflict-scan.json'),JSON.stringify(result,null,2))
console.log(JSON.stringify({status:result.status,enumeratedFiles:result.enumeratedFiles,remainingMarkers:findings.length}))
if(findings.length)process.exitCode=1

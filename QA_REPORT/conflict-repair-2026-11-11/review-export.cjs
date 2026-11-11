'use strict'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),provided='C:/Users/Robert/Downloads/AllCodes.txt'
const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});assert.equal(result.status,0);return result.stdout}
const canonical=s=>s.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n*$/,'\n'),sha=s=>crypto.createHash('sha256').update(s).digest('hex')
const targets=['server/scripts/branchMigrations.js','server/utils/chargeAdjustments.js','client/src/components/billing/ChargeAdjustmentsPanel.jsx','server/tests/deployment/migrationRunner.node.cjs']
const changed=new Set(git(['diff','--name-only']).trim().split(/\r?\n/))
const scope=file=>!file.includes('..')&&!file.includes('\\')&&(/^(client|server)\//.test(file)||['package.json','package-lock.json','README.md','.gitignore'].includes(file))&&!/(^|\/)(?:node_modules|dist|coverage|uploads)(\/|$)/.test(file)&&!/(^|\/)\.env(?:\.|$)/.test(file)&&(/\.(?:[cm]?jsx?|tsx?|json|html|css|scss|md|ya?ml|toml|txt|svg|ini|conf|csv)$/.test(file)||/^server\/db\/migrations\/[^/]+\.sql$/.test(file)||/(^|\/)(?:Dockerfile|Procfile|\.nvmrc|\.node-version|\.gitignore|_headers|_redirects|\.npmrc)$/.test(file))
const raw=fs.readFileSync(provided),text=raw.toString('utf8'),headers=[...text.matchAll(/^\/([^\r\n]+):\r?\n-{10,}\r?\n/gm)],files=[]
for(let i=0;i<headers.length;i++){
 const header=headers[i],file=header[1];if(!scope(file))continue
 const lines=[]
 for(const line of text.slice(header.index+header[0].length,headers[i+1]?.index||text.length).split(/\r?\n/)){
  const numbered=line.match(/^\s*(\d+) \| ?(.*)$/);if(!numbered)continue
  assert.equal(Number(numbered[1]),lines.length+1,'Export line numbering must be contiguous');lines.push(numbered[2])
 }
 assert.ok(lines.length)
 const source=canonical(lines.join('\n')),filename=path.resolve(root,file);assert.ok(filename.startsWith(root+path.sep))
 const current=fs.existsSync(filename)?canonical(fs.readFileSync(filename,'utf8')):null
 const original=changed.has(file)?canonical(git(['show','HEAD:'+file])):current
 files.push({file,exportSha256:sha(source),currentSha256:current===null?null:sha(current),matchesPreRepairRepository:source===original,matchesCorrectedRepository:source===current,conflictBlocks:(source.match(/^<<<<<<< /gm)||[]).length,correctedMatchesValidParent:targets.includes(file)&&!file.includes('/tests/')?current===canonical(git(['show','HEAD^1:'+file])):undefined})
}
const mismatches=files.filter(file=>!file.matchesCorrectedRepository),conflicted=files.filter(file=>file.conflictBlocks)
assert.equal(conflicted.reduce((sum,file)=>sum+file.conflictBlocks,0),6)
assert.ok(files.every(file=>file.matchesPreRepairRepository),'Available export must match the pre-repair repository')
assert.deepEqual(mismatches.map(file=>file.file).sort(),targets.slice().sort())
assert.ok(mismatches.filter(file=>!file.file.includes('/tests/')).every(file=>file.correctedMatchesValidParent))
const result={status:'PASS',requestedFile:'AllCodes(20261111-015902).txt',availableFile:provided,exactRequestedFilenameFound:false,availableFileModifiedAt:fs.statSync(provided).mtime.toISOString(),exportSha256:sha(raw),exportedSections:headers.length,comparedApplicationTextFiles:files.length,allMatchPreRepairRepository:true,currentDifferences:mismatches.length,conflictBlocks:6,mergeCommit:git(['rev-parse','HEAD']).trim(),lastValidParent:git(['rev-parse','HEAD^1']).trim(),normalization:'Numbered-line decoding, BOM, CRLF and trailing blank-line normalization only.',files,sourceContentsExecuted:false,suppliedFileChanged:false}
fs.writeFileSync(path.join(__dirname,'export-comparison.json'),JSON.stringify(result,null,2))
console.log(JSON.stringify({status:result.status,comparedApplicationTextFiles:files.length,allMatchPreRepairRepository:true,currentDifferences:4,originalConflictBlocks:6,productionFilesMatchLastValidParent:true}))

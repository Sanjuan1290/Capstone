'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../..')
const requireClient = createRequire(path.join(root, 'client/package.json'))
const parser = requireClient('@babel/parser')
const out = path.join(root, 'QA_REPORT')
const excluded = new Set(['.git','node_modules','dist','build','coverage','evidence','browser-artifacts','test-results','playwright-report','__pycache__','_DELIVERY','_FIX_PACKAGE','BATCH_FREE_DELIVERY','QA_REPORT'])
const extensions = new Set(['.js','.jsx','.mjs','.cjs','.json','.css','.html','.sql','.yml','.yaml','.ps1','.py','.toml','.xml'])
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => {
  if (excluded.has(e.name) || /^\.env/.test(e.name) || /lock\.json$/.test(e.name)) return []
  const full = path.join(dir,e.name)
  return e.isDirectory() ? walk(full) : extensions.has(path.extname(e.name)) ? [full] : []
})
const rel = p => path.relative(root,p).replace(/\\/g,'/')
const files = walk(root).sort()
const tests = files.filter(p => /\/tests?\//.test(rel(p))).map(p => ({file:rel(p),source:fs.readFileSync(p,'utf8')}))
const visit = (node,fn) => {
  if (!node || typeof node !== 'object') return
  if (node.type) fn(node)
  for (const [key,value] of Object.entries(node)) {
    if (['loc','start','end','comments','tokens','extra'].includes(key)) continue
    if (Array.isArray(value)) value.forEach(n=>visit(n,fn))
    else if (value && typeof value === 'object') visit(value,fn)
  }
}
const resolve = (file,spec) => {
  const base=path.resolve(path.dirname(file),spec)
  const manifest=path.join(base,'package.json')
  const main=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest,'utf8')).main:null
  return [base,...['.js','.jsx','.mjs','.cjs','.json','.css','.html'].map(ext=>base+ext),...['index.js','index.jsx'].map(name=>path.join(base,name)),...(main?[path.resolve(base,main)]:[])].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())
}
const inventory=[], sql=[], routes=[], envKeys=new Set(), genericErrors=[]
for (const file of files) {
  const source=fs.readFileSync(file,'utf8'), name=rel(file), ext=path.extname(file)
  const item={file:name,type:ext,lines:source.split(/\r?\n/).length,syntax_status:'NOT TESTED',import_export_status:'NOT TESTED',review_status:'NOT TESTED — complete manual line-by-line review not established; see automated columns',test_status:'NOT TESTED',related_tests:[],problems:[],imports:[],exports:[],functions:[]}
  if (/\.[cm]?jsx?$/.test(ext)) {
    try {
      const ast=parser.parse(source,{sourceType:'unambiguous',plugins:['jsx'],allowReturnOutsideFunction:true})
      const queryArguments=new Set()
      item.syntax_status='PASS'
      visit(ast,node=>{
        if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&['query','execute'].includes(node.callee.property?.name)&&node.arguments[0])queryArguments.add(node.arguments[0].start)
        if (node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'&&node.source) item.imports.push({specifier:node.source.value,line:node.loc.start.line,bindings:node.specifiers.map(s=>({local:s.local?.name,imported:node.type==='ExportNamedDeclaration'?s.local?.name:s.imported?.name||s.imported?.value||s.type}))})
        if(node.type==='CallExpression'&&((node.callee?.name==='require')||node.callee?.type==='Import')&&node.arguments[0]?.type==='StringLiteral') item.imports.push({specifier:node.arguments[0].value,line:node.loc.start.line})
        if(node.type==='ExportNamedDeclaration') {
          if(node.declaration?.id) item.exports.push(node.declaration.id.name)
          for(const d of node.declaration?.declarations||[]) if(d.id?.name)item.exports.push(d.id.name)
          for(const d of node.specifiers||[]) item.exports.push(d.exported?.name)
        }
        if(node.type==='ExportDefaultDeclaration')item.exports.push('default')
        if(/Function/.test(node.type)&&node.body)item.functions.push({name:node.id?.name||'<anonymous>',line:node.loc.start.line})
        if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&['router','app','publicRouter'].includes(node.callee.object?.name)&&['get','post','put','patch','delete','all','use'].includes(node.callee.property?.name)) {
          const arg=node.arguments[0]
          if(['StringLiteral','TemplateLiteral'].includes(arg?.type))routes.push({file:name,line:node.loc.start.line,method:node.callee.property.name.toUpperCase(),path:arg.value??source.slice(arg.start+1,arg.end-1)})
        }
        if(node.type==='StringLiteral'||node.type==='TemplateLiteral') {
          const literal=node.type==='StringLiteral'?node.value:node.quasis.map(q=>q.value.cooked).join(' __DYNAMIC__ ')
          if(/^\s*(SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|REPLACE)\b/i.test(literal||''))sql.push({file:name,line:node.loc.start.line,sql:literal,dynamic:node.type==='TemplateLiteral'&&node.expressions.length>0,queryArgument:queryArguments.has(node.start)})
        }
      })
      for(const imp of item.imports)if(imp.specifier.startsWith('.')) {
        const resolved=resolve(file,imp.specifier)
        if(resolved)imp.resolved=rel(resolved)
        else item.problems.push(`Unresolved relative import at line ${imp.line}: ${imp.specifier}`)
      }
      item.import_export_status=item.problems.length?'FAIL':'PASS — relative dependencies resolved; named exports checked by production build/route checks'
    }catch(error){item.syntax_status='FAIL';item.problems.push(`${error.message}`)}
  }else if(ext==='.json'){
    try{JSON.parse(source);item.syntax_status='PASS';item.review_status='PASS — JSON parsed; manual semantic review pending'}catch(error){item.syntax_status='FAIL';item.problems.push(error.message)}
  }else item.review_status='NOT TESTED — inventoried; manual review pending'
  for(const m of source.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z_0-9]*)/g))envKeys.add(m[1])
  for(const [i,line] of source.split(/\r?\n/).entries())if(/Something went wrong|An error occurred|Request failed|Unable to process request/i.test(line)&&!/\/tests?\//.test(name))genericErrors.push({file:name,line:i+1,text:line.trim().slice(0,350)})
  if(!/\/tests?\//.test(name))item.related_tests=tests.filter(t=>t.source.includes(path.basename(file))||t.source.includes(name.replace(/\.[cm]?jsx?$/,''))).map(t=>t.file)
  inventory.push(item)
}
const graph=new Map(inventory.map(i=>[i.file,i.imports.flatMap(x=>x.resolved?[x.resolved]:[])])), cycles=[],done=new Set(),active=[]
const byFile=new Map(inventory.map(item=>[item.file,item]))
const canonicalCase=file=>{
  let current=root
  for(const part of path.relative(root,path.join(root,file)).split(path.sep)){
    const name=fs.readdirSync(current).find(name=>name.toLowerCase()===part.toLowerCase())
    if(!name)return null
    current=path.join(current,name)
  }
  return rel(current)
}
for(const item of inventory)for(const dependency of item.imports){
  if(!dependency.resolved)continue
  const canonical=canonicalCase(dependency.resolved)
  if(canonical&&canonical!==dependency.resolved)item.problems.push(`Linux case mismatch at line ${dependency.line}: ${dependency.resolved}; actual path ${canonical}`)
  const target=byFile.get(canonical||dependency.resolved)
  if(!target?.exports.length)continue
  for(const binding of dependency.bindings||[]){
    if(binding.imported==='ImportNamespaceSpecifier')continue
    const wanted=binding.imported==='ImportDefaultSpecifier'?'default':binding.imported
    if(wanted&&!target.exports.includes(wanted))item.problems.push(`Missing export at line ${dependency.line}: ${wanted} from ${target.file}`)
  }
  if(item.problems.length)item.import_export_status='FAIL'
}
function dfs(name){if(active.includes(name)){cycles.push([...active.slice(active.indexOf(name)),name]);return}if(done.has(name))return;active.push(name);for(const next of graph.get(name)||[])dfs(next);active.pop();done.add(name)}
for(const name of graph.keys())dfs(name)
const csv=rows=>rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n')+'\n'
fs.mkdirSync(path.join(out,'evidence'),{recursive:true})
fs.writeFileSync(path.join(out,'evidence/source-inventory.json'),JSON.stringify({files:inventory.length,totalLines:inventory.reduce((sum,i)=>sum+i.lines,0),inventory,cycles,envKeys:[...envKeys].sort(),genericErrors,exclusions:[...excluded],limitations:['Automated full-file parsing is not manual line-by-line behavioral review.','Test references are associations, not execution coverage.','SQL literals are candidates; dynamic SQL requires runtime validation.']},null,2))
fs.writeFileSync(path.join(out,'evidence/sql-inventory.json'),JSON.stringify(sql,null,2))
fs.writeFileSync(path.join(out,'evidence/static-routes.json'),JSON.stringify(routes,null,2))
fs.writeFileSync(path.join(out,'SOURCE_FILE_AUDIT.csv'),csv([['file_path','file_type','lines','dependencies','exports','import_export_status','syntax_status','review_status','test_status','related_tests','identified_problems'],...inventory.map(i=>[i.file,i.type,i.lines,i.imports.map(x=>x.specifier).join('; '),i.exports.join('; '),i.import_export_status,i.syntax_status,i.review_status,i.test_status,i.related_tests.join('; '),i.problems.join('; ')])]))
fs.writeFileSync(path.join(out,'STATIC_API_ENDPOINTS.csv'),csv([['file_path','line','method','route_pattern','test_status','authentication','notes'],...routes.filter(r=>r.method!=='USE'&&r.file.startsWith('server/')).map(r=>[r.file,r.line,r.method,r.path,'NOT TESTED','Not established by static discovery','Static declaration; mount prefixes/loops require runtime inventory'])]))
console.log(JSON.stringify({files:inventory.length,lines:inventory.reduce((sum,i)=>sum+i.lines,0),syntaxFailures:inventory.filter(i=>i.syntax_status==='FAIL'),unresolvedImports:inventory.filter(i=>i.problems.length),routeDeclarations:routes.length,sqlLiterals:sql.length,cycles},null,2))

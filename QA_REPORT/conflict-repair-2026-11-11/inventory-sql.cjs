'use strict'
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module')
const root=path.resolve(__dirname,'../..'),parser=createRequire(path.join(root,'client/package.json'))('@babel/parser')
const excluded=new Set(['node_modules','tests','scripts','dist','coverage'])
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{if(excluded.has(entry.name)||entry.isSymbolicLink())return [];const file=path.join(dir,entry.name);return entry.isDirectory()?walk(file):/\.[cm]?js$/.test(file)?[file]:[]})
const visit=(node,fn)=>{if(!node||typeof node!=='object')return;if(node.type)fn(node);for(const [key,value] of Object.entries(node)){if(['loc','start','end','comments','tokens','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(child=>visit(child,fn));else if(value&&typeof value==='object')visit(value,fn)}}
const rows=[];let files=0
for(const file of walk(path.join(root,'server'))){
 const source=fs.readFileSync(file,'utf8'),ast=parser.parse(source,{sourceType:'unambiguous',allowReturnOutsideFunction:true}),queryArguments=new Set();files++
 visit(ast,node=>{
  if(node.type==='CallExpression'&&node.callee?.type==='MemberExpression'&&['query','execute'].includes(node.callee.property?.name)&&node.arguments[0])queryArguments.add(node.arguments[0].start)
  if(!['StringLiteral','TemplateLiteral'].includes(node.type))return
  const sql=node.type==='StringLiteral'?node.value:node.quasis.map(part=>part.value.cooked).join(' __DYNAMIC__ ')
  if(/^\s*(SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|REPLACE)\b/i.test(sql||''))rows.push({file:path.relative(root,file).replaceAll('\\','/'),line:node.loc.start.line,sql,dynamic:node.type==='TemplateLiteral'&&node.expressions.length>0,queryArgument:queryArguments.has(node.start)})
 })
}
fs.writeFileSync(path.join(__dirname,'sql-inventory.json'),JSON.stringify(rows,null,2))
console.log(JSON.stringify({status:'PASS',parsedRuntimeFiles:files,sqlLiterals:rows.length,codeExecuted:false,databaseQueries:0}))

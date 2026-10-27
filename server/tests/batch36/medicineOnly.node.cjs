const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../..')
for(const file of ['routers/branchInventoryItems.js','controllers/admin.controller.js','controllers/staff.controller.js']){
 test(`${file} rejects creation of new non-medicine inventory items`,()=>{
  const src=fs.readFileSync(path.join(root,file),'utf8')
  const add=src.slice(src.indexOf('const addInventoryItem = async')>=0?src.indexOf('const addInventoryItem = async'):src.indexOf('async function createItem'))
  assert.match(add,/MEDICINE_ONLY_CREATION/)
 })
}


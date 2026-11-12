const fs=require('node:fs'),vm=require('node:vm')
function loadActivity(writeAuditLog=async()=>{}){
 const module={exports:{}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../../utils/inventoryActivity'),'utf8'),{module,require:name=>{if(name!=='./audit')throw Error('Unexpected inventory activity dependency '+name);return {writeAuditLog}}})
 return module.exports
}
module.exports={loadActivity}

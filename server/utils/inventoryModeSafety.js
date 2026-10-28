'use strict'
// An old server must NEVER rebuild location balances after cutover, even if
// its environment variables have been lost/rolled back.
async function readInventoryMode(executor){
 const [[available]]=await executor.query(`SELECT COUNT(*) AS n FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inventory_stock_mode'`)
 if(!Number(available?.n||0))return 'batch'
 const [[state]]=await executor.query('SELECT mode FROM inventory_stock_mode WHERE id=1')
 return state?.mode||'batch'
}
async function assertLegacyBatchMode(executor){
 if(process.env.CARAIT_INVENTORY_LOCATION_MODE==='enabled')throw new Error('BATCH_WRITER_DISABLED: location mode is reserved for completed and verified cutover.')
 const mode=await readInventoryMode(executor)
 if(mode!=='batch')throw new Error('LEGACY_BATCH_WRITER_BLOCKED: database is location-canonical; old batch writers and reconcilers are forbidden.')
}
module.exports={readInventoryMode,assertLegacyBatchMode}

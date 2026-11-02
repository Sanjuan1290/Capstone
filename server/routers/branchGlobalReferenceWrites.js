// Deliberately global reference tables. These actions may only be taken by
// Super Admin, even when it is operating from a branch workspace. Branch Admins
// may create branch-owned reasons through a separate, branch-scoped endpoint.
const admin=require('../controllers/admin.controller')
const safe=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
function registerBranchGlobalReferenceWrites(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  const guards=[...middle,requireSuper,requirePermission('system_setup')]
  router.post(`${prefix}/system-setup/uoms`,...guards,safe(admin.saveInventoryUom))
  router.put(`${prefix}/system-setup/uoms/:id`,...guards,safe(admin.saveInventoryUom))
  router.delete(`${prefix}/system-setup/uoms/:id`,...guards,safe(admin.deleteInventoryUom))
  if (prefix !== '/my/legacy') router.post(`${prefix}/system-setup/movement-reasons`,...guards,safe(admin.saveInventoryMovementReason))
  if (prefix !== '/my/legacy') router.put(`${prefix}/system-setup/movement-reasons/:id`,...guards,safe(admin.saveInventoryMovementReason))
 }
}
module.exports={registerBranchGlobalReferenceWrites}


const addons=require('../utils/serviceAddons')
function registerBranchServiceAddons(router,{requireSuper,branchContext,requirePermission}){
 for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
  router.get(`${prefix}/billing/addons`,...middle,requirePermission('system_setup'),addons.list)
  router.post(`${prefix}/billing/addons`,...middle,requirePermission('system_setup'),addons.save)
  router.put(`${prefix}/billing/addons/:addonId`,...middle,requirePermission('system_setup'),addons.save)
  router.get(`${prefix}/billing/:id/addons`,...middle,requirePermission('billing'),addons.options)
  router.post(`${prefix}/billing/:id/addons`,...middle,requirePermission('billing'),addons.confirm)
 }
}
module.exports={registerBranchServiceAddons}

const {branchPin,generateBranchPin,getBranchPinStatus}=require('../utils/queueDisplaySecurity')
const handle=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)
function registerBranchQueueDisplaySecurity(router,{requireSuper,branchContext,requirePermission}){
  for(const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]){
    const guard=[...middle,requirePermission('system_setup')]
    router.get(`${prefix}/queue-display-security`,...guard,handle(getBranchPinStatus))
    router.post(`${prefix}/queue-display-security/generate`,...guard,handle(generateBranchPin))
  }
}
module.exports={registerBranchQueueDisplaySecurity}

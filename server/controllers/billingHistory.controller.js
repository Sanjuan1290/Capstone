const {readBillHistory}=require('../utils/billHistory')
exports.getHistory=async(req,res)=>{
 const id=Number(req.params.id)
 if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({message:'Select a valid bill.'})
 try{res.json(await readBillHistory(id,req.branchId))}catch(e){if(e.statusCode)return res.status(e.statusCode).json({message:e.message});throw e}
}

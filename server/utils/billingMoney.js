const fail=message=>Object.assign(new Error(message),{statusCode:400,code:'INVALID_FINANCIAL_VALUE'})
// Decimal half-up rounding using integers; money never passes through a floating sum.
function scaled(value,places=2){
 const text=String(value??0).trim(),match=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text)
 if(!match)throw fail('Enter a valid decimal amount.')
 const fraction=match[3]||'',factor=10n**BigInt(places)
 let result=BigInt(match[2])*factor+BigInt((fraction+'0'.repeat(places)).slice(0,places)||0)
 if(Number(fraction[places]||0)>=5)result++
 if(result>9007199254740991n)throw fail('Financial amount is too large.')
 return match[1]==='-'?-result:result
}
const fromCents=value=>{if(value>9007199254740991n||value< -9007199254740991n)throw fail('Financial amount is too large.');return Number(value)/100}
const cents=value=>scaled(value,2)
const divideRound=(value,divisor)=>(value+divisor/2n)/divisor
function percentage(value=0){
 if(value===''||value==null)value=0
 if(!['number','string'].includes(typeof value))throw fail('Enter a valid percentage.')
 const rate=Number(value)
 if(!Number.isFinite(rate)||rate<0||rate>100||Number(scaled(value,2))/100!==rate)throw fail('Percentage must be from 0 to 100, with at most two decimal places.')
 return rate
}
const percentOf=(amount,rate)=>divideRound(amount*scaled(percentage(rate),2),10000n)
const multiply=(amount,quantity)=>divideRound(amount*scaled(quantity,4),10000n)
module.exports={scaled,cents,fromCents,divideRound,percentage,percentOf,multiply}

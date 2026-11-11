const text=value=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):''
const first=(row,keys)=>keys.map(key=>text(row[key])).find(Boolean)||''
const looksStructured=value=>/^[\[{]/.test(value)||/^[\]}]/.test(value)

/** Read existing records without changing or guessing their medical contents. */
export function parsePrescription(value){
 let data=value
 for(let depth=0;depth<2&&typeof data==='string';depth++){
  const source=data.trim()
  if(!source||['null','undefined'].includes(source.toLowerCase()))return {kind:'empty',items:[],text:''}
  try{data=JSON.parse(source)}catch{
   return looksStructured(source)?{kind:'unavailable',items:[],text:''}:{kind:'text',items:[],text:source}
  }
 }
 if(data==null)return {kind:'empty',items:[],text:''}
 if(typeof data==='string')return looksStructured(data)?{kind:'unavailable',items:[],text:''}:{kind:'text',items:[],text:data}
 if(data&&typeof data==='object'&&!Array.isArray(data))data=data.medicines??data.prescriptions??data.items??[data]
 if(!Array.isArray(data))return {kind:'unavailable',items:[],text:''}
 const items=data.flatMap(row=>{
  if(typeof row==='string')return text(row)&&!looksStructured(row.trim())?[{medicine:row.trim()}]:[]
  if(!row||typeof row!=='object'||Array.isArray(row))return []
  const item={medicine:first(row,['medicine','medicine_name','name','drug']),dosage:first(row,['dosage','dose']),quantity:first(row,['quantity','qty']),frequency:first(row,['frequency']),duration:first(row,['duration']),notes:first(row,['notes','instructions'])}
  return Object.values(item).some(Boolean)?[item]:[]
 })
 return {kind:items.length?'items':data.length?'unavailable':'empty',items,text:''}
}

// Interoperable with client/src/utils/announcementDocument.mjs.
// The server never trusts HTML from the rich text editor.
const PREFIX = 'CARAIT_QUILL_V1:'
const safeLink = value => typeof value === 'string' && (/^https:\/\/[^\s<>"']+$/i.test(value) || /^\/(?!\/)[^\s<>"']*$/.test(value))
const parsePost = body => {
  if (typeof body !== 'string' || !body.startsWith(PREFIX)) return null
  try {
    const value=JSON.parse(body.slice(PREFIX.length))
    if (!value || !Array.isArray(value.ops) || !value.ops.length || value.ops.length>3000) return null
    for(const op of value.ops){
      if(!op || typeof op.insert!=='string' || op.insert.length>12000)return null
      for(const [key,v] of Object.entries(op.attributes||{})){
        if (['bold','italic','underline','strike'].includes(key)&&v===true)continue
        if (key==='header' && [1,2,3].includes(v))continue
        if (key==='list' && ['ordered','bullet'].includes(v))continue
        if (key==='align' && ['center','right'].includes(v))continue
        if (key==='link' && safeLink(v))continue
        return null
      }
    }
    return value.ops
  }catch{return null}
}
const readablePost = body => {
  if(typeof body !== 'string') return ''
  const ops=parsePost(body)
  return ops ? ops.map(op=>op.insert).join('').trim() : body
}
module.exports={PREFIX,parsePost,readablePost}

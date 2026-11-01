// Stored document format is a restricted Quill Delta; old Markdown posts still render unchanged.
// No HTML is stored or inserted into the page.
export const DOC_PREFIX = 'CARAIT_QUILL_V1:'
const allowed = new Set(['bold','italic','underline','strike','header','list','link','align'])
export const safeLink = href => typeof href === 'string' && (/^https:\/\/[^\s<>"']+$/i.test(href) || /^\/(?!\/)[^\s<>"']*$/.test(href))
export function cleanOps(ops) {
  if (!Array.isArray(ops) || ops.length > 3000) throw new Error('Post content is too long.')
  return ops.map(op => {
    if (!op || typeof op.insert !== 'string' || op.insert.length > 12000) throw new Error('Only plain text and formatting are supported in posts.')
    const attrs = {}
    for (const [key,val] of Object.entries(op.attributes || {})) {
      if (!allowed.has(key)) continue
      if (['bold','italic','underline','strike'].includes(key) && val === true) attrs[key]=true
      if (key === 'header' && [1,2,3].includes(val)) attrs[key]=val
      if (key === 'list' && ['bullet','ordered'].includes(val)) attrs[key]=val
      if (key === 'align' && ['center','right'].includes(val)) attrs[key]=val
      if (key === 'link' && safeLink(val)) attrs[key]=val
    }
    return Object.keys(attrs).length ? {insert:op.insert,attributes:attrs} : {insert:op.insert}
  })
}
export function documentOps(value) {
  if (typeof value !== 'string' || !value.startsWith(DOC_PREFIX)) return null
  try { const parsed=JSON.parse(value.slice(DOC_PREFIX.length)); return cleanOps(parsed.ops) }
  catch { return null }
}
export function documentText(value) {
  const ops=documentOps(value)
  return ops ? ops.map(o=>o.insert).join('').trim() : String(value||'').trim()
}
export function encodeDocument(ops) {
  const cleaned = cleanOps(ops)
  if (!cleaned.map(o=>o.insert).join('').trim()) return ''
  const value = DOC_PREFIX + JSON.stringify({ops:cleaned})
  if (value.length > 12000) throw new Error('Post text is too long. Shorten it before saving (12,000 characters maximum).')
  return value
}
// Convert legacy content to editable text without injecting HTML. Preserve original rendered
// Markdown until a user edits and saves the post. Common headings, lists, and bold/italic are mapped.
export function legacyToOps(source) {
  const lines=String(source||'').split(/\r?\n/), ops=[]
  for(const line of lines){
    let text=line, block={}
    const h=text.match(/^(#{1,3})\s+(.*)$/)
    if(h){block.header=h[1].length;text=h[2]}
    else if(/^[-*] /.test(text)){block.list='bullet';text=text.slice(2)}
    else if(/^\d+\. /.test(text)){block.list='ordered';text=text.replace(/^\d+\. /,'')}
    const pattern=/(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]]+)\]\(([^)]+)\)|==([^=]+)==|\{\{(?:color|font):[a-z]+\|([^}]+)\}\})/g
    let at=0
    for(const match of text.matchAll(pattern)){
      if(match.index>at)ops.push({insert:text.slice(at,match.index)})
      if(match[2])ops.push({insert:match[2],attributes:{bold:true}})
      else if(match[3])ops.push({insert:match[3],attributes:{italic:true}})
      else if(match[4])ops.push({insert:match[4],attributes:safeLink(match[5])?{link:match[5]}:{}})
      else if(match[6])ops.push({insert:match[6],attributes:{bold:true}})
      else if(match[7])ops.push({insert:match[7]})
      at=match.index+match[0].length
    }
    if(at<text.length)ops.push({insert:text.slice(at)})
    ops.push(Object.keys(block).length?{insert:'\n',attributes:block}:{insert:'\n'})
  }
  return cleanOps(ops)
}

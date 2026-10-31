import { useRef } from 'react'

// The announcement editor stores a small, safe Markdown subset rather than HTML.
// No HTML from patients, admins, or outside sites is inserted into the DOM.
const SAFE_COLOR = { red:'#b91c1c', blue:'#1d4ed8', green:'#047857', amber:'#b45309', purple:'#6d28d9', black:'#111827' }
const SAFE_FONT = { sans:'sans-serif', serif:'Georgia, serif', mono:'monospace' }
const linkIsSafe = value => /^(https:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(value)
const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|==([^=]+)==|\[([^\]]+)\]\(([^)]+)\)|\{\{(color|font):([a-z]+)\|([^}]+)\}\})/g
const inlineText = (text, prefix='part') => {
  const result=[];let cursor=0;let index=0
  for(const match of String(text).matchAll(INLINE)){
    if(match.index>cursor)result.push(<span key={`${prefix}-t-${index++}`}>{text.slice(cursor,match.index)}</span>)
    let node=match[0]
    if(match[2])node=<strong>{match[2]}</strong>
    else if(match[3])node=<em>{match[3]}</em>
    else if(match[4])node=<mark className="rounded bg-yellow-200 px-0.5">{match[4]}</mark>
    else if(match[5])node=linkIsSafe(match[6])?<a className="text-blue-700 underline" href={match[6]} rel="noopener noreferrer" target="_blank">{match[5]}</a>:match[5]
    else if(match[7]==='color')node=<span style={{color:SAFE_COLOR[match[8]]||SAFE_COLOR.black}}>{match[9]}</span>
    else if(match[7]==='font')node=<span style={{fontFamily:SAFE_FONT[match[8]]||SAFE_FONT.sans}}>{match[9]}</span>
    result.push(<span key={`${prefix}-m-${index++}`}>{node}</span>);cursor=match.index+match[0].length
  }
  if(cursor<text.length)result.push(<span key={`${prefix}-last`}>{text.slice(cursor)}</span>)
  return result
}
export function AnnouncementBody({ body }) {
  const lines=String(body||'').split(/\r?\n/)
  const blocks=[]
  for(let i=0;i<lines.length;){
    const line=lines[i]
    if(!line.trim()){i++;continue}
    if(/^\|.*\|$/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i+1]||'')){
      const cells=l=>l.replace(/^\||\|$/g,'').split('|').map(c=>c.trim()).slice(0,10)
      const headers=cells(line);i+=2;const rows=[]
      while(i<lines.length&&/^\|.*\|$/.test(lines[i])&&rows.length<30)rows.push(cells(lines[i++]))
      blocks.push(<div key={`table-${i}`} className="overflow-x-auto"><table className="my-3 w-full border-collapse text-sm"><thead><tr>{headers.map((h,j)=><th key={j} className="border bg-slate-50 p-2 text-left">{inlineText(h)}</th>)}</tr></thead><tbody>{rows.map((r,j)=><tr key={j}>{headers.map((_,k)=><td key={k} className="border p-2">{inlineText(r[k]||'')}</td>)}</tr>)}</tbody></table></div>);continue
    }
    const heading=line.match(/^(#{1,3})\s+(.+)$/)
    if(heading){const c=heading[1].length,Cls=c===1?'text-2xl':c===2?'text-xl':'text-lg';blocks.push(<h2 key={i} className={`mt-4 font-bold ${Cls}`}>{inlineText(heading[2],String(i))}</h2>);i++;continue}
    if(/^[-*] /.test(line)){const items=[];while(i<lines.length&&/^[-*] /.test(lines[i]))items.push(lines[i++].slice(2));blocks.push(<ul key={`ul-${i}`} className="list-disc space-y-1 pl-6">{items.map((v,j)=><li key={j}>{inlineText(v)}</li>)}</ul>);continue}
    if(/^\d+\. /.test(line)){const items=[];while(i<lines.length&&/^\d+\. /.test(lines[i]))items.push(lines[i++].replace(/^\d+\. /,''));blocks.push(<ol key={`ol-${i}`} className="list-decimal space-y-1 pl-6">{items.map((v,j)=><li key={j}>{inlineText(v)}</li>)}</ol>);continue}
    blocks.push(<p key={`p-${i}`} className="break-words leading-relaxed">{inlineText(line,String(i))}</p>);i++
  }
  return <div className="space-y-2 text-slate-700">{blocks}</div>
}
export default function AnnouncementRichText({value,onChange}) {
  const area=useRef(null)
  const modify=(before,after='',placeholder='text')=>{
    const el=area.current;if(!el)return
    const start=el.selectionStart,end=el.selectionEnd,selected=value.slice(start,end)||placeholder
    const next=value.slice(0,start)+before+selected+after+value.slice(end)
    onChange(next)
    requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+before.length,start+before.length+selected.length)})
  }
  const block=t=>{const el=area.current;const start=el?.selectionStart??value.length;const prefix=start&&value[start-1]!=='\n'?'\n':'';onChange(value.slice(0,start)+prefix+t+value.slice(start));requestAnimationFrame(()=>el?.focus())}
  const actions=[
    ['Heading','heading',()=>block('## Heading\n')],['Bold','bold',()=>modify('**','**')],['Italic','italic',()=>modify('*','*')],
    ['Link','link',()=>modify('[','](https://example.com)','link text')],['Highlight','highlight',()=>modify('==','==')],
    ['List','list',()=>block('- Item one\n- Item two\n')],['Table','table',()=>block('| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |\n')],
    ['Blue text','color',()=>modify('{{color:blue|','}}')],['Red text','color-red',()=>modify('{{color:red|','}}')],
    ['Serif font','font',()=>modify('{{font:serif|','}}')],
  ]
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 p-2" role="toolbar" aria-label="Announcement text formatting">
      {actions.map(([label,id,fn])=><button key={id} type="button" onClick={fn} className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-semibold hover:bg-slate-50" title={label}>{label}</button>)}
    </div>
    <textarea ref={area} className="form-control min-h-52 w-full font-mono text-sm" required maxLength={12000} value={value} onChange={e=>onChange(e.target.value)} placeholder="Write the details of your post" />
    <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-2 text-xs font-bold uppercase text-slate-500">Live preview</p><AnnouncementBody body={value}/></div>
  </div>
}

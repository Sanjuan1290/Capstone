import { useEffect, useRef, useState } from 'react'
import { documentOps, legacyToOps, encodeDocument } from '../../utils/announcementDocument.mjs'
import 'quill/dist/quill.snow.css'

// Quill is mounted once for each post ID. Parent rerenders do not overwrite the cursor.
export default function QuillAnnouncementEditor({value,onChange}) {
  const target=useRef(null), editor=useRef(null), changed=useRef(onChange)
  const [error,setError]=useState('')
  useEffect(()=>{changed.current=onChange},[onChange])
  useEffect(()=>{
    let cancelled=false,instance=null
    import('quill').then(({default:Quill})=>{
      if(cancelled||!target.current)return
      instance=new Quill(target.current,{
        theme:'snow',placeholder:'Write your clinic announcement here…',
        modules:{toolbar:[[{header:[false,1,2,3]}],['bold','italic','underline','strike'],[{list:'ordered'},{list:'bullet'}],[{align:[]}],['link'],['clean']]},
        formats:['header','bold','italic','underline','strike','list','align','link'],
      })
      editor.current=instance
      instance.setContents({ops:documentOps(value)||legacyToOps(value)},'silent')
      instance.on('text-change',(_d,_old,source)=>{
        if(source!=='user')return
        try{const next=encodeDocument(instance.getContents().ops);setError('');changed.current(next)}
        catch(err){setError(err.message);changed.current('')}
      })
    }).catch(()=>setError('The text editor could not load. Refresh the page and try again.'))
    return ()=>{cancelled=true;editor.current=null;if(target.current)target.current.innerHTML=''}
    // This editor intentionally mounts only when the post key changes.
  },[]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="carait-quill overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div ref={target} aria-label="Post content editor" />
    {error&&<p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>}
    <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Select text to format it. You do not need to type formatting symbols. Paste text only; embedded images are added using Cover Photo.</p>
  </div>
}

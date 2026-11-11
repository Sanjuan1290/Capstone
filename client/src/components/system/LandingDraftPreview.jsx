import { useState } from 'react'
import { createPortal } from 'react-dom'
import { LandingPageSections } from '../../pages/LandingPages/LandingPage'

// A separate viewport preserves the public site's existing responsive styles.
export default function LandingDraftPreview({content,directory,device='mobile',section}){
 const [target,setTarget]=useState(null)
 return <div className="overflow-auto bg-slate-50 p-2"><iframe title={`${device==='mobile'?'Mobile':'Desktop'} live draft preview`} className="mx-auto h-[600px] max-h-[70vh] border-0 bg-white" style={{width:device==='mobile'?'390px':'1100px',maxWidth:device==='mobile'?'100%':undefined}} srcDoc="<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head><body style='margin:0'></body></html>" onLoad={event=>{
  const doc=event.currentTarget.contentDocument
  for(const node of document.head.querySelectorAll('link[rel="stylesheet"],style'))doc.head.append(node.cloneNode(true))
  setTarget(doc.body)
 }}/>{target&&createPortal(<LandingPageSections content={content} directory={directory} preview previewSection={section}/>,target)}</div>
}

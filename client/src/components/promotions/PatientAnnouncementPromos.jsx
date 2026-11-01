import { useCallback, useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { MdArrowForward, MdRefresh } from 'react-icons/md'

// Published promotion announcements are separate from clinic_promotions (discount/eligibility records).
export default function PatientAnnouncementPromos({branchId}) {
  const [posts,setPosts]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const currentBranch=useRef(branchId)
  currentBranch.current=branchId
  const load=useCallback(async()=>{
    if(!branchId){setPosts([]);setLoading(false);return}
    setLoading(true);setError('')
    try{
      const response=await fetch(`/api/news?type=promotion&branch_id=${encodeURIComponent(branchId)}`,{credentials:'include'})
      const data=await response.json()
      if(!response.ok||!Array.isArray(data))throw Error(data?.message||'Unable to load announcements.')
      if(currentBranch.current===branchId)setPosts(data.slice(0,3))
    }catch(err){if(currentBranch.current===branchId){setError(err.message||'Unable to load announcements.');setPosts([])}}
    finally{if(currentBranch.current===branchId)setLoading(false)}
  },[branchId])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{const update=e=>{if(['promotion.updated','stream.reconnected'].includes(e.detail?.eventName))void load()};window.addEventListener('clinic:refresh',update);return()=>window.removeEventListener('clinic:refresh',update)},[load])
  if(!loading&&!error&&!posts.length)return null
  return <section className="space-y-3" aria-label="Clinic promotion announcements"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900">Clinic Promotions & Updates</h2><p className="mt-1 text-sm text-slate-500">Read published announcements from your selected branch.</p></div><Link className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-emerald-700" to="/news?type=promotion">View All <MdArrowForward/></Link></div>
    {loading?<div role="status" className="h-36 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none"/>:error?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error} <button className="font-bold underline" onClick={load}>Try Again <MdRefresh className="inline"/></button></div>:<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{posts.map(post=><article key={`${post.branch_id}-${post.id}`} className="carait-editor-card flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="aspect-[16/9] bg-gradient-to-br from-emerald-50 to-sky-50">{post.cover_image_url?<img loading="lazy" src={post.cover_image_url} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-sm font-bold text-emerald-700">CARAIT CLINIC</div>}</div><div className="flex flex-1 flex-col gap-2 p-4"><p className="text-xs font-bold uppercase text-emerald-700">Clinic Announcement</p><h3 className="text-base font-black text-slate-900">{post.title}</h3><p className="line-clamp-3 text-sm leading-6 text-slate-600">{post.caption}</p><Link to={`/news/${post.branch_id}/${post.slug}`} className="mt-auto inline-flex min-h-11 items-center gap-1 pt-3 text-sm font-bold text-emerald-700">View Offer Details <MdArrowForward/></Link></div></article>)}</div>}
  </section>
}

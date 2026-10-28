import {useEffect,useRef} from 'react'
import {clinicEventAffects,sameActiveBranch} from '../utils/clinicLiveEvents.mjs'
// Avoid tearing down the subscription when a screen changes its local state.
// Refresh *data*, not mounted form components: drafts and open dialogs are preserved.
export default function useClinicRefresh(refresh,topics=[],{skip=()=>false,fallbackMs=0}={}){
 const latest=useRef({refresh,skip})
 useEffect(()=>{latest.current={refresh,skip}},[refresh,skip])
 const key=topics.join('|')
 useEffect(()=>{
   let timer=null,inFlight=false,queued=false,last=0
   const run=()=>{
     if(document.visibilityState==='hidden'||latest.current.skip()){queued=true;return}
     if(inFlight){queued=true;return}
     inFlight=true;queued=false;last=Date.now()
     Promise.resolve().then(()=>latest.current.refresh()).catch(()=>{}).finally(()=>{inFlight=false;if(queued){queued=false;schedule()}})
   }
   const schedule=()=>{if(timer!==null)return;timer=window.setTimeout(()=>{timer=null;run()},250)}
   const onEvent=e=>{
     if(!sameActiveBranch(e.detail?.data,window.location.pathname))return
     if(clinicEventAffects(e.detail?.eventName,key.split('|')))schedule()
   }
   const onFocus=()=>{if(Date.now()-last>1000)schedule()}
   const onVisible=()=>{if(document.visibilityState==='visible')onFocus()}
   window.addEventListener('clinic:refresh',onEvent)
   window.addEventListener('focus',onFocus)
   document.addEventListener('visibilitychange',onVisible)
   const interval=fallbackMs>0?window.setInterval(()=>{if(document.visibilityState==='visible')schedule()},Math.max(30000,fallbackMs)):null
   return()=>{window.removeEventListener('clinic:refresh',onEvent);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisible);if(timer!==null)window.clearTimeout(timer);if(interval!==null)window.clearInterval(interval)}
 },[key,fallbackMs])
}



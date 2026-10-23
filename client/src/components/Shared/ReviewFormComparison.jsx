import { useState } from 'react'
import { FiAlertCircle, FiColumns, FiList, FiLock } from 'react-icons/fi'
import {
  formatSnapshotValue, humanizeKey, isPlainObject, parseSnapshotValue, sameValue,
} from '../../utils/reviewSnapshotFormat'
import ReviewSnapshotDiff from './ReviewSnapshotDiff'
import { REVIEW_FORM_TEMPLATES } from '../../utils/reviewFormTemplates'
export { REVIEW_FORM_TEMPLATES } from '../../utils/reviewFormTemplates'
import { getSavedReviewRevisions } from '../../utils/reviewRevisionHistory'


const neverShow = (key, hide) => hide?.(key) || /password|passcode|token|secret|otp|authorization|cookie|private.key|verification.code|_normalized|Normalized/i.test(key)
const asObj = (value) => { const parsed = parseSnapshotValue(value); return isPlainObject(parsed) ? parsed : {} }

const entryValue = (obj, key) => Object.hasOwn(obj, key) ? obj[key] : undefined
const displayValue = (key, value, opts) => {
  if (value === undefined) return 'Not Recorded'
  if (value === null || value === '') return 'Not Set'
  return formatSnapshotValue(key, value, opts)
}

const HistoricalField = ({ field, side, changed, opts, before, after, hide }) => {
  const value = side === 'before' ? before : after
  if (value === undefined || value === null) return <div className="min-w-0"><dt className="mb-1 text-xs font-semibold text-slate-600">{field.label}</dt><dd className="min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">{displayValue(field.key,value,opts)}</dd></div>
  if (isPlainObject(value)) {
    return <div className={`col-span-full rounded-xl border p-3 ${changed ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
      <p className="mb-3 text-xs font-bold text-slate-600">{field.label}</p>
      <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(value).filter(([key]) => !neverShow(key, hide)).map(([key, item]) =>
        <div key={key} className="min-w-0"><dt className="text-xs text-slate-500">{opts.labelFor(key)}</dt><dd className="break-words text-sm font-semibold">{displayValue(key,item,opts)}</dd></div>)}</dl>
    </div>
  }
  if (Array.isArray(value) && value.some(isPlainObject)) {
    return <div className={`col-span-full rounded-xl border p-3 ${changed ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
      <p className="mb-2 text-xs font-bold text-slate-600">{field.label} ({value.length})</p>
      <div className="max-h-64 space-y-2 overflow-y-auto">{value.slice(0, 50).map((item,index) => <div key={index} className="rounded-lg bg-slate-50 p-2"><dl className="grid gap-2 sm:grid-cols-2">{(isPlainObject(item) ? Object.entries(item) : [['value',item]]).filter(([key])=>!neverShow(key,hide)).map(([key,v]) => <div key={key}><dt className="text-xs text-slate-500">{opts.labelFor(key)}</dt><dd className="break-words text-xs font-semibold">{displayValue(key,v,opts)}</dd></div>)}</dl></div>)}{value.length > 50 ? <p className="mt-2 text-xs font-semibold text-amber-700">Showing the first 50 saved entries. No values have been changed.</p> : null}</div>
    </div>
  }
  return <div className="min-w-0">
    <dt className="mb-1 text-xs font-semibold text-slate-600">{field.label}</dt>
    <dd className={`min-h-10 break-words rounded-lg border px-3 py-2 text-sm ${changed ? 'border-amber-300 bg-amber-50 font-bold text-slate-900' : 'border-slate-200 bg-slate-50 font-semibold text-slate-800'}`}>
      {displayValue(field.key, value, opts)}
    </dd>
  </div>
}

export const buildReviewFormSections = ({ before, after, entityType, labels = {}, isHiddenField }) => {
  const template = REVIEW_FORM_TEMPLATES[entityType] || { title: 'Record Details', sections: [] }
  const availableKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key)=>!neverShow(key,isHiddenField))
  const used = new Set()
  const sections = template.sections.map(([name, fields])=>({
    name,
    fields: fields.filter(key => !neverShow(key,isHiddenField)).map(key=>{ used.add(key); return {key,label:labels[key]||humanizeKey(key)} }),
  })).filter(group=>group.fields.length)
  const remaining = availableKeys.filter(key=>!used.has(key)).map(key=>({key,label:labels[key]||humanizeKey(key)}))
  if (remaining.length) sections.push({name:template.sections.length ? 'Other Saved Details' : 'Record Details',fields:remaining})
  return {title:template.title,sections}
}

const ReviewFormComparison = ({ beforeValue, afterValue, events = [], revision = 1, actionKey = null, entityType, lookups = {}, labels = {}, isHiddenField, fieldOrder = [], listRenderers = {} }) => {
  const [mode,setMode] = useState('forms')
  const [mobileSide,setMobileSide] = useState('after')
  const [highlight,setHighlight] = useState(true)
  const [selectedRevision,setSelectedRevision] = useState('latest')
  const revisionOptions = getSavedReviewRevisions({before:beforeValue,after:afterValue,events,latestRevision:revision,actionKey})
  const chosen = selectedRevision === 'latest' ? revisionOptions[0] : revisionOptions.find(item=>item.revision===Number(selectedRevision)) || revisionOptions[0]
  const selectedBefore = chosen?.before
  const selectedAfter = chosen?.after
  // An operation marker is not a record field and has no meaningful Before.
  const before = { ...asObj(selectedBefore) }
  const after = { ...asObj(selectedAfter) }
  const performed = after.statusTransitionAction || before.statusTransitionAction || chosen?.actionKey
  const displayAction = performed ? humanizeKey(String(performed).replaceAll('.', '_')) : null
  const filterOperation = value => {
    const { statusTransitionAction, ...fields } = asObj(value)
    return value == null ? value : fields
  }
  const formBefore = filterOperation(selectedBefore)
  const formAfter = filterOperation(selectedAfter)
  delete before.statusTransitionAction
  delete after.statusTransitionAction
  const hasBefore = selectedBefore != null && selectedBefore !== ''
  const hasAfter = selectedAfter != null && selectedAfter !== ''
  const {title,sections} = buildReviewFormSections({before,after,entityType,labels,isHiddenField})
  const opts = {lookups,labelFor:(key)=>labels[key]||humanizeKey(key),isHidden:(key)=>neverShow(key,isHiddenField)}
  const comparable = (key) => Object.hasOwn(before,key) && Object.hasOwn(after,key)
  const count = sections.reduce((sum,section)=>sum + section.fields.filter(field=>comparable(field.key) && !sameValue(entryValue(before,field.key),entryValue(after,field.key))).length,0)
  const renderSide = (side) => <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
    <h4 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-black text-slate-900">{side==='before'?'Before':'After'} <span className="ml-auto text-xs font-semibold text-slate-500">Read Only</span></h4>
    {side==='before'&&!hasBefore ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">No previous values were saved with this review</p> : side==='after'&&!hasAfter ? <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">No after-values were saved with this review</p> : sections.length ? sections.map(section=><section key={section.name} className="space-y-3">
      <h5 className="text-xs font-black uppercase tracking-wide text-slate-500">{section.name}</h5>
      <dl className="grid gap-3 sm:grid-cols-2">{section.fields.map(field=><HistoricalField key={field.key} field={field} side={side} changed={highlight&&comparable(field.key)&&!sameValue(entryValue(before,field.key),entryValue(after,field.key))} before={entryValue(before,field.key)} after={entryValue(after,field.key)} opts={opts} hide={isHiddenField}/>)}</dl>
    </section>) : <p className="text-sm text-slate-500">No form values were saved with this review.</p>}
  </div>
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Before and After">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div><h3 className="text-base font-black text-slate-900">Before &amp; After</h3><p className="text-xs font-semibold text-slate-500">{title} · {count} changed {count===1?'field':'fields'}</p></div>
      <span className="flex items-center gap-1 text-xs font-bold text-slate-500"><FiLock/> Saved history</span>
    </div>
    <div className="space-y-4 p-4">
      {revisionOptions.length > 1 ? <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Saved Version
        <select value={selectedRevision} onChange={(event)=>setSelectedRevision(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold">
          <option value="latest">Latest Saved Version (Version {revisionOptions[0].revision})</option>
          {revisionOptions.slice(1).map(item=><option key={item.revision} value={item.revision}>Version {item.revision}</option>)}
        </select></label> : null}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700" aria-label="Recorded review operation">
        <p className="font-black text-slate-900">Version {chosen?.revision || 1} · {displayAction ? `Action Performed: ${displayAction}` : 'Action not recorded for this version'}</p>
        {chosen?.actor || chosen?.recordedAt ? <p className="mt-1 text-slate-600">{[chosen.actor, chosen.recordedAt].filter(Boolean).join(' · ')}</p> : null}
        {chosen?.beforeEvidence === 'prior-saved' ? <p className="mt-2 font-semibold text-amber-800">Before shows the preceding saved version, not a verified immediate pre-action snapshot. This older review did not store an individual Before image.</p> : null}
        {chosen?.followUpOnly ? <p className="mt-2 font-semibold text-blue-800">This version records a follow-up review, not a new business-record edit. The original snapshot has been carried forward.</p> : null}
        {chosen?.beforeEvidence === 'missing' ? <p className="mt-2 font-semibold text-amber-800">The original Before values for this version were not saved. They cannot be reconstructed from the current record.</p> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
          <button type="button" onClick={()=>setMode('forms')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode==='forms'?'bg-white text-blue-700 shadow-sm':'text-slate-600'}`}><FiColumns className="mr-1 inline"/> Full Form Comparison</button>
          <button type="button" onClick={()=>setMode('changes')} className={`rounded-lg px-3 py-2 text-xs font-bold ${mode==='changes'?'bg-white text-blue-700 shadow-sm':'text-slate-600'}`}><FiList className="mr-1 inline"/> Changed Fields Only</button>
        </div>
        {mode==='forms' ? <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={highlight} onChange={(event)=>setHighlight(event.target.checked)}/> Highlight Changes</label> : null}
      </div>
      {mode==='changes' ? <ReviewSnapshotDiff beforeValue={formBefore} afterValue={formAfter} lookups={lookups} labels={labels} strictSavedComparison isHiddenField={key=>key === 'statusTransitionAction' || isHiddenField?.(key)} fieldOrder={fieldOrder} listRenderers={listRenderers} mode="changes"/> : <>
        <div className="flex gap-2 sm:hidden" aria-label="Choose comparison side">
          {['before','after'].map(side=><button key={side} type="button" onClick={()=>setMobileSide(side)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold ${mobileSide===side?'border-blue-400 bg-blue-50 text-blue-700':'border-slate-200 text-slate-700'}`}>{side==='before'?'Before':'After'}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><div className={mobileSide==='after'?'hidden sm:block':'block'}>{renderSide('before')}</div><div className={mobileSide==='before'?'hidden sm:block':'block'}>{renderSide('after')}</div></div>
      </>}
      {sections.some(group=>group.fields.some(field=>!comparable(field.key))) ? <p className="flex items-center gap-2 text-xs font-semibold text-amber-800"><FiAlertCircle/> Some fields were not recorded in an older review. They have not been filled in from live data.</p> : null}
    </div>
  </section>
}

export default ReviewFormComparison




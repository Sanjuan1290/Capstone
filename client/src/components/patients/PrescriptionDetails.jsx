import { parsePrescription } from '../../utils/prescriptionDisplay.mjs'

export default function PrescriptionDetails({value,status}){
 if(status==='not_recorded')return <p className="text-sm text-slate-600">Not recorded</p>
 if(status==='none')return <p className="text-sm text-slate-600">No prescription.</p>
 const prescription=parsePrescription(value)
 if(prescription.kind==='empty')return <p className="text-sm text-slate-600">No prescription recorded.</p>
 if(prescription.kind==='unavailable')return <p className="text-sm text-slate-600">Prescription details are unavailable. Please contact the clinic for clarification.</p>
 if(prescription.kind==='text')return <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{prescription.text}</p>
 return <div className="space-y-3">{prescription.items.map((item,index)=><div key={index} className="min-w-0 border-l-2 border-slate-200 pl-3"><p className="break-words text-sm font-semibold text-slate-900">Medicine {index+1}{item.medicine?`: ${item.medicine}`:''}</p><dl className="mt-2 space-y-1 text-sm text-slate-600">{[['Dosage',item.dosage],['Quantity',item.quantity],['Frequency',item.frequency],['Duration',item.duration],['Notes',item.notes]].filter(([,value])=>value).map(([label,value])=><div key={label} className="flex min-w-0 gap-2"><dt className="shrink-0">{label}:</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl></div>)}</div>
}

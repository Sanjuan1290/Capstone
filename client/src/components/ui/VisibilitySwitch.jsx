// Accessible binary publishing control. Other multi-choice statuses stay in a select.
export default function VisibilitySwitch({ checked, onChange, label = 'Visible to patients', disabled = false }) {
  return <button type="button" role="switch" aria-checked={Boolean(checked)} aria-label={label}
    disabled={disabled} onClick={() => onChange(!checked)}
    className="inline-flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-50">
    <span aria-hidden="true" className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-150 ${checked ? 'bg-emerald-700' : 'bg-slate-300'}`}>
      <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
    <span>{label}</span>
    <span className={`text-xs ${checked ? 'text-emerald-700' : 'text-slate-500'}`}>{checked ? 'On' : 'Off'}</span>
  </button>
}

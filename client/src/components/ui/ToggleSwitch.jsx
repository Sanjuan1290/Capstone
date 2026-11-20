export default function ToggleSwitch({ checked, onChange, label, describedBy, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={Boolean(checked)}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-11 w-12 shrink-0 items-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span aria-hidden="true" className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors motion-reduce:transition-none ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

const digitsOnly = (value) => String(value || '').replace(/\D/g, '')

export const toPhilippineSubscriber = (value) => {
  let digits = digitsOnly(value)
  if (digits.startsWith('63')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

export const toPhilippineStoredPhone = (value) => {
  const subscriber = toPhilippineSubscriber(value)
  return subscriber.length === 10 ? `63${subscriber}` : value
}

export const formatPhilippinePhone = (value) => {
  const subscriber = toPhilippineSubscriber(value)
  if (subscriber.length !== 10) return value || '—'
  return `+63 ${subscriber.slice(0,3)} ${subscriber.slice(3,6)} ${subscriber.slice(6)}`
}

const PhilippinePhoneInput = ({ value, onChange, disabled = false, className = '' }) => {
  const subscriber = toPhilippineSubscriber(value)
  const handle = (e) => {
    const next = toPhilippineSubscriber(e.target.value)
    onChange?.({ target: { value: next ? `63${next}` : '' } })
  }
  return (
    <div className={`flex overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-sky-400 ${className}`}>
      <div className="flex items-center border-r border-slate-200 bg-slate-100 px-4 text-sm font-bold text-slate-500">+63</div>
      <input disabled={disabled} inputMode="numeric" value={subscriber} onChange={handle} placeholder="905 755 7640"
        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-slate-700 outline-none disabled:bg-slate-50" />
    </div>
  )
}
export default PhilippinePhoneInput




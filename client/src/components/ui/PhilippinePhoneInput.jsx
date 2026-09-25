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
  return `0${subscriber.slice(0,3)} ${subscriber.slice(3,6)} ${subscriber.slice(6)}`
}

const PhilippinePhoneInput = ({ value, onChange, disabled = false, className = '' }) => {
  const subscriber = toPhilippineSubscriber(value)
  const localDisplay = subscriber ? `0${subscriber}` : ''
  const handle = (e) => {
    const next = toPhilippineSubscriber(e.target.value)
    onChange?.({ target: { value: next ? `63${next}` : '' } })
  }

  return (
    <input
      disabled={disabled}
      type="tel"
      inputMode="numeric"
      value={localDisplay}
      onChange={handle}
      placeholder="0917 123 4567"
      className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-400 disabled:bg-slate-50 ${className}`}
    />
  )
}

export default PhilippinePhoneInput


export function followupDates(value) {
  if (!value || value.status === 'removed') return []
  return (Array.isArray(value.dates) ? value.dates : value.return_date ? [value] : [])
    .map(({ return_date, doctor_note }) => ({ return_date, doctor_note: doctor_note || '' }))
    .sort((a, b) => a.return_date.localeCompare(b.return_date))
}

export const followupPayload = value => value ? { dates: followupDates(value) } : null

export function monthDays(month) {
  const [year, number] = month.split('-').map(Number)
  const offset = new Date(year, number - 1, 1).getDay()
  const count = new Date(year, number, 0).getDate()
  return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, day) => `${month}-${String(day + 1).padStart(2, '0')}`)]
}

export function adjacentMonth(month, offset) {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(year, number - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

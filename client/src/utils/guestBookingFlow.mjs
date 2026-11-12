import { validatePatientBirthdate } from './patientBirthdate.mjs'

export const GUEST_BOOKING_STEPS = Object.freeze(['Mobile', 'Service', 'Doctor', 'Date & Time', 'Review'])
export const normalizeGuestPhone = value => {
  const digits = String(value || '').replace(/[^0-9]/g, '')
  if (/^09\d{9}$/.test(digits)) return '63' + digits.slice(1)
  return /^639\d{9}$/.test(digits) ? digits : ''
}
export const guestPatientError = patient => {
  if (!String(patient.full_name || '').trim()) return 'Enter the patient full name.'
  if (!['Male', 'Female', 'Other'].includes(patient.gender)) return 'Choose the patient gender.'
  if (patient.birthdate) {
    const error = validatePatientBirthdate(patient.birthdate)
    if (error) return error
  } else if (!/^\d{1,3}$/.test(String(patient.reported_age)) || Number(patient.reported_age) > 120) return 'Enter an age from 0 to 120, or provide a birthdate.'
  if (patient.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.email.trim())) return 'Enter a valid email address or leave it blank.'
  if (!patient.consent_given) return 'Accept the privacy notice before submitting.'
  return ''
}
export const normalizeGuestServices = services => (Array.isArray(services) ? services : []).map(service => {
  // Guest UI and API both exclude offers; registered patient bookings keep them.
  const excluded = ['current_offer', 'promotions', 'promotion', 'discount_amount', 'promotion_discount_amount']
  return Object.fromEntries(Object.entries(service).filter(([key]) => !excluded.includes(key)))
})

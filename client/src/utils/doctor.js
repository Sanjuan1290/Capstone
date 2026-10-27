export const doctorClinicLabel = (doctorOrClinicType, fallback = 'Clinic Assignment Not Set') => {
  const value = typeof doctorOrClinicType === 'string'
    ? doctorOrClinicType
    : (doctorOrClinicType?.clinic_type || doctorOrClinicType?.type || '')

  if (value === 'derma') return 'Dermatology'
  if (value === 'medical') return 'General Medicine'
  return fallback
}

export const isKnownDoctorClinicType = (value) => ['medical', 'derma'].includes(String(value || ''))


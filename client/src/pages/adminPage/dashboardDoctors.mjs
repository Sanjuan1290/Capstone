export const isDoctorAvailable = doctor => ['available', 'active', 'on-duty'].includes(String(doctor?.status || '').toLowerCase())

export const doctorDisplayName = doctor => String(doctor?.name || doctor?.full_name || 'Unnamed doctor')

export const doctorAvailabilityLabel = doctor => {
  const status = String(doctor?.status || '').toLowerCase()
  if (status === 'on-duty') return 'On duty'
  return isDoctorAvailable(doctor) ? 'Available' : 'Inactive'
}

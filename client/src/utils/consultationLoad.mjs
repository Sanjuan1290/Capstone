// Only a confirmed missing draft may initialize a blank editable consultation.
// A network, auth or schema error must never become an empty editable form.
export async function loadConsultationForEditing(load, appointmentId, appointment) {
  try {
    return await load(appointmentId)
  } catch (error) {
    if (error?.httpStatus === 404 && appointment?.id
      && Number(appointment.id) === Number(appointmentId)
      && ['confirmed', 'rescheduled', 'in-progress'].includes(appointment.status)) return null
    throw error
  }
}

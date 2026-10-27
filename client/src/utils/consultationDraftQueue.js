export function createConsultationDraftQueue({
  saveDraft,
  getAppointmentId,
  getLatestDraft,
  canSave = () => true,
  onSaving = () => {},
  onSaved = () => {},
  onError = () => {},
}) {
  let inFlight = false
  let queued = false
  let lastSavedSignature = ''
  let blockedError = null
  // Schema, auth, or validation failures cannot be fixed by repeating the same request.
  const isPermanentError = (error) => (
    ['SCHEMA_MIGRATION_REQUIRED', 'CONSULTATION_FINALIZED', 'CONSULTATION_NOT_EDITABLE',
      'VALIDATION_ERROR', 'PROGRESS_IMAGE_LIMIT', 'BOOKED_SERVICE_REQUIRED',
      'BOOKED_SERVICE_FIXED', 'SERVICE_NOT_FOUND', 'CLINICAL_IMAGE_TOKEN_INVALID']
      .includes(String(error?.code || ''))
    || [400, 401, 403, 404, 409, 422].includes(Number(error?.httpStatus))
  )

  const appointmentKey = (value) => value == null ? '' : String(value)

  function reset(_appointmentId, savedSignature = '') {
    lastSavedSignature = savedSignature
    blockedError = null
    queued = false
  }

  async function persist({ force = false } = {}) {
    const targetId = getAppointmentId()
    const targetKey = appointmentKey(targetId)
    if (!targetKey || blockedError) return false
    if (inFlight) {
      queued = true
      return false
    }

    inFlight = true
    let success = true
    try {
      let forceNext = force
      do {
        queued = false
        const current = getLatestDraft()
        if (!canSave()
          || !current?.payload
          || appointmentKey(current.appointmentId) !== targetKey
          || (!forceNext && current.signature === lastSavedSignature)) break
        forceNext = false
        onSaving(current)
        await saveDraft(targetId, current.payload)
        if (appointmentKey(getAppointmentId()) !== targetKey) break
        lastSavedSignature = current.signature
        onSaved(current)
      } while (queued || (
        appointmentKey(getLatestDraft()?.appointmentId) === targetKey
        && getLatestDraft()?.signature !== lastSavedSignature
      ))
    } catch (error) {
      success = false
      if (appointmentKey(getAppointmentId()) === targetKey) {
        if (isPermanentError(error)) blockedError = error
        onError(error, Boolean(blockedError))
      }
    } finally {
      const latest = getLatestDraft()
      const currentId = getAppointmentId()
      const resumeForChangedAppointment = queued
        && appointmentKey(currentId) !== targetKey
        && latest?.payload
        && appointmentKey(latest.appointmentId) === appointmentKey(currentId)
        && latest.signature !== lastSavedSignature
      queued = false
      inFlight = false
      if (resumeForChangedAppointment) queueMicrotask(() => { void persist() })
    }
    return success
  }

  return {
    reset,
    persist,
    getLastSavedSignature: () => lastSavedSignature,
    isSaving: () => inFlight,
    isBlocked: () => Boolean(blockedError),
    // Called explicitly after the underlying problem has been corrected.
    retryBlocked: () => { blockedError = null; return persist({ force: true }) },
  }
}



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

  const appointmentKey = (value) => value == null ? '' : String(value)

  function reset(_appointmentId, savedSignature = '') {
    lastSavedSignature = savedSignature
    queued = false
  }

  async function persist({ force = false } = {}) {
    const targetId = getAppointmentId()
    const targetKey = appointmentKey(targetId)
    if (!targetKey) return false
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
      if (appointmentKey(getAppointmentId()) === targetKey) onError(error)
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
  }
}


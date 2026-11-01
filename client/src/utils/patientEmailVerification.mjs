// Read the account verification state from the server, never from a guessed timestamp.
export const patientEmailIsVerified = (account) =>
  Boolean(String(account?.email || '').trim() && account?.email_verified_at)

export const isSamePatientAccount = (account, patientId) =>
  Boolean(account?.id != null && patientId != null && String(account.id) === String(patientId))

export const isEditingDifferentEmail = (editedEmail, savedEmail) =>
  String(editedEmail || '').trim().toLowerCase() !== String(savedEmail || '').trim().toLowerCase()

export const getVerifiedPatientAccount = (account, patientId) => {
  if (!isSamePatientAccount(account, patientId)) {
    throw new Error('The clinic could not confirm verification for this patient account. Please sign in again.')
  }
  return patientEmailIsVerified(account) ? 'verified' : 'unverified'
}

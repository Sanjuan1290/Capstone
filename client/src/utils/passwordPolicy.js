export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export const getPasswordChecks = (password = '') => {
  const value = String(password || '')
  return {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    maxLength: value.length <= PASSWORD_MAX_LENGTH,
  }
}

export const getPasswordValidationError = (password = '') => {
  const value = String(password || '')
  const checks = getPasswordChecks(value)

  if (!checks.minLength) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  if (!checks.maxLength) return 'Password is too long.'
  if (!checks.uppercase || !checks.lowercase || !checks.number) {
    return 'Password must contain uppercase, lowercase, and a number.'
  }
  return null
}

export const isPasswordValid = (password = '') => !getPasswordValidationError(password)

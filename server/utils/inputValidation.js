const makeValidationError = (message, field = null, code = 'VALIDATION_ERROR') => {
  const err = new Error(message)
  err.statusCode = 400
  err.code = code
  err.field = field || null
  err.publicMessage = message
  return err
}

const isScalarText = (value) => typeof value === 'string' || typeof value === 'number'

const normalizeText = (value, {
  field = 'Field',
  required = false,
  min = 0,
  max = 255,
  multiline = false,
  allowNumber = false,
} = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw makeValidationError(`${field} is required.`, field)
    return ''
  }
  if (typeof value !== 'string' && !(allowNumber && typeof value === 'number')) {
    throw makeValidationError(`${field} must be text.`, field)
  }
  let text = String(value).normalize('NFC').trim()
  if (text.includes('\u0000')) throw makeValidationError(`${field} contains an invalid character.`, field)
  const disallowedControl = multiline
    ? /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/
    : /[\u0000-\u001F\u007F]/
  if (disallowedControl.test(text)) throw makeValidationError(`${field} contains unsupported control characters.`, field)
  if (required && text.length < Math.max(1, min)) {
    throw makeValidationError(`${field} must be at least ${Math.max(1, min)} character${Math.max(1, min) === 1 ? '' : 's'}.`, field)
  }
  if (text.length > max) throw makeValidationError(`${field} must be ${max} characters or fewer.`, field)
  return text
}

const normalizeOptionalText = (value, options = {}) => normalizeText(value, { ...options, required: false }) || null

const normalizeNumber = (value, {
  field = 'Value',
  required = false,
  min = null,
  max = null,
  integer = false,
} = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw makeValidationError(`${field} is required.`, field)
    return null
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw makeValidationError(`${field} must be a number.`, field)
  }
  if (typeof value === 'string' && !/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) {
    throw makeValidationError(`${field} must be a valid number.`, field)
  }
  const number = Number(value)
  if (!Number.isFinite(number)) throw makeValidationError(`${field} must be a valid number.`, field)
  if (integer && !Number.isInteger(number)) throw makeValidationError(`${field} must be a whole number.`, field)
  if (min !== null && number < min) throw makeValidationError(`${field} must be at least ${min}.`, field)
  if (max !== null && number > max) throw makeValidationError(`${field} must be at most ${max}.`, field)
  return number
}

const normalizePositiveId = (value, { field = 'ID', required = false } = {}) => {
  const number = normalizeNumber(value, { field, required, min: 1, integer: true })
  return number || null
}

const assertPlainObject = (value, field = 'Request body') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw makeValidationError(`${field} must be a JSON object.`, field)
  }
  return value
}

module.exports = {
  makeValidationError,
  normalizeText,
  normalizeOptionalText,
  normalizeNumber,
  normalizePositiveId,
  assertPlainObject,
  isScalarText,
}

const {
  normalizeText,
  normalizeNumber,
  assertPlainObject,
} = require('../../utils/inputValidation')

describe('shared input validation', () => {
  it('accepts and NFC-normalizes Unicode text', () => {
    const decomposed = 'Cafe\u0301 😊'
    expect(normalizeText(decomposed, { field: 'Name', required: true, max: 50 })).toBe('Café 😊')
  })

  it('rejects object/array coercion into text', () => {
    expect(() => normalizeText(['admin'], { field: 'Name', required: true })).toThrow('Name must be text.')
    expect(() => normalizeText({ value: 'admin' }, { field: 'Name', required: true })).toThrow('Name must be text.')
  })

  it('rejects NUL/control characters and overlong values', () => {
    expect(() => normalizeText('safe\u0000unsafe', { field: 'Name', required: true })).toThrow('invalid character')
    expect(() => normalizeText('123456', { field: 'Code', max: 5 })).toThrow('5 characters or fewer')
  })

  it('accepts newlines only when multiline is enabled', () => {
    expect(() => normalizeText('line 1\nline 2', { field: 'Notes', max: 50 })).toThrow('unsupported control')
    expect(normalizeText('line 1\nline 2', { field: 'Notes', max: 50, multiline: true })).toBe('line 1\nline 2')
  })

  it('rejects malformed numeric payloads instead of coercing them', () => {
    expect(() => normalizeNumber('1 OR 1=1', { field: 'Quantity', required: true })).toThrow('valid number')
    expect(() => normalizeNumber([], { field: 'Quantity', required: true })).toThrow('must be a number')
    expect(normalizeNumber('12.5', { field: 'Quantity', required: true, min: 0 })).toBe(12.5)
  })

  it('requires a plain JSON object when expected', () => {
    expect(() => assertPlainObject([])).toThrow('must be a JSON object')
    expect(() => assertPlainObject(null)).toThrow('must be a JSON object')
    expect(assertPlainObject({ ok: true })).toEqual({ ok: true })
  })
})


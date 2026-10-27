const { validateRuntimeConfig } = require('../../utils/envValidation')

describe('runtime configuration validation', () => {
  const original = { ...process.env }

  afterEach(() => {
    process.env = { ...original }
  })

  it('rejects unsafe production configuration', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DB_HOST: 'localhost',
      DB_USER: 'clinic',
      DB_PASS: 'secret',
      DB_NAME: 'carait_clinic_system',
      JWT_SECRET: 'short',
      CLIENT_URL: 'http://localhost:5173',
      ADMIN_MFA_ENABLED: 'false',
      RESEND_API_KEY: 're_sample', EMAIL_FROM: 'CARAIT Clinic <no-reply@caraitclinic.com>',
      QUEUE_DISPLAY_PIN: '123456',
    })
    expect(() => validateRuntimeConfig()).toThrow(/JWT_SECRET|localhost/i)
  })

  it('requires Resend credentials when administrator MFA is enabled', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production', DB_HOST: 'db.internal', DB_USER: 'clinic',
      DB_PASS: 'secret', DB_NAME: 'carait_clinic_system', JWT_SECRET: 'a'.repeat(48),
      CLIENT_URL: 'https://clinic.example.com', ADMIN_MFA_ENABLED: 'true',
      QUEUE_DISPLAY_PIN: '839251', SMS_PROVIDER: 'none',
      API_PROXY_SECRET: 'p'.repeat(40), TRUST_PROXY: 'false',
      RESEND_API_KEY: '', EMAIL_FROM: '',
    })
    expect(() => validateRuntimeConfig()).toThrow(/RESEND_API_KEY/)
    process.env.RESEND_API_KEY = 're_sample'
    process.env.EMAIL_FROM = 'CARAIT Clinic <no-reply@caraitclinic.com>'
    expect(validateRuntimeConfig()).toHaveProperty('warnings')
  })

  it('accepts a complete production core configuration', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DB_HOST: 'db.internal',
      DB_USER: 'clinic',
      DB_PASS: 'secret',
      DB_NAME: 'carait_clinic_system',
      JWT_SECRET: 'a'.repeat(48),
      CLIENT_URL: 'https://clinic.example.com',
      ADMIN_MFA_ENABLED: 'false',
      RESEND_API_KEY: 're_sample', EMAIL_FROM: 'CARAIT Clinic <no-reply@caraitclinic.com>',
      QUEUE_DISPLAY_PIN: '839251',
      SMS_PROVIDER: 'none',
      API_PROXY_SECRET: 'p'.repeat(40),
      TRUST_PROXY: 'false',
    })
    expect(validateRuntimeConfig()).toHaveProperty('warnings')
  })

  it('accepts DB_PASSWORD as the deployment password name while retaining DB_PASS compatibility', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DB_HOST: 'db.internal',
      DB_USER: 'clinic',
      DB_PASSWORD: 'secret',
      DB_PASS: '',
      DB_NAME: 'carait_clinic_system',
      JWT_SECRET: 'a'.repeat(48),
      CLIENT_URL: 'https://clinic.example.com',
      ADMIN_MFA_ENABLED: 'false',
      RESEND_API_KEY: 're_sample', EMAIL_FROM: 'CARAIT Clinic <no-reply@caraitclinic.com>',
      QUEUE_DISPLAY_PIN: '839251',
      SMS_PROVIDER: 'none',
      API_PROXY_SECRET: 'p'.repeat(40),
      TRUST_PROXY: 'false',
    })
    expect(validateRuntimeConfig()).toHaveProperty('warnings')
  })

  it('requires an authenticated Pages proxy secret and rejects legacy blanket proxy trust', () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DB_HOST: 'db.internal',
      DB_USER: 'clinic',
      DB_PASS: 'secret',
      DB_NAME: 'carait_clinic_system',
      JWT_SECRET: 'a'.repeat(48),
      CLIENT_URL: 'https://clinic.example.com',
      ADMIN_MFA_ENABLED: 'false',
      RESEND_API_KEY: 're_sample', EMAIL_FROM: 'CARAIT Clinic <no-reply@caraitclinic.com>',
      QUEUE_DISPLAY_PIN: '839251',
      SMS_PROVIDER: 'none',
      TRUST_PROXY: 'true',
      API_PROXY_SECRET: 'short',
    })
    expect(() => validateRuntimeConfig()).toThrow(/API_PROXY_SECRET|TRUST_PROXY/)
    process.env.TRUST_PROXY = 'false'
    process.env.API_PROXY_SECRET = 'p'.repeat(40)
    expect(validateRuntimeConfig()).toHaveProperty('warnings')
  })
})



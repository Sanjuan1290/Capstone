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
    })
    expect(() => validateRuntimeConfig()).toThrow(/JWT_SECRET|localhost/i)
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
      SMS_PROVIDER: 'none',
    })
    expect(validateRuntimeConfig()).toHaveProperty('warnings')
  })
})

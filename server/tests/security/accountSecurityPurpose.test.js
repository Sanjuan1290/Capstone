const { createSecurityCode } = require('../../utils/accountSecurity')

describe('account security OTP purpose isolation', () => {
  it('looks up and replaces only the same OTP purpose', async () => {
    const calls = []
    const executor = {
      query: vi.fn(async (sql, params = []) => {
        calls.push({ sql: String(sql), params })
        if (String(sql).includes('AS elapsed_seconds')) return [[]]
        return [{ affectedRows: 1 }]
      }),
    }

    await createSecurityCode({
      role: 'admin',
      accountId: 7,
      purpose: 'inventory_batch_correction',
      payload: { batch_id: 12 },
      executor,
    })

    const lookup = calls.find((call) => call.sql.includes('AS elapsed_seconds'))
    const removal = calls.find((call) => call.sql.startsWith('DELETE FROM account_security_codes'))
    expect(lookup.sql).toMatch(/TIMESTAMPDIFF\s*\(\s*SECOND/i)
    expect(lookup.sql).toContain('COALESCE(last_sent_at, created_at)')
    expect(lookup.sql).toContain('NOW()')
    expect(lookup.sql).toContain('purpose = ?')
    expect(lookup.params).toEqual(['admin', 7, 'inventory_batch_correction'])
    expect(removal.sql).toContain('purpose = ?')
    expect(removal.params).toEqual(['admin', 7, 'inventory_batch_correction'])
  })

  it('enforces the resend cooldown using database elapsed seconds', async () => {
    const calls = []
    const executor = {
      query: vi.fn(async (sql) => {
        calls.push(String(sql))
        if (String(sql).includes('AS elapsed_seconds')) return [[{ elapsed_seconds: '59' }]]
        return [{ affectedRows: 1 }]
      }),
    }

    await expect(createSecurityCode({
      role: 'admin', accountId: 7, purpose: 'admin_mfa', executor,
    })).rejects.toMatchObject({
      message: 'Please wait 60 seconds before requesting another code.',
      statusCode: 429,
    })
    expect(calls.some((sql) => sql.startsWith('DELETE FROM account_security_codes'))).toBe(false)
    expect(calls.some((sql) => sql.includes('INSERT INTO account_security_codes'))).toBe(false)
  })

  it('allows resend when the database reports at least 60 seconds elapsed', async () => {
    const calls = []
    const executor = {
      query: vi.fn(async (sql) => {
        calls.push(String(sql))
        if (String(sql).includes('AS elapsed_seconds')) return [[{ elapsed_seconds: '1767' }]]
        return [{ affectedRows: 1 }]
      }),
    }

    await createSecurityCode({
      role: 'admin', accountId: 7, purpose: 'admin_mfa', executor,
    })

    expect(calls.some((sql) => sql.includes('INSERT INTO account_security_codes'))).toBe(true)
  })
})



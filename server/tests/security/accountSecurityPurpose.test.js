const { createSecurityCode } = require('../../utils/accountSecurity')

describe('account security OTP purpose isolation', () => {
  it('looks up and replaces only the same OTP purpose', async () => {
    const calls = []
    const executor = {
      query: vi.fn(async (sql, params = []) => {
        calls.push({ sql: String(sql), params })
        if (String(sql).startsWith('SELECT id, last_sent_at')) return [[]]
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

    const lookup = calls.find((call) => call.sql.startsWith('SELECT id, last_sent_at'))
    const removal = calls.find((call) => call.sql.startsWith('DELETE FROM account_security_codes'))
    expect(lookup.sql).toContain('purpose = ?')
    expect(lookup.params).toEqual(['admin', 7, 'inventory_batch_correction'])
    expect(removal.sql).toContain('purpose = ?')
    expect(removal.params).toEqual(['admin', 7, 'inventory_batch_correction'])
  })
})


const { collectBranchReportQueries, verifyBranchReportsSql } = require('../../scripts/verifyBranchReportsSql')

describe('branch Reports SQL regression checks', () => {
  it('qualifies stock expiry against the batch table, not the inventory master', async () => {
    const calls = await collectBranchReportQueries()
    expect(calls).toHaveLength(20)
    const valuation = calls.find(({ sql }) => sql.includes('batches_without_cost'))
    expect(valuation).toBeDefined()
    expect(valuation.sql).toMatch(/b\.quantity\s*>\s*0\s+AND\s+b\.expiration_date\s*<\s*\?/)
    expect(valuation.sql).toMatch(/b\.quantity\s*>\s*0\s+AND\s+b\.expiration_date\s+BETWEEN/)
  })

  it('runs read-only EXPLAIN for all report queries and catches SQL failure', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) }
    await expect(verifyBranchReportsSql(database)).resolves.toBe(20)
    expect(database.query).toHaveBeenCalledTimes(20)
    for (const [sql] of database.query.mock.calls) expect(sql).toMatch(/^EXPLAIN SELECT\b/)
    database.query.mockRejectedValueOnce(Object.assign(new Error('ambiguous column'), { code: 'ER_NON_UNIQ_ERROR' }))
    await expect(verifyBranchReportsSql(database)).rejects.toThrow('Branch Reports query 1/20 failed SQL validation')
  })
})

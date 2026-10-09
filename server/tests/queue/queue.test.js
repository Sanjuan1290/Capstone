const { isValidQueueStatus } = require('../../utils/workflowValidation')

describe('queue status rules', () => {
  it('accepts the canonical queue workflow states', () => {
    expect(['waiting', 'called', 'in_consultation', 'done', 'removed'].every(isValidQueueStatus)).toBe(true)
    expect(isValidQueueStatus('paid')).toBe(false)
  })

  it('temporarily accepts legacy in-progress requests during migration compatibility', () => {
    expect(isValidQueueStatus('in-progress')).toBe(true)
  })
})


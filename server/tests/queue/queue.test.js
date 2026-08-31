const { isValidQueueStatus } = require('../../utils/workflowValidation')

describe('queue status rules', () => {
  it('accepts only the supported queue workflow', () => {
    expect(['waiting', 'in-progress', 'done', 'removed'].every(isValidQueueStatus)).toBe(true)
    expect(isValidQueueStatus('paid')).toBe(false)
  })
})

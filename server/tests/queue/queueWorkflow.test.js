const { normalizeQueueStatus, assertQueueTransition } = require('../../utils/queueWorkflow')

describe('queue workflow state machine', () => {
  it('maps the legacy in-progress queue state to called', () => {
    expect(normalizeQueueStatus('in-progress')).toBe('called')
  })

  it('supports the patient lifecycle waiting -> called -> in_consultation -> done', () => {
    expect(() => assertQueueTransition('waiting', 'called')).not.toThrow()
    expect(() => assertQueueTransition('called', 'in_consultation')).not.toThrow()
    expect(() => assertQueueTransition('in_consultation', 'done')).not.toThrow()
  })

  it('does not allow Staff to jump a waiting patient directly to done', () => {
    expect(() => assertQueueTransition('waiting', 'done')).toThrow(/cannot move/i)
  })

  it('allows a called patient to be returned to waiting', () => {
    expect(() => assertQueueTransition('called', 'waiting')).not.toThrow()
  })
})


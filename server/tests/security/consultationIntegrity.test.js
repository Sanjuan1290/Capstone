const { assertConsultationEditable } = require('../../utils/consultationIntegrity')

describe('clinical record integrity', () => {
  it('allows draft consultation edits', () => {
    expect(() => assertConsultationEditable({ id: 1, status: 'draft' })).not.toThrow()
  })

  it('blocks silent edits to finalized consultations', () => {
    expect(() => assertConsultationEditable({ id: 1, status: 'finalized' })).toThrow(/finalized/i)
  })
})

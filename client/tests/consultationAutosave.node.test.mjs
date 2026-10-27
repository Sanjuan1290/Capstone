import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createConsultationDraftQueue } from '../src/utils/consultationDraftQueue.js'

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('existing saved draft is not written again until its signature changes', async () => {
  let appointmentId = 7
  let latest = { appointmentId: 7, signature: 'saved', payload: { notes: 'existing' } }
  const calls = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => appointmentId,
    getLatestDraft: () => latest,
    saveDraft: async (...args) => calls.push(args),
  })
  queue.reset(7, 'saved')

  assert.equal(await queue.persist(), true)
  assert.deepEqual(calls, [])
  latest = { appointmentId: 7, signature: 'edited', payload: { notes: 'edited' } }
  assert.equal(await queue.persist(), true)
  assert.deepEqual(calls, [[7, { notes: 'edited' }]])
})

test('slow writes coalesce newer edits and save the latest draft after the first response', async () => {
  let latest = { appointmentId: 11, signature: 'one', payload: { notes: 'one' } }
  const firstWrite = deferred()
  const calls = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => 11,
    getLatestDraft: () => latest,
    saveDraft: async (id, payload) => {
      calls.push([id, payload])
      if (calls.length === 1) await firstWrite.promise
    },
  })
  const pending = queue.persist()
  latest = { appointmentId: 11, signature: 'two', payload: { notes: 'two' } }
  assert.equal(await queue.persist(), false)
  latest = { appointmentId: 11, signature: 'three', payload: { notes: 'three' } }
  firstWrite.resolve()
  assert.equal(await pending, true)
  assert.deepEqual(calls, [
    [11, { notes: 'one' }],
    [11, { notes: 'three' }],
  ])
  assert.equal(queue.getLastSavedSignature(), 'three')
})

test('edits made during a slow response are saved even if a second timer did not fire', async () => {
  let latest = { appointmentId: 12, signature: 'before', payload: { notes: 'before' } }
  const firstWrite = deferred()
  const calls = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => 12,
    getLatestDraft: () => latest,
    saveDraft: async (id, payload) => {
      calls.push([id, payload])
      if (calls.length === 1) await firstWrite.promise
    },
  })
  const pending = queue.persist()
  latest = { appointmentId: 12, signature: 'after', payload: { notes: 'after' } }
  firstWrite.resolve()
  assert.equal(await pending, true)
  assert.deepEqual(calls, [
    [12, { notes: 'before' }],
    [12, { notes: 'after' }],
  ])
})

test('failed writes remain dirty and a later retry saves the draft', async () => {
  let latest = { appointmentId: 13, signature: 'dirty', payload: { notes: 'unsent' } }
  let fail = true
  const errors = []
  const calls = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => 13,
    getLatestDraft: () => latest,
    saveDraft: async (id, payload) => {
      calls.push([id, payload])
      if (fail) throw new Error('network unavailable')
    },
    onError: (error) => errors.push(error.message),
  })
  assert.equal(await queue.persist(), false)
  assert.equal(queue.getLastSavedSignature(), '')
  assert.deepEqual(errors, ['network unavailable'])
  fail = false
  assert.equal(await queue.persist(), true)
  assert.equal(queue.getLastSavedSignature(), 'dirty')
  assert.equal(calls.length, 2)
})

test('switching appointments during an in-flight save never sends the new draft to the old appointment', async () => {
  let appointmentId = 21
  let latest = { appointmentId: 21, signature: 'a', payload: { notes: 'appointment A' } }
  const firstWrite = deferred()
  const calls = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => appointmentId,
    getLatestDraft: () => latest,
    saveDraft: async (id, payload) => {
      calls.push([id, payload])
      if (id === 21) await firstWrite.promise
    },
  })
  const pending = queue.persist()
  appointmentId = 22
  queue.reset(22, '')
  latest = { appointmentId: 22, signature: 'b', payload: { notes: 'appointment B' } }
  assert.equal(await queue.persist(), false)
  firstWrite.resolve()
  await pending
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(calls, [
    [21, { notes: 'appointment A' }],
    [22, { notes: 'appointment B' }],
  ])
})

test('finalization prevents a queued draft from starting after the current save resolves', async () => {
  let latest = { appointmentId: 30, signature: 'draft-one', payload: { notes: 'draft one' } }
  let canSave = true
  const firstWrite = deferred()
  const calls = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => 30,
    getLatestDraft: () => latest,
    canSave: () => canSave,
    saveDraft: async (id, payload) => {
      calls.push([id, payload])
      if (calls.length === 1) await firstWrite.promise
    },
  })
  const pending = queue.persist()
  latest = { appointmentId: 30, signature: 'draft-two', payload: { notes: 'draft two' } }
  assert.equal(await queue.persist(), false)
  canSave = false
  firstWrite.resolve()
  assert.equal(await pending, true)
  assert.deepEqual(calls, [[30, { notes: 'draft one' }]])
  assert.equal(queue.getLastSavedSignature(), 'draft-one')
})

test('a failed save from an old appointment does not show an error on the newly selected appointment', async () => {
  let appointmentId = 41
  let latest = { appointmentId: 41, signature: 'a', payload: { notes: 'appointment A' } }
  const firstWrite = deferred()
  const errors = []
  const calls = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => appointmentId,
    getLatestDraft: () => latest,
    saveDraft: async (id, payload) => {
      calls.push([id, payload])
      if (id === 41) await firstWrite.promise
    },
    onError: (error) => errors.push(error.message),
  })
  const pending = queue.persist()
  appointmentId = 42
  queue.reset(42, '')
  latest = { appointmentId: 42, signature: 'b', payload: { notes: 'appointment B' } }
  assert.equal(await queue.persist(), false)
  firstWrite.reject(new Error('appointment A save failed'))
  assert.equal(await pending, false)
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(errors, [])
  assert.deepEqual(calls, [
    [41, { notes: 'appointment A' }],
    [42, { notes: 'appointment B' }],
  ])
})


test('schema mismatch blocks repeated autosave until manual retry and keeps draft dirty', async () => {
  const latest = { appointmentId: 63, signature: 'unsaved', payload: { prescription: 'important' } }
  let tries = 0
  const errors = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => 63,
    getLatestDraft: () => latest,
    saveDraft: async () => {
      tries++
      if (tries === 1) throw Object.assign(new Error('schema requires migration'), { code: 'SCHEMA_MIGRATION_REQUIRED', httpStatus: 503 })
    },
    onError: (error, blocked) => errors.push([error.code, blocked]),
  })
  assert.equal(await queue.persist(), false)
  assert.equal(queue.isBlocked(), true)
  assert.equal(queue.getLastSavedSignature(), '')
  for (let i = 0; i < 3; i++) assert.equal(await queue.persist(), false)
  assert.equal(tries, 1, 'do not send recurring writes on permanent failures')
  assert.deepEqual(errors, [['SCHEMA_MIGRATION_REQUIRED', true]])
  assert.equal(await queue.retryBlocked(), true)
  assert.equal(tries, 2)
  assert.equal(queue.getLastSavedSignature(), 'unsaved')
})

test('transient network failure remains eligible for automatic retry', async () => {
  const latest = { appointmentId: 64, signature: 'dirty', payload: { notes: 'a' } }
  let calls = 0
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => 64, getLatestDraft: () => latest,
    saveDraft: async () => { if (++calls === 1) throw new Error('network unavailable') },
  })
  assert.equal(await queue.persist(), false)
  assert.equal(queue.isBlocked(), false)
  assert.equal(await queue.persist(), true)
  assert.equal(queue.getLastSavedSignature(), 'dirty')
})

test('an appointment reset clears only its own blocked state', async () => {
  let id = 65
  let latest = { appointmentId: id, signature: 'one', payload: { notes: 'one' } }
  const requests = []
  const queue = createConsultationDraftQueue({
    getAppointmentId: () => id, getLatestDraft: () => latest,
    saveDraft: async (appointmentId) => {
      requests.push(appointmentId)
      if (appointmentId === 65) throw Object.assign(new Error('validation'), { httpStatus: 400 })
    },
  })
  assert.equal(await queue.persist(), false)
  assert.equal(queue.isBlocked(), true)
  id = 66
  latest = { appointmentId: id, signature: 'two', payload: { notes: 'two' } }
  queue.reset(id)
  assert.equal(queue.isBlocked(), false)
  assert.equal(await queue.persist(), true)
  assert.deepEqual(requests, [65, 66])
})

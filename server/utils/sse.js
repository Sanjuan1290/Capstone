// SSE audiences are keyed by authenticated account and physical branch.
// Never use a client-provided branch ID, or infer event ownership from an
// untrusted payload. Unscoped role broadcasts fail closed.
const sseClients = new Map()
const BRANCH_ROLES = new Set(['admin', 'staff', 'doctor'])
const validBranchId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0

const getKeysForClient = (role, userId, branchId = null) => {
  const normalized = String(role || '')
  const keys = []
  if (BRANCH_ROLES.has(normalized)) {
    if (!validBranchId(branchId)) throw new Error(`Authenticated branch required for ${normalized} SSE`)
    keys.push(`branch:${Number(branchId)}:${normalized}`)
    if (userId) keys.push(`branch:${Number(branchId)}:${normalized}_${userId}`)
  }
  // Patient events must always target a specific account, never all patients.
  if (normalized === 'superadmin') keys.push('superadmin')
  if (normalized === 'patient' && userId) keys.push(`patient_${userId}`)
  if (normalized === 'superadmin' && userId) keys.push(`superadmin_${userId}`)
  return keys
}

const registerClient = (role, userId, res, { branchId = null } = {}) => {
  const keys = getKeysForClient(role, userId, branchId)
  for (const key of keys) {
    if (!sseClients.has(key)) sseClients.set(key, new Set())
    sseClients.get(key).add(res)
  }
  return () => {
    for (const key of keys) {
      const set = sseClients.get(key)
      if (!set) continue
      set.delete(res)
      if (!set.size) sseClients.delete(key)
    }
  }
}

const writeEvent = (res, eventName, data) => {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify({ event: eventName, data })}\n\n`)
}

// branchId is trusted server-side context from the authenticated request or
// the persisted record. A role-wide event without branchId is *not delivered*.
const broadcast = (roles, eventName, data, { branchId = null } = {}) => {
  const targets = Array.isArray(roles) ? roles : [roles]
  const recipients = new Set()
  let deliverToSuper = false
  for (const target of targets.filter(Boolean).map(String)) {
    let key = target
    if (BRANCH_ROLES.has(target)) {
      if (!validBranchId(branchId)) continue
      key = `branch:${Number(branchId)}:${target}`
      deliverToSuper = true
    } else if (target === 'superadmin') {
      key = 'superadmin'
    } else if (/^(?:staff|admin|doctor)_\d+$/.test(target)) {
      if (!validBranchId(branchId)) continue
      key = `branch:${Number(branchId)}:${target}`
    } else if (!/^patient_\d+$/.test(target)) {
      continue
    }
    sseClients.get(key)?.forEach(client => recipients.add(client))
  }
  if (deliverToSuper) sseClients.get('superadmin')?.forEach(client => recipients.add(client))
  const safeData=validBranchId(branchId) && data && typeof data==='object' && !Array.isArray(data) ? {...data,branch_id:Number(branchId)} : data
  recipients.forEach(res => writeEvent(res, eventName, safeData))
  return recipients.size
}

module.exports = { sseClients, registerClient, getKeysForClient, writeEvent, broadcast }

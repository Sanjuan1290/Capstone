const sseClients = new Map()

const getKeysForClient = (role, userId) => {
  const keys = new Set()
  if (role) keys.add(String(role))
  if (role && userId) keys.add(`${role}_${userId}`)
  return [...keys]
}

const registerClient = (role, userId, res) => {
  const keys = getKeysForClient(role, userId)

  keys.forEach((key) => {
    if (!sseClients.has(key)) sseClients.set(key, new Set())
    sseClients.get(key).add(res)
  })

  return () => {
    keys.forEach((key) => {
      const set = sseClients.get(key)
      if (!set) return
      set.delete(res)
      if (set.size === 0) sseClients.delete(key)
    })
  }
}

const writeEvent = (res, eventName, data) => {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify({ event: eventName, data })}\n\n`)
}

const broadcast = (roles, eventName, data) => {
  const targets = Array.isArray(roles) ? roles : [roles]
  const recipients = new Set()

  targets.filter(Boolean).forEach((target) => {
    const set = sseClients.get(String(target))
    if (!set) return
    set.forEach((client) => recipients.add(client))
  })

  recipients.forEach((res) => writeEvent(res, eventName, data))
}

module.exports = {
  sseClients,
  registerClient,
  writeEvent,
  broadcast,
}

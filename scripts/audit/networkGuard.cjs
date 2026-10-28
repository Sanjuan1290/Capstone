'use strict'

// Loaded only by the local audit runner. Never loads the clinic's .env files.
// Fail closed if a test accidentally reaches a real database or provider.
const Module = require('node:module')
const net = require('node:net')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain)
  if (request === 'dotenv') loaded.config = () => ({ parsed: {} })
  return loaded
}
const loopback = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase())
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0]
  const host = options && typeof options === 'object' ? options.host : typeof args[1] === 'string' ? args[1] : null
  if (host && !loopback(host)) throw new Error('AUDIT_EXTERNAL_NETWORK_BLOCKED')
  return connect.apply(this, args)
}
const originalFetch = globalThis.fetch
if (originalFetch) globalThis.fetch = function (input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (!loopback(url.hostname)) return Promise.reject(new Error('AUDIT_EXTERNAL_NETWORK_BLOCKED'))
  return originalFetch(input, options)
}

'use strict'

const configuredMode = () => String(process.env.PAYMONGO_MODE || '').trim().toLowerCase()
const expectedLive = () => configuredMode() === 'live'
const supportsMode = mode => mode === 'test' || mode === 'live'
const isLiveCollectionEnabled = () => expectedLive() && process.env.PAYMONGO_LIVE_ENABLED === 'true'
const sameConfiguredMode = attempt => supportsMode(configuredMode()) && String(attempt?.mode || 'test') === configuredMode()
module.exports = { configuredMode, expectedLive, supportsMode, isLiveCollectionEnabled, sameConfiguredMode }

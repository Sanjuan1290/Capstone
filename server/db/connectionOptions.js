const fs = require('node:fs')

// Fail closed on TiDB public endpoints: TLS must not be accidentally disabled.
function createConnectionOptions(env = process.env) {
  const provider = String(env.DB_PROVIDER || 'mysql').trim().toLowerCase()
  if (!['mysql', 'tidb'].includes(provider)) throw new Error('DB_PROVIDER must be mysql or tidb.')
  const port = Number(env.DB_PORT || (provider === 'tidb' ? 4000 : 3306))
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be a valid TCP port.')
  const tlsSetting = String(env.DB_SSL || (provider === 'tidb' ? 'true' : 'false')).toLowerCase()
  if (!['true', 'false'].includes(tlsSetting)) throw new Error('DB_SSL must be true or false.')
  if (provider === 'tidb' && tlsSetting !== 'true') throw new Error('TiDB Cloud requires DB_SSL=true.')
  const ssl = tlsSetting === 'true' ? { rejectUnauthorized: true, minVersion: 'TLSv1.2' } : undefined
  if (env.DB_SSL_CA_PATH && !ssl) throw new Error('DB_SSL_CA_PATH requires DB_SSL=true.')
  if (ssl && env.DB_SSL_CA_PATH) ssl.ca = fs.readFileSync(env.DB_SSL_CA_PATH, 'utf8')
  return {
    host: env.DB_HOST,
    port,
    user: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(env.DB_POOL_SIZE || 10),
    dateStrings: true,
    timezone: /^[+-]\d{2}:\d{2}$/.test(String(env.DB_TIME_ZONE || '')) ? env.DB_TIME_ZONE : '+08:00',
    ...(ssl ? { ssl } : {}),
  }
}
module.exports = { createConnectionOptions }
